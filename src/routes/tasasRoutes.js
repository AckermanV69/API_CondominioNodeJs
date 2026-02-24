import { Router } from "express";
import { authRequired } from "../middlewares/authRequired.js";
import { getTasaActual } from "../controllers/tasasController.js";

const router = Router();

// GET /api/tasas/actual
router.get("/actual", authRequired, getTasaActual);

export default router;