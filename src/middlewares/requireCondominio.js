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