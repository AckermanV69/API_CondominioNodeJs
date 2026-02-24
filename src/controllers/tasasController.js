// controllers/tasasController.js
import { pool } from "../config/db.js";

// Helpers
const toNumStrict = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * AUTH
 * GET /api/tasas/actual
 * Devuelve la última tasa registrada (la más reciente).
 */
export const getTasaActual = async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT
        id,
        "tasa_BCV_USD" AS tasa_BCV_USD,
        "tasa_BCV_EUR" AS tasa_BCV_EUR,
        created_at,
        updated_at
      FROM tasas_de_cambio
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT 1
    `);

    if (!q.rowCount) {
      return res.status(404).json({ message: "No hay tasas registradas" });
    }

    return res.json(q.rows[0]);
  } catch (e) {
    console.error("getTasaActual:", e);
    return res.status(500).json({ message: "Error al obtener tasa" });
  }
};

/**
 * STAFF
 * POST /api/admin/tasas
 * body: { tasa_BCV_USD, tasa_BCV_EUR }
 *
 * - Si existe algún registro, actualiza el último
 * - Si no existe, inserta uno nuevo
 */
export const upsertTasaActual = async (req, res) => {
  const usd = toNumStrict(req.body?.tasa_BCV_USD);
  const eur = toNumStrict(req.body?.tasa_BCV_EUR);

  if (!usd || usd <= 0) return res.status(400).json({ message: "tasa_BCV_USD debe ser > 0" });
  if (!eur || eur <= 0) return res.status(400).json({ message: "tasa_BCV_EUR debe ser > 0" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const lastQ = await client.query(`
      SELECT id
      FROM tasas_de_cambio
      ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `);

    let row = null;

    if (!lastQ.rowCount) {
      const ins = await client.query(
        `
        INSERT INTO tasas_de_cambio ("tasa_BCV_USD", "tasa_BCV_EUR", created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING id,
                  "tasa_BCV_USD" AS tasa_BCV_USD,
                  "tasa_BCV_EUR" AS tasa_BCV_EUR,
                  created_at, updated_at
        `,
        [usd, eur]
      );
      row = ins.rows[0];
    } else {
      const id = lastQ.rows[0].id;

      const upd = await client.query(
        `
        UPDATE tasas_de_cambio
        SET "tasa_BCV_USD" = $1,
            "tasa_BCV_EUR" = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING id,
                  "tasa_BCV_USD" AS tasa_BCV_USD,
                  "tasa_BCV_EUR" AS tasa_BCV_EUR,
                  created_at, updated_at
        `,
        [usd, eur, id]
      );
      row = upd.rows[0];
    }

    await client.query("COMMIT");
    return res.status(200).json({ message: "✅ Tasa actualizada", tasa: row });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("upsertTasaActual:", e);
    return res.status(500).json({ message: "Error al guardar tasa" });
  } finally {
    client.release();
  }
};

/**
 * ✅ Helper reutilizable:
 * Devuelve normalizado a { id, usd_bs, eur_bs, created_at, updated_at } o null
 */
export async function getUltimaTasaNormalizada(client = pool) {
  const q = await client.query(`
    SELECT
      id,
      "tasa_BCV_USD" AS usd_bs,
      "tasa_BCV_EUR" AS eur_bs,
      created_at,
      updated_at
    FROM tasas_de_cambio
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    LIMIT 1
  `);

  return q.rowCount ? q.rows[0] : null;
}