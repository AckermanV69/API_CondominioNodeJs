import { Router } from 'express';
import { 
    getUnidadesUsuarioCompleto, 
    getUnidadesLibresPorCondo, 
    asignarUnidad, 
    desvincularUnidad 
} from '../controllers/unidadesController.js';

const router = Router();

router.get('/usuario-completo/:email', getUnidadesUsuarioCompleto);
router.get('/libres/:idCondo', getUnidadesLibresPorCondo);
router.get('/disponibles/:id', getUnidadesLibresPorCondo);
router.put('/asignar', asignarUnidad);
router.put('/desvincular', desvincularUnidad);

export default router;