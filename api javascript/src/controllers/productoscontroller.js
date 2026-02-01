import {pool} from '../config/db.js';


export const productosget =async(req, res) => {
    const {rows} = await pool.query('SELECT * FROM productos');
    res.json(rows);
}

export const productosgetid = async(req, res) => {
    try {
        const {id} = req.params;

        const {rows} = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);
        if (rows.length === 0) {
            return res.status(404).send('Producto no encontrado');
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener el producto:', error);
        res.status(500).send('Error al obtener el producto');
    }
    

}

export const productosdelete = async(req, res) => {
    const {id} = req.params;

    const {rows, rowCount} = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING *', [id]);
    if (rows.length === 0) {
        return res.status(404).send('Producto no encontrado');
    }

    console.log('Producto eliminado:', rows);
}

export const productosput = async(req, res) => {
    const {id} = req.params;
    const data = req.body;

    const {rows} = await pool.query('UPDATE productos SET nombre = $1, precio = $2, stock = $3, descripcion = $4, imagen = $5, categoria = $6 WHERE id = $7', [data.nombre, data.precio, data.stock, data.descripcion, data.imagen,data.categoria , id]);

    res.json({
        message: 'Producto actualizado',
        body: {
            producto: {nombre: data.nombre, precio: data.precio, stock: data.stock, categoria: data.categoria ,descripcion: data.descripcion, imagen: data.imagen}
        }
    });
}

export const productospost = async(req, res) => {
    try {
        const data = req.body;

        const result = await pool.query('INSERT INTO productos (nombre, precio, stock, descripcion, imagen) VALUES ($1, $2, $3, $4, $5)', [data.nombre, data.precio, data.stock, data.descripcion, data.imagen]);
        
        console.log(result);

        res.json({
            message: 'Producto creado',
            body: {
                producto: {nombre: data.nombre, precio: data.precio, stock: data.stock, descripcion: data.descripcion, imagen: data.imagen}
            }
        });
    } catch (error) {
        console.error('Error al crear el producto:', error);
        res.status(500).send('Error al crear el producto');
    }
}