import { pool } from '../config/db.js';

// Obtener unidades vinculadas a un usuario con nombre de condominio
export const getUnidadesUsuarioCompleto = async (req, res) => {
    const { email } = req.params;
    try {
        const query = `
            SELECT 
                u.id, 
                u.nombre_unidad, 
                c.nombre AS nombre_condominio
            FROM unidades u
            JOIN condominios c ON u.condominio_id = c.id
            JOIN usuarios us ON u.usuario_id = us.id
            WHERE us.correo = $1
            ORDER BY c.nombre, u.nombre_unidad ASC;
        `;
        const result = await pool.query(query, [email]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: "Error al obtener unidades del usuario" });
    }
};

// Obtener unidades LIBRES de un condominio
// src/controllers/unidadesController.js

export const getUnidadesLibresPorCondo = async (req, res) => {
    const idCondo = req.params.idCondo || req.params.id;
    try {
        // Asegúrate de que los nombres de las columnas coincidan con tu pgAdmin
        const query = `
            SELECT id, nombre_unidad AS numero, seccion 
            FROM unidades 
            WHERE condominio_id = $1 AND usuario_id IS NULL
            ORDER BY nombre_unidad ASC;
        `;
        const result = await pool.query(query, [idCondo]);
        res.json(result.rows);
    } catch (error) {
        console.error("Error en getUnidadesLibresPorCondo:", error);
        res.status(500).json({ error: error.message });
    }
};

// 4. Asignar unidad a un usuario existente
export const asignarUnidad = async (req, res) => {
    const { usuario_id, unidad_id } = req.body;
    try {
        await pool.query('UPDATE unidades SET usuario_id = $1 WHERE id = $2', [usuario_id, unidad_id]); //
        res.json({ message: "Asignación exitosa" });
    } catch (error) {
        res.status(500).json({ message: "Error al asignar" });
    }
};

// Desvincular (Set usuario_id to NULL) - CORRECCIÓN ERROR $1
export const desvincularUnidad = async (req, res) => {
    const { unidad_id } = req.body;
    try {
        // Se pasa [unidad_id] como segundo argumento para llenar el $1
        await pool.query('UPDATE unidades SET usuario_id = NULL WHERE id = $1', [unidad_id]);
        res.json({ message: "Desvinculación exitosa" });
    } catch (error) {
        res.status(500).json({ message: "Error al desvincular" });
    }
};