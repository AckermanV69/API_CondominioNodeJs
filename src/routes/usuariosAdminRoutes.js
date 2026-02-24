import { Router } from "express";
import { crearUsuario } from "../controllers/usuariosAdminController.js";

const router = Router();

router.post("/admin/usuarios", crearUsuario);

export default router;
