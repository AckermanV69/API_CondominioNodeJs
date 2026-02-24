import { Router } from "express";
import { authRequired } from "../middlewares/authRequired.js";
import { registrarPago, historialPagos, pagosPendientes } from "../controllers/pagosController.js";

const router = Router();

router.post("/", authRequired, registrarPago);
router.get("/historial", authRequired, historialPagos);
router.get("/pendientes", authRequired, pagosPendientes);

export default router;