import { pool } from "../config/db.js";
import crypto from "crypto";

const hashPassword = (plain) =>
  crypto.createHash("sha256").update(String(plain)).digest("hex");

const toIntStrict = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

export const crearUsuario = async (req, res) => {
  try {
    const b = req.body || {};

    const email = String(b.email || "").trim().toLowerCase();
    const username = String(b.username || "").trim();
    const password = String(b.password || "").trim();

    if (!email) return res.status(400).json({ message: "Falta email" });
    if (!username) return res.status(400).json({ message: "Falta username" });
    if (!password) return res.status(400).json({ message: "Falta password" });

    const id_rol_id = toIntStrict(b.id_rol_id);
    if (!id_rol_id || id_rol_id <= 0) {
      return res.status(400).json({ message: "Falta id_rol_id válido" });
    }

    const id_condominio_id =
      b.id_condominio_id == null ? null : toIntStrict(b.id_condominio_id);

    if (b.id_condominio_id != null && (!id_condominio_id || id_condominio_id <= 0)) {
      return res.status(400).json({ message: "id_condominio_id inválido" });
    }

    // Rol existe
    const rQ = await pool.query(
      `SELECT 1 FROM roles WHERE id_rol = $1 LIMIT 1`,
      [id_rol_id]
    );
    if (!rQ.rowCount) {
      return res.status(404).json({ message: "Rol no existe" });
    }

    // Condominio existe (si lo mandan)
    if (id_condominio_id != null) {
      const cQ = await pool.query(
        `SELECT 1 FROM condominio WHERE id_condominio = $1 LIMIT 1`,
        [id_condominio_id]
      );
      if (!cQ.rowCount) {
        return res.status(404).json({ message: "Condominio no existe" });
      }
    }

    // Duplicado email
    const dupEmail = await pool.query(
      `SELECT 1 FROM usuarios WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    if (dupEmail.rowCount) {
      return res.status(409).json({ message: "Ya existe un usuario con ese email" });
    }

    // Duplicado username (tienes unique)
    const dupUser = await pool.query(
      `SELECT 1 FROM usuarios WHERE username = $1 LIMIT 1`,
      [username]
    );
    if (dupUser.rowCount) {
      return res.status(409).json({ message: "Ya existe un usuario con ese username" });
    }

    const passStored = hashPassword(password);

    // NOT NULL en tu tabla: date_joined, last_login, is_active, is_superuser, is_staff
    const is_active = b.is_active ?? true;
    const is_superuser = b.is_superuser ?? false;
    const is_staff = b.is_staff ?? false;

    const ins = await pool.query(
      `
      INSERT INTO usuarios (
        password,
        email,
        username,
        date_joined,
        last_login,
        is_active,
        is_superuser,
        id_rol_id,
        id_condominio_id,
        is_staff
      )
      VALUES (
        $1,$2,$3,
        NOW(), NOW(),
        $4,$5,
        $6,$7,
        $8
      )
      RETURNING
        id, email, username,
        id_rol_id, id_condominio_id,
        is_active, is_staff, is_superuser,
        date_joined, last_login
      `,
      [
        passStored,
        email,
        username,
        is_active,
        is_superuser,
        id_rol_id,
        id_condominio_id,
        is_staff,
      ]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error("crearUsuario:", e);

    // Si quieres, puedes mapear códigos comunes aquí
    if (e.code === "23505") {
      return res.status(409).json({ message: "Duplicado detectado.", detail: e.detail });
    }

    return res.status(500).json({
      message: "Error al crear usuario",
      code: e.code,
      column: e.column,
      detail: e.detail,
    });
  }
};
