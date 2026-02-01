import { pool } from "../config/db.js";

export const registrarCondominio = async (req, res) => {
    // Extraemos los datos que vienen del celular
    const { nombre, unidades, direccion, adminEmail, estado, ciudad } = req.body;

    try {
        // Iniciamos una transacción (opcional pero recomendado para guardar unidades y condo juntos)
        await pool.query('BEGIN');

        // 1. Insertar el condominio usando los nombres exactos de tus columnas
        const queryCondo = `
            INSERT INTO condominios (nombre, estado, ciudad, direccion, correo_administrador) 
            VALUES ($1, $2, $3, $4, $5) RETURNING id`;
        
        const valuesCondo = [nombre, estado, ciudad, direccion, adminEmail];
        const result = await pool.query(queryCondo, valuesCondo);
        const condominioId = result.rows[0].id;

        // 2. Insertar las unidades vinculadas a ese ID
        for (const unidad of unidades) {
            const queryUnidad = `
                INSERT INTO unidades (nombre_unidad, seccion, mt2, condominio_id) 
                VALUES ($1, $2, $3, $4)`;
            const nombreUnidad = unidad.numero || `${unidad.seccion || ''}-${unidad.mt2 || ''}`.trim() || 'N/A';
            await pool.query(queryUnidad, [nombreUnidad, unidad.seccion || null, unidad.mt2 || null, condominioId]);
        }

        await pool.query('COMMIT');
        res.status(201).json({ message: "Condominio y unidades registrados con éxito", id: condominioId });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("DETALLE DEL ERROR:", error);
        res.status(500).json({ error: "No se pudo registrar el condominio", detalle: error.message });
    }
};

// ESTA ES LA QUE USA TU PANTALLA SignUp (El Picker)
export const getCondominios = async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, estado, ciudad FROM condominios ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener la lista de condominios" });
    }
};

export const getCondominiosPorAdmin = async (req, res) => {
    // Extraemos el correo del administrador de los parámetros de consulta (?admin=...)
    const { admin } = req.query;

    try {
        let query = 'SELECT id, nombre, estado, ciudad FROM condominios';
        let params = [];

        // Si viene un correo, filtramos la búsqueda
        if (admin) {
            query += ' WHERE correo_administrador = $1';
            params.push(admin);
        }

        query += ' ORDER BY nombre ASC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error("Error al filtrar condominios:", error);
        res.status(500).json({ error: "Error en el servidor" });
    }
};