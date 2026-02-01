import { Router } from "express";
import { registrarCondominio, getCondominios, getCondominiosPorAdmin } from "../controllers/condominioController.js";

const router = Router();
router.post("/registrar", registrarCondominio);
router.get("/lista", getCondominios);
router.get("/", getCondominiosPorAdmin);
//router.post("/registrar", registrarPropiedadConUnidades);

export default router;