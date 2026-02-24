import { Router } from "express";
import {
  buscarUsuarioPorEmail,
  crearPropietario,
  getPropietarioById,
  getPropietarioPorUsuario,
} from "../controllers/propietariosAdminController.js";

const router = Router();

// helper: buscar usuario por email
router.get("/admin/usuarios/buscar", buscarUsuarioPorEmail);

// propietarios
router.post("/propietarios", crearPropietario);
router.get("/propietarios/:id", getPropietarioById);
router.get("/propietarios", getPropietarioPorUsuario);

export default router;
