// routes/movimientosRoutes.js
import { Router } from "express";
import {
  listarPendientes,
  aprobarMovimiento,
  rechazarMovimiento,
  historialMovimientosPorCorreo,
  historialMovimientosMe
} from "../controllers/movimientosController.js";

import { authRequired } from "../middlewares/authRequired.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

// admin
router.get("/pendientes", authRequired, requireRole("STAFF"), listarPendientes);
router.put("/:id/aprobar", authRequired, requireRole("STAFF"), aprobarMovimiento);
router.put("/:id/rechazar", authRequired, requireRole("STAFF"), rechazarMovimiento);

// usuario logeado
router.get("/historial/me", authRequired, historialMovimientosMe);

// usuario 
router.get("/historial", authRequired, historialMovimientosPorCorreo);

export default router;