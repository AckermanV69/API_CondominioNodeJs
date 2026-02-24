import { pool } from "../config/db.js";

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toNum = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toBool = (v, def = false) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") return v !== 0;
  return def;
};

//
// GET /api/domicilios?condominioId=&torreId=&propietarioId=
//
export const getDomicilios = async (req, res) => {
  try {
    const condominioId = req.query.condominioId ? toInt(req.query.condominioId) : null;
    const torreId = req.query.torreId ? toInt(req.query.torreId) : null;
    const propietarioId = req.query.propietarioId ? toInt(req.query.propietarioId) : null;

    const q = await pool.query(
      `
      SELECT
        d.*,
        t.nombre_torre,
        c.nombre_condominio
      FROM domicilio d
      LEFT JOIN torre t ON t.id_torre = d.id_torre_id
      LEFT JOIN condominio c ON c.id_condominio = d.id_condominio_id
      WHERE ($1::int IS NULL OR d.id_condominio_id = $1)
        AND ($2::int IS NULL OR d.id_torre_id = $2)
        AND ($3::int IS NULL OR d.id_propietario_id = $3)
      ORDER BY d.id_domicilio ASC
      `,
      [condominioId, torreId, propietarioId]
    );

    return res.json(q.rows);
  } catch (e) {
    console.error("getDomicilios:", e);
    return res.status(500).json({ message: "Error al obtener domicilios" });
  }
};

//
// GET /api/domicilios/:id
//
export const getDomicilioById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const q = await pool.query(
      `
      SELECT
        d.*,
        t.nombre_torre,
        c.nombre_condominio
      FROM domicilio d
      LEFT JOIN torre t ON t.id_torre = d.id_torre_id
      LEFT JOIN condominio c ON c.id_condominio = d.id_condominio_id
      WHERE d.id_domicilio = $1
      LIMIT 1
      `,
      [id]
    );

    if (!q.rowCount) {
      return res.status(404).json({ message: "Domicilio no encontrado" });
    }

    return res.json(q.rows[0]);
  } catch (e) {
    console.error("getDomicilioById:", e);
    return res.status(500).json({ message: "Error al obtener domicilio" });
  }
};

