import { Router } from "express";
import { authRequired } from "../middlewares/authRequired.js";
import { requireRole } from "../middlewares/requireRole.js";
import {
  getResumenPropietarioPorUsuario,
  getResumenPropietarioMe
} from "../controllers/propietariosController.js";

const router = Router();

//router.post("/", authRequired, requireRole("STAFF"), crearPropietario);

// propietario (ruta nueva)
router.get("/resumen/me", authRequired, getResumenPropietarioMe);

// admin (ruta nueva)
router.get("/resumen/:usuarioId", authRequired, requireRole("STAFF"), getResumenPropietarioPorUsuario);

router.get("/:usuarioId/resumen", authRequired, (req, res, next) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(400).json({ message: "usuarioId inválido" });
  }

  const u = req.user;
  if (!u?.id) return res.status(401).json({ message: "No autenticado" });

  const myId = Number(u.id);

  if (u.is_superuser || u.is_staff) {
    return getResumenPropietarioPorUsuario(req, res, next);
  }

  if (myId !== usuarioId) {
    return res.status(403).json({ message: "No autorizado" });
  }

  return getResumenPropietarioPorUsuario(req, res, next);
});

export default router;