import { pool } from "../config/db.js";

const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const generarCargasMensuales = async (req, res) => {
  const b = req.body || {};

  const condominioId = toInt(b.condominioId);
  const mes = String(b.mes || "").trim(); // "YYYY-MM-DD" (idealmente 1er día del mes)
  const concepto = String(b.concepto || "").trim();
  const descripcion = String(b.descripcion || "").trim() || concepto;

  const tipo_moneda = String(b.tipo_moneda || "").trim(); // "USD" / "BS" / "EUR"
  const categoria_deuda = String(b.categoria_deuda || "CUOTA").trim(); // default
  const tipo_deuda = String(b.tipo_deuda || "MENSUAL").trim(); // default

  const usarAlicuota =
    String(b.usar_alicuota || "").toLowerCase() === "true" || b.usar_alicuota === true;

  const monto_base = toNum(b.monto_base); // modo simple
  const monto_total_mes = toNum(b.monto_total_mes); // modo alícuota

  if (!condominioId || condominioId <= 0) {
    return res.status(400).json({ message: "condominioId inválido" });
  }
  if (!isISODate(mes)) {
    return res.status(400).json({ message: "mes inválido. Usa YYYY-MM-DD (ej: 2026-02-01)" });
  }
  if (!concepto) {
    return res.status(400).json({ message: "Falta concepto" });
  }
  if (!tipo_moneda) {
    return res.status(400).json({ message: "Falta tipo_moneda (ej: USD / BS / EUR)" });
  }

  if (usarAlicuota) {
    if (monto_total_mes === null || monto_total_mes <= 0) {
      return res.status(400).json({ message: "usar_alicuota=true requiere monto_total_mes > 0" });
    }
  } else {
    if (monto_base === null || monto_base <= 0) {
      return res.status(400).json({ message: "monto_base inválido (>0)" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validar condominio existe
    const cQ = await client.query(`SELECT 1 FROM condominio WHERE id_condominio = $1 LIMIT 1`, [
      condominioId,
    ]);
    if (!cQ.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Condominio no existe" });
    }

    let insertSQL;
    let params;

    if (!usarAlicuota) {
      // ✅ MODO SIMPLE: monto fijo por domicilio
      insertSQL = `
        WITH domicilios AS (
          SELECT dom.id_domicilio
          FROM domicilio dom
          JOIN torre t ON t.id_torre = dom.id_torre_id
          WHERE t.id_condominio_id = $1
        ),
        inserted AS (
          INSERT INTO deudas (
            concepto_deuda,
            descripcion_deuda,
            monto_deuda,
            fecha_deuda,
            is_active,
            tipo_deuda,
            is_moroso,
            categoria_deuda,
            tipo_moneda,
            id_domicilio_id,
            created_at,
            updated_at
          )
          SELECT
            $3::text AS concepto_deuda,
            $4::text AS descripcion_deuda,
            $5::numeric AS monto_deuda,
            $2::date AS fecha_deuda,
            true AS is_active,
            $6::text AS tipo_deuda,
            false AS is_moroso,
            $7::text AS categoria_deuda,
            $8::text AS tipo_moneda,
            d.id_domicilio AS id_domicilio_id,
            NOW(),
            NOW()
          FROM domicilios d
          WHERE NOT EXISTS (
            SELECT 1
            FROM deudas de
            WHERE de.id_domicilio_id = d.id_domicilio
              AND de.concepto_deuda = $3::text
              AND date_trunc('month', de.fecha_deuda::date) = date_trunc('month', $2::date)
          )
          RETURNING id_deuda, id_domicilio_id
        )
        SELECT
          (SELECT COUNT(*)::int FROM domicilios) AS total_domicilios,
          (SELECT COUNT(*)::int FROM inserted) AS insertados;
      `;

      params = [
        condominioId, // $1
        mes, // $2
        concepto, // $3
        descripcion, // $4
        monto_base, // $5
        tipo_deuda, // $6
        categoria_deuda, // $7
        tipo_moneda, // $8
      ];
    } else {
      // ✅ MODO ALÍCUOTA: prorrateo por alicuota_domicilio
      insertSQL = `
        WITH domicilios AS (
          SELECT
            dom.id_domicilio,
            COALESCE(dom.alicuota_domicilio, 0)::numeric AS alicuota
          FROM domicilio dom
          JOIN torre t ON t.id_torre = dom.id_torre_id
          WHERE t.id_condominio_id = $1
        ),
        suma AS (
          SELECT COALESCE(SUM(alicuota), 0)::numeric AS sum_alicuota FROM domicilios
        ),
        inserted AS (
          INSERT INTO deudas (
            concepto_deuda,
            descripcion_deuda,
            monto_deuda,
            fecha_deuda,
            is_active,
            tipo_deuda,
            is_moroso,
            categoria_deuda,
            tipo_moneda,
            id_domicilio_id,
            created_at,
            updated_at
          )
          SELECT
            $3::text AS concepto_deuda,
            $4::text AS descripcion_deuda,
            CASE
              WHEN (SELECT sum_alicuota FROM suma) > 0
                THEN ROUND(($5::numeric * d.alicuota) / (SELECT sum_alicuota FROM suma), 2)
              ELSE 0
            END AS monto_deuda,
            $2::date AS fecha_deuda,
            true AS is_active,
            $6::text AS tipo_deuda,
            false AS is_moroso,
            $7::text AS categoria_deuda,
            $8::text AS tipo_moneda,
            d.id_domicilio AS id_domicilio_id,
            NOW(),
            NOW()
          FROM domicilios d
          WHERE NOT EXISTS (
            SELECT 1
            FROM deudas de
            WHERE de.id_domicilio_id = d.id_domicilio
              AND de.concepto_deuda = $3::text
              AND date_trunc('month', de.fecha_deuda::date) = date_trunc('month', $2::date)
          )
          RETURNING id_deuda, id_domicilio_id
        )
        SELECT
          (SELECT COUNT(*)::int FROM domicilios) AS total_domicilios,
          (SELECT COUNT(*)::int FROM inserted) AS insertados,
          (SELECT sum_alicuota FROM suma) AS sum_alicuota;
      `;

      params = [
        condominioId, // $1
        mes, // $2
        concepto, // $3
        descripcion, // $4
        monto_total_mes, // $5
        tipo_deuda, // $6
        categoria_deuda, // $7
        tipo_moneda, // $8
      ];
    }

    const r = await client.query(insertSQL, params);
    await client.query("COMMIT");

    const payload = r.rows?.[0] || {};
    return res.status(201).json({
      message: "Cargas generadas",
      filtros: {
        condominioId,
        mes,
        concepto,
        tipo_moneda,
        usar_alicuota: usarAlicuota,
      },
      resultado: payload,
      nota: "No se duplican deudas para el mismo domicilio+concepto en el mismo mes.",
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("generarCargasMensuales:", e);
    return res.status(500).json({
      message: "Error al generar cargas",
      code: e.code,
      detail: e.detail,
      hint: e.hint,
    });
  } finally {
    client.release();
  }
};