//
// POST /api/domicilios
//
export const createDomicilio = async (req, res) => {
  try {
    const b = req.body || {};

    const id_torre_id = toInt(b.id_torre_id);
    if (!id_torre_id || id_torre_id <= 0) {
      return res.status(400).json({ message: "id_torre_id inválido" });
    }

    // Validar torre y obtener condominio asociado
    const tQ = await pool.query(
      `SELECT id_torre, id_condominio_id
       FROM torre
       WHERE id_torre = $1
       LIMIT 1`,
      [id_torre_id]
    );

    if (!tQ.rowCount) {
      return res.status(404).json({ message: "Torre no existe" });
    }

    const id_condominio_id = tQ.rows[0].id_condominio_id;

    const nombre_domicilio = String(b.nombre_domicilio || "").trim();
    if (!nombre_domicilio) {
      return res.status(400).json({ message: "Falta nombre_domicilio" });
    }

    const piso_domicilio = toInt(b.piso_domicilio);
    const tipo_domicilio = b.tipo_domicilio ?? null;
    const estacionamientos = toInt(b.estacionamientos);
    const alicuota_domicilio = toNum(b.alicuota_domicilio);
    const size_domicilio = b.size_domicilio ?? null;

    const id_propietario_id =
      b.id_propietario_id == null ? null : toInt(b.id_propietario_id);

    if (b.id_propietario_id != null) {
      const pQ = await pool.query(
        `SELECT 1 FROM propietario WHERE id_propietario = $1 LIMIT 1`,
        [id_propietario_id]
      );
      if (!pQ.rowCount) {
        return res.status(404).json({ message: "Propietario no existe" });
      }
    }

    const saldo = toNum(b.saldo);
    const saldo_eur = toNum(b.saldo_eur);
    const saldo_usd = toNum(b.saldo_usd);

    const estado_deuda = toBool(b.estado_deuda, false);

    const ins = await pool.query(
      `
      INSERT INTO domicilio (
        nombre_domicilio,
        piso_domicilio,
        tipo_domicilio,
        created_at,
        updated_at,
        id_torre_id,
        estacionamientos,
        alicuota_domicilio,
        size_domicilio,
        id_propietario_id,
        saldo,
        saldo_eur,
        saldo_usd,
        estado_deuda,
        id_condominio_id
      )
      VALUES (
        $1,$2,$3,
        NOW(),NOW(),
        $4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13
      )
      RETURNING *
      `,
      [
        nombre_domicilio,
        piso_domicilio,
        tipo_domicilio,
        id_torre_id,
        estacionamientos,
        alicuota_domicilio,
        size_domicilio,
        id_propietario_id,
        saldo,
        saldo_eur,
        saldo_usd,
        estado_deuda,
        id_condominio_id,
      ]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error("createDomicilio:", e);
    return res.status(500).json({
      message: "Error al crear domicilio",
      code: e.code,
      column: e.column,
      detail: e.detail,
    });
  }
};

//
// PUT /api/domicilios/:id/asignar-propietario
//
export const asignarPropietarioADomicilio = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const propietarioId = req.body?.propietarioId;
    const pid = propietarioId == null ? null : toInt(propietarioId);

    const dQ = await pool.query(
      `SELECT 1 FROM domicilio WHERE id_domicilio = $1 LIMIT 1`,
      [id]
    );
    if (!dQ.rowCount) {
      return res.status(404).json({ message: "Domicilio no existe" });
    }

    if (propietarioId != null) {
      if (!pid || pid <= 0) {
        return res.status(400).json({ message: "propietarioId inválido" });
      }

      const pQ = await pool.query(
        `SELECT 1 FROM propietario WHERE id_propietario = $1 LIMIT 1`,
        [pid]
      );
      if (!pQ.rowCount) {
        return res.status(404).json({ message: "Propietario no existe" });
      }
    }

    const up = await pool.query(
      `
      UPDATE domicilio
      SET id_propietario_id = $1,
          updated_at = NOW()
      WHERE id_domicilio = $2
      RETURNING *
      `,
      [pid, id]
    );

    return res.json(up.rows[0]);
  } catch (e) {
    console.error("asignarPropietarioADomicilio:", e);
    return res.status(500).json({ message: "Error al asignar propietario" });
  }
};

//
// PUT /api/domicilios/:id
//
export const updateDomicilio = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const b = req.body || {};

    const q = await pool.query(
      `
      UPDATE domicilio
      SET nombre_domicilio = COALESCE($1, nombre_domicilio),
          piso_domicilio = COALESCE($2, piso_domicilio),
          tipo_domicilio = COALESCE($3, tipo_domicilio),
          estacionamientos = COALESCE($4, estacionamientos),
          alicuota_domicilio = COALESCE($5, alicuota_domicilio),
          size_domicilio = COALESCE($6, size_domicilio),
          saldo = COALESCE($7, saldo),
          saldo_eur = COALESCE($8, saldo_eur),
          saldo_usd = COALESCE($9, saldo_usd),
          estado_deuda = COALESCE($10, estado_deuda),
          updated_at = NOW()
      WHERE id_domicilio = $11
      RETURNING *
      `,
      [
        b.nombre_domicilio ?? null,
        toInt(b.piso_domicilio),
        b.tipo_domicilio ?? null,
        toInt(b.estacionamientos),
        toNum(b.alicuota_domicilio),
        b.size_domicilio ?? null,
        toNum(b.saldo),
        toNum(b.saldo_eur),
        toNum(b.saldo_usd),
        b.estado_deuda,
        id,
      ]
    );

    if (!q.rowCount) {
      return res.status(404).json({ message: "Domicilio no encontrado" });
    }

    return res.json(q.rows[0]);
  } catch (e) {
    console.error("updateDomicilio:", e);
    return res.status(500).json({ message: "Error al actualizar domicilio" });
  }
};

//
// DELETE /api/domicilios/:id
//
export const deleteDomicilio = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const q = await pool.query(
      `DELETE FROM domicilio WHERE id_domicilio = $1 RETURNING id_domicilio`,
      [id]
    );

    if (!q.rowCount) {
      return res.status(404).json({ message: "Domicilio no encontrado" });
    }

    return res.json({ message: "Domicilio eliminado", id });
  } catch (e) {
    console.error("deleteDomicilio:", e);
    return res.status(500).json({ message: "Error al eliminar domicilio" });
  }
};
