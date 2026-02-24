import { Router } from "express";
import {
  generarCargaComun,
  generarCargaEspecial,
  deudasPendientes,
  marcarDeudaPagada,
} from "../controllers/deudasController.js";

const router = Router();

router.post("/carga-comun", generarCargaComun);
router.post("/carga-especial", generarCargaEspecial);
router.get("/pendientes", deudasPendientes);
router.patch("/marcar-pagada", marcarDeudaPagada);

export default router;
