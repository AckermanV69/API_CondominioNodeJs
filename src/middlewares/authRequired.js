// middlewares/authRequired.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export const authRequired = (req, res, next) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET no configurado" });
    }

    const h = String(req.headers.authorization || "").trim();
    const [type, token] = h.split(/\s+/);

    if (!token || String(type).toLowerCase() !== "bearer") {
      return res.status(401).json({ message: "Falta token Bearer" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: Number(decoded.sub), // ✅ normalizado a number
      email: decoded.email ?? null,
      username: decoded.username ?? null,
      id_rol_id: decoded.id_rol_id ?? null,
      id_condominio_id: decoded.id_condominio_id ?? null,
      is_superuser: !!decoded.is_superuser,
      is_staff: !!decoded.is_staff,
    };

    if (!Number.isFinite(req.user.id)) {
      return res.status(401).json({ message: "Token inválido (sub)" });
    }

    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export const requireRole = (...allowed) => (req, res, next) => {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "No autenticado" });

  if (u.is_superuser) return next();

  // Flag STAFF
  if (allowed.includes("STAFF") && u.is_staff) return next();

  // Roles numéricos
  const allowedRoleIds = allowed
    .filter((x) => x !== "STAFF")
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));

  if (allowedRoleIds.length && allowedRoleIds.includes(Number(u.id_rol_id))) {
    return next();
  }

  return res.status(403).json({ message: "No autorizado" });
};

// ✅ Solo para rutas admin que dependen de condominio "activo" via header
export const requireCondominioHeader = (req, res, next) => {
  const u = req.user;
  if (!u) return res.status(401).json({ message: "No autenticado" });

  // Solo admins/staff usan condominio activo
  if (!(u.is_staff || u.is_superuser)) {
    return res.status(403).json({ message: "No autorizado" });
  }

  const raw = req.headers["x-condominio-id"];
  const condoId = Number(raw);

  if (!Number.isFinite(condoId) || condoId <= 0) {
    return res.status(400).json({
      message: "Falta header X-Condominio-Id válido",
    });
  }

  req.activeCondominioId = condoId;
  return next();
};