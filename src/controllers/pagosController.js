import { pool } from "../config/db.js";

export const registrarPago = async (req, res) => {
    const { telefono, referencias, referencia, cedula, monto, fecha, correo, email, banco } = req.body;
    const mail = (correo || email || '').trim().toLowerCase();
    const ref = (referencias || referencia || '').trim();

    if (!mail || !ref || !monto) {
        return res.status(400).json({ message: "Faltan correo, referencia o monto." });
    }

    try {
        const result = await pool.query(
            `INSERT INTO pagos (usuario_email, telefono, referencia, cedula, monto, fecha_pago, banco, estado) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente') RETURNING *`,
            [mail, (telefono || '').trim(), ref, (cedula || '').trim(), parseFloat(monto), fecha || null, banco || null]
        );

        res.status(201).json({
            message: "Pago registrado exitosamente",
            pago: result.rows[0]
        });
    } catch (error) {
        console.error("Error al registrar pago:", error);
        
        // Manejo de referencia duplicada
        if (error.code === '23505') {
            return res.status(400).json({ message: "Este número de referencia ya fue registrado anteriormente." });
        }

        res.status(500).json({ message: "Error interno al procesar el pago" });
    }
};

// CARGA COMÚN: Para todos los del edificio (frontend: condominio, monto, descripcion, tipo)
export const generarCargaComun = async (req, res) => {
    const { condominio, nombreCondominio, monto, descripcion, tipo } = req.body;
    const nombreCondo = (condominio || nombreCondominio || '').trim();
    if (!nombreCondo || !monto || monto <= 0) {
        return res.status(400).json({ message: "Faltan condominio o monto válido." });
    }
    try {
        const condo = await pool.query(
            "SELECT id FROM condominios WHERE nombre = $1",
            [nombreCondo]
        );
        if (condo.rows.length === 0) {
            return res.status(404).json({ message: "Condominio no encontrado." });
        }
        const condominioId = condo.rows[0].id;

        const usuarios = await pool.query(
            `SELECT DISTINCT u.id, u.condominio_id 
             FROM usuarios u 
             JOIN condominios c ON u.condominio_id = c.id 
             WHERE c.nombre = $1
             UNION
             SELECT DISTINCT us.id, un.condominio_id
             FROM unidades un
             JOIN usuarios us ON un.usuario_id = us.id
             JOIN condominios c ON c.id = un.condominio_id
             WHERE c.nombre = $1`,
            [nombreCondo, nombreCondo]
        );

        if (usuarios.rows.length === 0) {
            return res.status(404).json({ message: "No hay propietarios en este condominio." });
        }

        const promesas = usuarios.rows.map(user => {
            return pool.query(
                `INSERT INTO pagos (usuario_id, condominio_id, monto, descripcion, tipo_pago, estado) 
                 VALUES ($1, $2, $3, $4, $5, 'pendiente')`,
                [user.id, condominioId, parseFloat(monto), descripcion || null, tipo || 'mensualidad']
            );
        });
        await Promise.all(promesas);
        res.status(201).json({ message: `Carga generada para ${usuarios.rows.length} propietarios.` });
    } catch (error) {
        console.error("generarCargaComun:", error);
        res.status(500).json({ error: error.message });
    }
};

export const generarCargaMasiva = async (req, res) => {
    const { condominio, monto, descripcion, tipo } = req.body;

    try {
        // 1. Buscamos a todos los usuarios vinculados a ese condominio
        const usuarios = await pool.query(
            `SELECT u.id, u.condominio_id 
             FROM usuarios u 
             JOIN condominios c ON u.condominio_id = c.id 
             WHERE c.nombre = $1`, 
            [condominio]
        );

        if (usuarios.rows.length === 0) {
            return res.status(404).json({ message: "No hay propietarios registrados en este edificio." });
        }

        const condominioId = usuarios.rows[0].condominio_id;

        // 2. Insertamos el pago para cada usuario encontrado
        // Usamos una promesa múltiple para mayor velocidad
        const promesas = usuarios.rows.map(user => {
            return pool.query(
                `INSERT INTO pagos (usuario_id, condominio_id, monto, descripcion, tipo_pago, estado) 
                 VALUES ($1, $2, $3, $4, $5, 'pendiente')`,
                [user.id, condominioId, monto, descripcion, tipo]
            );
        });

        await Promise.all(promesas);

        res.status(201).json({ 
            message: `Carga de tipo ${tipo} realizada a ${usuarios.rows.length} usuarios.` 
        });

    } catch (error) {
        console.error("Error en carga masiva:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

export const generarCargaEspecial = async (req, res) => {
    const { correo, monto, descripcion, tipo, unidad_id } = req.body;
    const mail = (correo || '').trim().toLowerCase();
    if (!mail || !monto || monto <= 0) {
        return res.status(400).json({ message: "Faltan correo o monto válido." });
    }

    try {
        const usuarioQuery = await pool.query(
            "SELECT id, condominio_id FROM usuarios WHERE correo = $1",
            [mail]
        );
        if (usuarioQuery.rowCount === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }
        const { id, condominio_id } = usuarioQuery.rows[0];

        let nombreUnidad = null;
        if (unidad_id) {
            const un = await pool.query(
                "SELECT nombre_unidad FROM unidades WHERE id = $1 AND usuario_id = $2",
                [unidad_id, id]
            );
            if (un.rows.length) nombreUnidad = un.rows[0].nombre_unidad;
        }

        await pool.query(
            `INSERT INTO pagos (usuario_id, condominio_id, monto, descripcion, tipo_pago, estado, nombre_unidad) 
             VALUES ($1, $2, $3, $4, $5, 'pendiente', $6)`,
            [id, condominio_id, parseFloat(monto), descripcion || null, tipo || 'especial', nombreUnidad]
        );

        res.status(201).json({ message: "Carga individual realizada con éxito" });
    } catch (error) {
        console.error("Error en carga especial:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

// GET /pagos/historial?correo=... (Frontend: Firstpage)
export const historialPagos = async (req, res) => {
    const { correo } = req.query;
    if (!correo) {
        return res.status(400).json({ message: "Falta parámetro correo." });
    }
    try {
        const result = await pool.query(
            `SELECT p.id, p.monto, p.referencia, p.estado, p.banco AS metodo, p.fecha_pago AS fecha,
                    TO_CHAR(p.fecha_pago, 'DD/MM/YYYY') AS fecha_formateada
             FROM pagos p
             WHERE p.usuario_email = $1 AND p.referencia IS NOT NULL AND p.referencia != '0'
             ORDER BY p.fecha_pago DESC, p.created_at DESC`,
            [(correo || '').trim().toLowerCase()]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("historialPagos:", error);
        res.status(500).json({ message: "Error al obtener historial" });
    }
};

// GET /pagos/unidades/propietario/:email (Frontend: CargarMensualidad) – mismo formato que /unidades/usuario-completo
export const unidadesPropietario = async (req, res) => {
    const { email } = req.params;
    if (!email) {
        return res.status(400).json({ message: "Falta email." });
    }
    try {
        const result = await pool.query(
            `SELECT u.id, u.nombre_unidad, c.nombre AS nombre_condominio
             FROM unidades u
             JOIN condominios c ON u.condominio_id = c.id
             JOIN usuarios us ON u.usuario_id = us.id
             WHERE us.correo = $1
             ORDER BY c.nombre, u.nombre_unidad ASC`,
            [(email || '').trim().toLowerCase()]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("unidadesPropietario:", error);
        res.status(500).json({ message: "Error al obtener unidades" });
    }
};