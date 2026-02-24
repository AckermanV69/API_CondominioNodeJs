import { Router } from "express";
import { authRequired } from "../middlewares/authRequired.js";
import { requireRole } from "../middlewares/requireRole.js";
import { upsertTasaActual } from "../controllers/tasasController.js";

const router = Router();

// POST /api/admin/tasas (STAFF)
router.post("/tasas", authRequired, requireRole("STAFF"), upsertTasaActual);

export default router;