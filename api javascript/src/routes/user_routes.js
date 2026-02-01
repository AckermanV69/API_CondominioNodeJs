import { Router } from "express";
// Importamos todas las funciones desde el controlador
import { 
    usersget, 
    usersgetid, 
    usersgetByEmail,
    usersdelete, 
    usersput, 
    loginUsuario, 
    signUpUsuario,
    updateUsuarioCondominio,
    registrarCargaComun,
    registrarCargaEspecial,
    actualizarCondominioUsuario,
    registrarCargaEspecialUnidad,
    asignarUnidadPropietario,
    desvincularUnidad,
    getEstadosConCiudades,
    asignarUnidadPorCorreo,
    vincularUnidad,
    asignarUnidad
} from '../controllers/usercontroller.js';

const router = Router();

router.put("/usuarios/update-condominio", updateUsuarioCondominio);
router.put("/usuarios/update-condominio", actualizarCondominioUsuario);
router.post("/pagos/carga-comun", registrarCargaComun);
router.post("/pagos/carga-especial", registrarCargaEspecial);
router.post("/signup", signUpUsuario);
router.post("/pagos/carga-especial-unidad", registrarCargaEspecialUnidad);
router.post("/unidades/asignar", asignarUnidadPropietario);
router.post("/unidades/desvincular", desvincularUnidad);
router.get("/unidades/usuario-completo/:correo", getUnidadesGlobalesPropietario);
router.get("/unidades/libres/:condominio_id", getUnidadesLibres);
router.get("/geografia/estados", getEstadosConCiudades);
router.put("/unidades/asignar-por-correo", asignarUnidadPorCorreo);
router.post("/unidades/vincular", vincularUnidad);
router.post("/unidades/asignar-unidad", asignarUnidad);
router.get("/users", usersget);
router.get("/users/:id", usersgetid);
router.get("/usuarios/:email", usersgetByEmail);
router.delete("/users/:id", usersdelete);
router.put("/users/:id", usersput);

router.post("/login", loginUsuario);
router.post("/signup", signUpUsuario);

export default router;
