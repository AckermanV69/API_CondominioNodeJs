import {Router} from 'express';

import {productosget, 
    productosgetid, 
    productosdelete, 
    productosput, 
    productospost} from '../controllers/productoscontroller.js'

const router = Router();

router.get('/productos',productosget)

router.get('/productos/:id', productosgetid)


router.delete('/productos/:id', productosdelete)

//PUT

router.put('/productos/:id', productosput)

//POST

router.post('/productos', productospost)


export default router;
