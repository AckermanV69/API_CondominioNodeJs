import { pool } from "../config/db.js";

const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const isISODate = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const cerrarMes = async (req, res) => {
  const b = req.body || {};

  const condominioId = toInt(b.condominioId);
  const mes = String(b.mes || "").trim(); // YYYY-MM-01 recomendado

  if (!condominioId || condominioId <= 0) {
    return res.status(400).json({ message: "condominioId inválido" });
  }

  if (!isISODate(mes)) {
    return res.status(400).json({
      message: "mes inválido. Usa formato YYYY-MM-DD (ej: 2026-02-01)",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validar condominio existe
    const cQ = await client.query(
      `SELECT 1 FROM condominio WHERE id_condominio = $1 LIMIT 1`,
      [condominioId]
    );

    if (!cQ.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Condominio no existe" });
    }

    // Evitar doble cierre del mismo mes
    const dupQ = await client.query(
      `
      SELECT 1
      FROM cierre_mes
      WHERE id_condominio_id = $1
        AND date_trunc('month', fecha_cierre) = date_trunc('month', $2::date)
      LIMIT 1
      `,
      [condominioId, mes]
    );

    if (dupQ.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "Este mes ya fue cerrado para este condominio",
      });
    }

    // Insertar cierre
    const insertQ = await client.query(
      `
      INSERT INTO cierre_mes (
        fecha_cierre,
        pdf_cierre,
        id_condominio_id
      )
      VALUES (
        NOW(),
        NULL,
        $1
      )
      RETURNING *
      `,
      [condominioId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Mes cerrado correctamente",
      mes,
      cierre: insertQ.rows[0],
      nota: "Este cierre solo registra el evento. El snapshot contable se calcula dinámicamente.",
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("cerrarMes:", e);
    return res.status(500).json({
      message: "Error al cerrar mes",
      code: e.code,
      detail: e.detail,
    });
  } finally {
    client.release();
  }
};
