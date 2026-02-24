import { pool } from "../config/db.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const normalize = (v) => String(v || "").trim().toLowerCase();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

const sha256hex = (s) =>
  crypto.createHash("sha256").update(String(s), "utf8").digest("hex");

const isSha256Hex = (s) => /^[a-f0-9]{64}$/i.test(String(s || ""));

export const login = async (req, res) => {
  try {
    const identifier = normalize(req.body.email || req.body.username);
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      return res.status(400).json({ message: "Faltan credenciales" });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET no configurado" });
    }

    const q = await pool.query(
      `SELECT
         id, email, username, password,
         is_active, is_superuser, is_staff,
         id_rol_id, id_condominio_id,
         date_joined, last_login
       FROM usuarios
       WHERE LOWER(email) = $1 OR LOWER(username) = $1
       LIMIT 1`,
      [identifier]
    );

    if (!q.rowCount) return res.status(401).json({ message: "Credenciales inválidas" });

    const user = q.rows[0];
    if (!user.is_active) return res.status(403).json({ message: "Usuario inactivo" });

    const stored = String(user.password || "");
    let ok = false;
    let shouldMigrateToArgon2 = false;

    // Soporta prefijos argon2 comunes: "argon2$..." o "$argon2id$..."
    if (stored.startsWith("argon2$") || stored.startsWith("$argon2")) {
      ok = await argon2.verify(stored, password);
    } else if (isSha256Hex(stored)) {
      ok = sha256hex(password) === stored.toLowerCase();
      if (ok) shouldMigrateToArgon2 = true;
    } else {
      ok = stored === password;
      if (ok) shouldMigrateToArgon2 = true;
    }

    if (!ok) return res.status(401).json({ message: "Credenciales inválidas" });

    if (shouldMigrateToArgon2) {
      const newHash = await argon2.hash(password);
      await pool.query(`UPDATE usuarios SET password = $1 WHERE id = $2`, [
        newHash,
        user.id,
      ]);
    }

    await pool.query(`UPDATE usuarios SET last_login = NOW() WHERE id = $1`, [user.id]);

    const payload = {
      sub: user.id,
      email: user.email ?? null,
      username: user.username ?? null,
      id_rol_id: user.id_rol_id ?? null,
      id_condominio_id: user.id_condominio_id ?? null,
      is_superuser: !!user.is_superuser,
      is_staff: !!user.is_staff,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const decoded = jwt.decode(token);

    return res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: JWT_EXPIRES_IN,
      exp: decoded?.exp ?? null,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        id_rol_id: user.id_rol_id,
        id_condominio_id: user.id_condominio_id,
        is_superuser: !!user.is_superuser,
        is_staff: !!user.is_staff,
      },
    });
  } catch (e) {
    console.error("login:", e);
    return res.status(500).json({ message: "Error en login" });
  }
};

export const me = async (req, res) => {
  return res.json({ user: req.user });
};

// Stateless logout (front borra token)
export const logout = async (_req, res) => {
  return res.json({ message: "ok" });
};