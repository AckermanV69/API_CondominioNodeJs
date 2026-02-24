import { Router } from "express";
import { authRequired } from "../middlewares/authRequired.js";
import { requireRole } from "../middlewares/requireRole.js";

import { getAdminDashboard } from "../controllers/adminDashboardController.js";
import { generarCargasMensuales } from "../controllers/adminCargasController.js";
import { calcularMorosidad } from "../controllers/adminMorosidadController.js";
import { cerrarMes } from "../controllers/adminCierreMesController.js";

const router = Router();

// 🔒 todo admin protegido
router.use(authRequired, requireRole("STAFF"));

router.get("/dashboard", getAdminDashboard);
router.post("/cargas/generar", generarCargasMensuales);
router.post("/morosidad/calcular", calcularMorosidad);
router.post("/cierre-mes", cerrarMes);

export default router;
