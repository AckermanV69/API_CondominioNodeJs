import { pool } from "../config/db.js";
import argon2 from "argon2";

const normalizeEmail = (v) => String(v || "").trim().toLowerCase();

async function getRoleNameById(roleId) {
  try {
    if (roleId == null) return null;
    const q = await pool.query("SELECT name FROM roles WHERE id_rol = $1", [roleId]);
    if (q.rowCount) return String(q.rows[0].name || "").toLowerCase();
  } catch (e) {
    console.error("getRoleNameById error:", e);
  }
  return String(roleId ?? "");
}

// Devuelve user en formato que espera el front:
// { id, correo, nombre, rol, condominio_id, rol_id }
function mapUserForFront(row, rolNombre) {
  return {
    id: row.id,
    correo: row.email,
    nombre: row.username,
    rol: rolNombre ?? null,
    condominio_id: row.id_condominio_id ?? null,
    rol_id: row.id_rol_id ?? null,
  };
}

function isArgonHash(v) {
  return typeof v === "string" && v.startsWith("argon2$");
}

/**
 * Verifica password:
 * - si es argon2$... usa argon2.verify
 * - si es legacy plaintext (ej "mu123456") compara directo y MIGRA a argon2 al login OK
 */
async function verifyAndMaybeMigratePassword(userId, storedPassword, plainPassword) {
  const stored = String(storedPassword || "");
  const plain = String(plainPassword || "");

  if (!stored || !plain) return false;

  // Argon2 hash
  if (isArgonHash(stored)) {
    return await argon2.verify(stored, plain);
  }

  // Legacy plaintext
  const ok = stored === plain;
  if (ok) {
    try {
      const newHash = await argon2.hash(plain);
      await pool.query("UPDATE usuarios SET password = $1 WHERE id = $2", [newHash, userId]);
    } catch (e) {
      console.error("Password migration error:", e);
      // aunque falle migración, el login fue correcto
    }
  }
  return ok;
}

// -----------------------------
// CRUD básico
// -----------------------------
export const usersget = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, username, id_condominio_id, id_rol_id
       FROM usuarios
       ORDER BY id ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error("usersget error:", error);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
};

export const usersgetid = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });

    const q = await pool.query(
      `SELECT id, email, username, id_condominio_id, id_rol_id
       FROM usuarios
       WHERE id = $1`,
      [id]
    );

    if (q.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(q.rows[0]);
  } catch (error) {
    console.error("usersgetid error:", error);
    res.status(500).json({ error: "Error al obtener el usuario" });
  }
};

