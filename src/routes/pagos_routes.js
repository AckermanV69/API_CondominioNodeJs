import { Router } from 'express';
import { 
    registrarPago, 
    generarCargaComun, 
    generarCargaEspecial,
    generarCargaMasiva,
    historialPagos,
    unidadesPropietario
} from '../controllers/pagosController.js';

const router = Router();

router.post("/", registrarPago);
router.post("/registrar", registrarPago);
router.get("/historial", historialPagos);
router.get("/unidades/propietario/:email", unidadesPropietario);

router.post("/carga-comun", generarCargaComun);
router.post("/carga-especial", generarCargaEspecial);
router.post("/carga-masiva", generarCargaMasiva);

export default router;