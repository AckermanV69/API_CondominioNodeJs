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