// Obtener usuario por correo (útil para tu front)
export const usersgetByEmail = async (req, res) => {
  try {
    const correo = normalizeEmail(req.params.email);

    const q = await pool.query(
      `SELECT id, email, username, id_condominio_id, id_rol_id
       FROM usuarios
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [correo]
    );

    if (q.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });

    const userRow = q.rows[0];
    const rolNombre = await getRoleNameById(userRow.id_rol_id);

    res.json(mapUserForFront(userRow, rolNombre));
  } catch (error) {
    console.error("usersgetByEmail error:", error);
    res.status(500).json({ error: "Error al obtener el usuario" });
  }
};

export const usersdelete = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID inválido" });

    const q = await pool.query(
      "DELETE FROM usuarios WHERE id = $1 RETURNING id, email, username, id_condominio_id, id_rol_id",
      [id]
    );

    if (q.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });

    res.json({ message: "Usuario eliminado", usuario: q.rows[0] });
  } catch (error) {
    console.error("usersdelete error:", error);
    res.status(500).json({ error: "Error al eliminar" });
  }
};

export const usersput = async (req, res) => {
  // Actualiza username/email/rol/condominio (si los mandas)
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "ID inválido" });

    const { username, nombre, email, correo, id_rol_id, id_condominio_id } = req.body;

    const nextUsername = username ?? nombre ?? null;
    const nextEmailRaw = email ?? correo ?? null;
    const nextEmail = nextEmailRaw != null ? normalizeEmail(nextEmailRaw) : null;

    const updates = [];
    const values = [];
    let i = 1;

    if (nextUsername !== null) {
      updates.push(`username = $${i++}`);
      values.push(String(nextUsername).trim());
    }

    if (nextEmail) {
      updates.push(`email = $${i++}`);
      values.push(nextEmail);
    }

    if (id_rol_id !== undefined) {
      updates.push(`id_rol_id = $${i++}`);
      values.push(id_rol_id ?? null);
    }

    if (id_condominio_id !== undefined) {
      updates.push(`id_condominio_id = $${i++}`);
      values.push(id_condominio_id ?? null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No hay datos para actualizar." });
    }

    values.push(id);

    const q = await pool.query(
      `UPDATE usuarios SET ${updates.join(", ")} WHERE id = $${i}
       RETURNING id, email, username, id_condominio_id, id_rol_id`,
      values
    );

    if (q.rowCount === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    const rolNombre = await getRoleNameById(q.rows[0].id_rol_id);

    res.json({
      message: "Usuario actualizado",
      user: mapUserForFront(q.rows[0], rolNombre),
    });
  } catch (error) {
    console.error("usersput error:", error);

    if (error.code === "23505") {
      return res.status(400).json({ message: "El correo ya está registrado." });
    }

    res.status(500).json({ error: "Error al actualizar" });
  }
};

// -----------------------------
// Login (email/username + password)
// -----------------------------
/*export const loginUsuario = async (req, res) => {
  const { correo, email, username, password } = req.body;
  const identifier = normalizeEmail(correo ?? email ?? username);

  if (!identifier || !password) {
    return res.status(400).json({ message: "Debe enviar email/correo (o username) y password." });
  }

  try {
    const q = await pool.query(
      `SELECT id, email, username, id_condominio_id, id_rol_id, password, is_active
       FROM usuarios
       WHERE LOWER(email) = $1 OR LOWER(username) = $1
       LIMIT 1`,
      [identifier]
    );

    if (q.rowCount === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    const userRow = q.rows[0];

    if (userRow.is_active === false) {
      return res.status(403).json({ message: "Usuario inactivo" });
    }

    const ok = await verifyAndMaybeMigratePassword(userRow.id, userRow.password, password);
    if (!ok) return res.status(401).json({ message: "Contraseña incorrecta" });

    const rolNombre = await getRoleNameById(userRow.id_rol_id);

    return res.status(200).json({
      message: "Login exitoso",
      user: mapUserForFront(userRow, rolNombre),
    });
  } catch (error) {
    console.error("Error en loginUsuario:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};*/

// -----------------------------
// Signup (crea usuario)
// -----------------------------
export const signUpUsuario = async (req, res) => {
  const { username, nombre, email, correo, password, id_rol_id, id_condominio_id } = req.body;

  const mail = normalizeEmail(email ?? correo);
  const userName = String(username ?? nombre ?? "").trim();

  if (!mail || !userName || !password) {
    return res.status(400).json({ message: "Faltan email/correo, username/nombre o password." });
  }

  try {
    // evitar duplicado
    const exists = await pool.query("SELECT 1 FROM usuarios WHERE LOWER(email) = $1 LIMIT 1", [mail]);
    if (exists.rowCount) {
      return res.status(400).json({ message: "El correo ya está registrado." });
    }

    // rol
    let roleIdFinal = id_rol_id ?? 2;

    // validar rol (si existe tabla roles)
    const roleCheck = await pool.query("SELECT 1 FROM roles WHERE id_rol = $1", [roleIdFinal]);
    if (roleCheck.rowCount === 0) {
      return res.status(400).json({ message: "El rol enviado no existe (id_rol_id inválido)." });
    }

    // hash con argon2
    const hash = await argon2.hash(String(password));

    const q = await pool.query(
      `INSERT INTO usuarios (email, username, id_condominio_id, id_rol_id, password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, username, id_condominio_id, id_rol_id`,
      [mail, userName, id_condominio_id ?? null, roleIdFinal, hash]
    );

    const rolNombre = await getRoleNameById(q.rows[0].id_rol_id);

    return res.status(201).json({
      message: "Usuario registrado con éxito",
      user: mapUserForFront(q.rows[0], rolNombre),
    });
  } catch (error) {
    console.error("Error en signUpUsuario:", error);

    if (error.code === "23505") {
      return res.status(400).json({ message: "El correo ya está registrado." });
    }

    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
