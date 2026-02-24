import { pool } from "../config/db.js";

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// GET /api/admin/usuarios/buscar?email=...
export const buscarUsuarioPorEmail = async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Falta email" });

    const q = await pool.query(
      `
      SELECT id, email, username, id_rol_id, id_condominio_id, is_active, is_staff, is_superuser
      FROM usuarios
      WHERE LOWER(email) = $1
      LIMIT 1
      `,
      [email]
    );

    if (!q.rowCount) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json(q.rows[0]);
  } catch (e) {
    console.error("buscarUsuarioPorEmail:", e);
    return res.status(500).json({ message: "Error al buscar usuario" });
  }
};

// POST /api/propietarios
export const crearPropietario = async (req, res) => {
  try {
    const b = req.body || {};

    const nombre_propietario = String(b.nombre_propietario || "").trim();
    if (!nombre_propietario) {
      return res.status(400).json({ message: "Falta nombre_propietario" });
    }

    const id_usuario_id = b.id_usuario_id == null ? null : toInt(b.id_usuario_id);
    if (b.id_usuario_id != null && (!id_usuario_id || id_usuario_id <= 0)) {
      return res.status(400).json({ message: "id_usuario_id inválido" });
    }

    // validar usuario si viene
    if (id_usuario_id != null) {
      const uQ = await pool.query(`SELECT 1 FROM usuarios WHERE id = $1 LIMIT 1`, [id_usuario_id]);
      if (!uQ.rowCount) return res.status(404).json({ message: "Usuario no existe" });

      // evitar duplicidad por usuario (si aplica)
      const dupQ = await pool.query(`SELECT 1 FROM propietario WHERE id_usuario_id = $1 LIMIT 1`, [id_usuario_id]);
      if (dupQ.rowCount) return res.status(409).json({ message: "Ese usuario ya tiene propietario asociado" });
    }

    const ins = await pool.query(
      `
      INSERT INTO propietario (
        nombre_propietario,
        genero,
        pais_residencia,
        tipo_dni,
        dni,
        codigo_tlf_hab,
        telefono_hab,
        codigo_tlf_movil,
        telefono_movil,
        created_at,
        updated_at,
        id_usuario_id
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        NOW(), NOW(),
        $10
      )
      RETURNING *
      `,
      [
        nombre_propietario,
        b.genero ?? null,
        b.pais_residencia ?? null,
        b.tipo_dni ?? null,
        b.dni ?? null,
        b.codigo_tlf_hab ?? null,
        b.telefono_hab ?? null,
        b.codigo_tlf_movil ?? null,
        b.telefono_movil ?? null,
        id_usuario_id,
      ]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error("crearPropietario:", e);
    return res.status(500).json({ message: "Error al crear propietario", code: e.code, detail: e.detail });
  }
};

// GET /api/propietarios/:id
export const getPropietarioById = async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id || id <= 0) return res.status(400).json({ message: "ID inválido" });

    const q = await pool.query(`SELECT * FROM propietario WHERE id_propietario = $1 LIMIT 1`, [id]);
    if (!q.rowCount) return res.status(404).json({ message: "Propietario no encontrado" });

    return res.json(q.rows[0]);
  } catch (e) {
    console.error("getPropietarioById:", e);
    return res.status(500).json({ message: "Error al obtener propietario" });
  }
};

// GET /api/propietarios?usuarioId=123
export const getPropietarioPorUsuario = async (req, res) => {
  try {
    const usuarioId = req.query.usuarioId ? toInt(req.query.usuarioId) : null;
    if (!usuarioId || usuarioId <= 0) return res.status(400).json({ message: "usuarioId inválido" });

    const q = await pool.query(`SELECT * FROM propietario WHERE id_usuario_id = $1 LIMIT 1`, [usuarioId]);
    if (!q.rowCount) return res.status(404).json({ message: "Propietario no encontrado" });

    return res.json(q.rows[0]);
  } catch (e) {
    console.error("getPropietarioPorUsuario:", e);
    return res.status(500).json({ message: "Error al obtener propietario" });
  }
};
