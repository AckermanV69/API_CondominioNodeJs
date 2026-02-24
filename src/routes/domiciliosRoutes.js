import { Router } from "express";
import {
  getDomicilios,
  createDomicilio,
  asignarPropietarioADomicilio,
} from "../controllers/domiciliosController.js";

const router = Router();

router.get("/", getDomicilios);
router.post("/", createDomicilio);
router.put("/:id/asignar-propietario", asignarPropietarioADomicilio);

export default router;
