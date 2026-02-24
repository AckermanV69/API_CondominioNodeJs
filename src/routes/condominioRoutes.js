import { Router } from "express";
import { crearCondominio, getCondominios, registrarCondominioConUnidades, getResumenCondominio, listCondominios } from "../controllers/condominioController.js";

const router = Router();

router.get("/:id", getCondominios); 
router.post("/crear", crearCondominio);
router.post("/registrar", registrarCondominioConUnidades);
router.get("/:id/resumen", getResumenCondominio);
router.get("/", listCondominios);
export default router;