import { pool } from "../config/db.js";

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// GET /api/torres?condominioId=1
export const getTorres = async (req, res) => {
  try {
    const condominioId = req.query.condominioId ? toInt(req.query.condominioId) : null;

    const q = await pool.query(
      `
      SELECT
        t.id_torre,
        t.nombre_torre,
        t.id_condominio_id,
        c.nombre_condominio
      FROM torre t
      JOIN condominio c ON c.id_condominio = t.id_condominio_id
      WHERE ($1::int IS NULL OR t.id_condominio_id = $1)
      ORDER BY c.nombre_condominio ASC, t.nombre_torre ASC, t.id_torre ASC
      `,
      [condominioId]
    );

    return res.json(q.rows);
  } catch (e) {
    console.error("getTorres:", e);
    return res.status(500).json({ message: "Error al obtener torres" });
  }
};

// GET /api/torres/:id
export const getTorreById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ message: "ID inválido" });

    const q = await pool.query(
      `
      SELECT
        t.id_torre,
        t.nombre_torre,
        t.id_condominio_id,
        c.nombre_condominio
      FROM torre t
      JOIN condominio c ON c.id_condominio = t.id_condominio_id
      WHERE t.id_torre = $1
      LIMIT 1
      `,
      [id]
    );

    if (!q.rowCount) return res.status(404).json({ message: "Torre no encontrada" });
    return res.json(q.rows[0]);
  } catch (e) {
    console.error("getTorreById:", e);
    return res.status(500).json({ message: "Error al obtener torre" });
  }
};

// POST /api/torres
// body: { nombre_torre, id_condominio_id }
export const createTorre = async (req, res) => {
  try {
    const nombre_torre = String(req.body?.nombre_torre || "").trim();
    const condominioId = toInt(req.body?.id_condominio_id);

    if (!nombre_torre) return res.status(400).json({ message: "Falta nombre_torre" });
    if (!condominioId || condominioId <= 0) {
      return res.status(400).json({ message: "Falta id_condominio_id válido" });
    }

    const cQ = await pool.query(
      `SELECT 1 FROM condominio WHERE id_condominio = $1 LIMIT 1`,
      [condominioId]
    );
    if (!cQ.rowCount) return res.status(404).json({ message: "Condominio no existe" });

    // ✅ SIN created_at / updated_at
    const ins = await pool.query(
      `
      INSERT INTO torre (nombre_torre, id_condominio_id)
      VALUES ($1, $2)
      RETURNING id_torre, nombre_torre, id_condominio_id
      `,
      [nombre_torre, condominioId]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error("createTorre:", e);
    return res.status(500).json({ message: "Error al crear torre", code: e.code, detail: e.detail });
  }
};

// PUT /api/torres/:id
// body: { nombre_torre }
export const updateTorre = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ message: "ID inválido" });

    const nombre_torre = String(req.body?.nombre_torre || "").trim();
    if (!nombre_torre) return res.status(400).json({ message: "Falta nombre_torre" });

    // ✅ SIN updated_at
    const q = await pool.query(
      `
      UPDATE torre
      SET nombre_torre = $1
      WHERE id_torre = $2
      RETURNING id_torre, nombre_torre, id_condominio_id
      `,
      [nombre_torre, id]
    );

    if (!q.rowCount) return res.status(404).json({ message: "Torre no encontrada" });
    return res.json(q.rows[0]);
  } catch (e) {
    console.error("updateTorre:", e);
    return res.status(500).json({ message: "Error al actualizar torre" });
  }
};
