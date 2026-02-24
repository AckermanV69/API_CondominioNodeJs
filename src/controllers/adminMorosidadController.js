import { pool } from "../config/db.js";

const toIntOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const isISODate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const calcularMorosidad = async (req, res) => {
  const condominioId = toIntOrNull(req.query.condominioId);
  const corte = String(req.query.corte || "").trim();
  const dias = Number(req.query.dias ?? 10);

  const corteFinal = corte && isISODate(corte) ? corte : null;
  const diasFinal = Number.isFinite(dias) && dias >= 0 ? dias : 10;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fecha parseada desde VARCHAR (tolera YYYY-MM y YYYY-MM-DD)
    const fechaParse = `
      CASE
        WHEN de.fecha_deuda ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN de.fecha_deuda::date
        WHEN de.fecha_deuda ~ '^\\d{4}-\\d{2}$' THEN (de.fecha_deuda || '-01')::date
        ELSE NULL
      END
    `;

    const marcarSQL = `
      UPDATE deudas de
      SET is_moroso = true,
          updated_at = NOW()
      FROM domicilio dom
      JOIN torre t ON t.id_torre = dom.id_torre_id
      WHERE de.id_domicilio_id = dom.id_domicilio
        AND de.is_active = true
        AND (${fechaParse}) IS NOT NULL
        AND (${fechaParse}) <= (COALESCE($2::date, CURRENT_DATE) - ($3::int * INTERVAL '1 day'))
        AND ($1::int IS NULL OR t.id_condominio_id = $1)
      RETURNING de.id_deuda;
    `;

    const desmarcarSQL = `
      UPDATE deudas de
      SET is_moroso = false,
          updated_at = NOW()
      FROM domicilio dom
      JOIN torre t ON t.id_torre = dom.id_torre_id
      WHERE de.id_domicilio_id = dom.id_domicilio
        AND de.is_active = true
        AND (${fechaParse}) IS NOT NULL
        AND (${fechaParse}) > (COALESCE($2::date, CURRENT_DATE) - ($3::int * INTERVAL '1 day'))
        AND ($1::int IS NULL OR t.id_condominio_id = $1)
      RETURNING de.id_deuda;
    `;

    const [marcadas, desmarcadas] = await Promise.all([
      client.query(marcarSQL, [condominioId, corteFinal, diasFinal]),
      client.query(desmarcarSQL, [condominioId, corteFinal, diasFinal]),
    ]);

    await client.query("COMMIT");

    return res.json({
      filtros: { condominioId, corte: corteFinal ?? "CURRENT_DATE", dias: diasFinal },
      morosas_marcadas: marcadas.rowCount,
      morosas_desmarcadas: desmarcadas.rowCount,
      nota: "Solo se procesan deudas con fecha_deuda en formato YYYY-MM-DD o YYYY-MM.",
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("calcularMorosidad:", e);
    return res.status(500).json({
      message: "Error al calcular morosidad",
      code: e.code,
      detail: e.detail,
      hint: e.hint,
    });
  } finally {
    client.release();
  }
};
