import { pool } from "../config/db.js";

// Obtener todos los usuarios
export const usersget = async(req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM usuarios');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener usuarios" });
    }
}

// Obtener usuario por ID
export const usersgetid = async(req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el usuario' });
    }
}

// Obtener usuario por correo (Frontend: AddPropietario)
export const usersgetByEmail = async (req, res) => {
    try {
        const { email } = req.params;
        const correo = (email || '').trim().toLowerCase();
        const { rows } = await pool.query(
            'SELECT id, nombre, correo, rol, condominio_id FROM usuarios WHERE correo = $1',
            [correo]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener el usuario' });
    }
}

// Eliminar usuario
export const usersdelete = async(req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING *', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json({ message: "Usuario eliminado", usuario: rows[0] });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    }
}

// Actualizar usuario
export const usersput = async(req, res) => {
    try {
        const { id } = req.params;
        const { nombre, correo, password, tlf } = req.body; // Quitamos apellido, añadimos tlf

        const { rows } = await pool.query(
            'UPDATE usuarios SET nombre = $1, correo = $2, password = $3, tlf = $4 WHERE id = $5 RETURNING *', 
            [nombre, correo, password, tlf, id]
        );

        res.json({
            message: 'Usuario actualizado',
            usuario: rows[0]
        });
    } catch (error) {
        res.status(500).json({ error: "Error al actualizar" });
    }
}

// Login CORREGIDO
export const loginUsuario = async (req, res) => {
    // Recibimos 'correo' en lugar de 'email'
    const { correo, password } = req.body;

    try {
        // Buscamos en la columna 'correo'
        const result = await pool.query(
            "SELECT * FROM usuarios WHERE correo = $1",
            [correo]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const user = result.rows[0];

        // Verificación de contraseña (si usas bcrypt, usa bcrypt.compare)
        if (user.password !== password) {
            return res.status(401).json({ message: "Contraseña incorrecta" });
        }

        res.status(200).json({
            message: "Login exitoso",
            user: {
                id: user.id,
                nombre: user.nombre,
                rol: user.rol,
                correo: user.correo
            }
        });

    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};


// Registro CORREGIDO (Frontend: nombre, cedula, telefono, correo, password, rol, condominio_id)
export const signUpUsuario = async (req, res) => {
    const { nombre, cedula, correo, password, rol, telefono, deuda, condominio, condominio_id } = req.body;
    const condId = condominio_id ?? condominio ?? null;

    try {
        const result = await pool.query(
            `INSERT INTO usuarios (nombre, cedula, correo, password, rol, telefono, deuda, condominio_id) 
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), $8) RETURNING *`,
            [nombre?.trim(), cedula?.trim(), (correo || '').trim().toLowerCase(), password, (rol || 'propietario').toLowerCase(), telefono?.trim(), deuda, condId]
        );

        res.status(201).json({
            message: "Usuario registrado con éxito",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Error en el registro:", error);
        if (error.code === '23505') {
            return res.status(400).json({ message: "La cédula o el correo ya están registrados" });
        }
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

export const getEstadosConCiudades = async (req, res) => {
    try {
        const query = `
            SELECT e.nombre AS estado, array_agg(c.nombre) AS ciudades
            FROM estados e
            JOIN ciudades c ON e.id = c.estado_id
            GROUP BY e.nombre
        `;
        const { rows } = await pool.query(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener datos geográficos" });
    }
};

// Actualizar datos de condominio del usuario
export const actualizarCondominioUsuario = async (req, res) => {
    const { correo, apartamento, seccion } = req.body;

    try {
        // Buscamos por email y actualizamos apartamento y seccion
        const result = await pool.query(
            'UPDATE usuarios SET apartamento = $1, seccion = $2 WHERE email = $3 RETURNING *',
            [apartamento, seccion, correo]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "El usuario con ese correo no existe." });
        }

        res.json({
            message: "Datos actualizados correctamente",
            usuario: result.rows[0]
        });

    } catch (error) {
        console.error("Error al actualizar:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

// Registrar un pago o carga común (restar a la deuda)
export const registrarCargaComun = async (req, res) => {
    const { apartamento, monto } = req.body;

    try {
        // Buscamos al usuario por su número de apartamento y restamos el monto de su deuda
        const result = await pool.query(
            'UPDATE usuarios SET deuda = deuda - $1 WHERE apartamento = $2 RETURNING *',
            [monto, apartamento]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No se encontró ningún usuario en ese apartamento." });
        }

        res.status(200).json({
            message: "Deuda actualizada con éxito",
            usuario: result.rows[0],
            nuevoSaldo: result.rows[0].deuda
        });

    } catch (error) {
        console.error("Error al procesar carga común:", error);
        res.status(500).json({ message: "Error interno al procesar el pago" });
    }
};

// Registrar una carga especial buscando por correo
export const registrarCargaEspecial = async (req, res) => {
    const { correo, monto, descripcion, tipo } = req.body;

    try {
        // 1. Verificamos que el usuario exista
        const usuarioQuery = await pool.query(
            "SELECT correo FROM usuarios WHERE correo = $1",
            [correo]
        );

        if (usuarioQuery.rowCount === 0) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // 2. Insertamos usando los nombres de columna reales de tu tabla 'pagos'
        // Dejamos en NULL o vacío los campos de transferencia porque esto es una "Carga" (Deuda), no el pago aún.
        await pool.query(
        `INSERT INTO pagos (
            usuario_email, 
            monto, 
            descripcion, 
            tipo_pago, 
            estatus,
            referencia,   -- Agregamos estos para evitar el error NOT NULL
            telefono,
            cedula,
            banco
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
            correo,          
            monto,           
            descripcion,     
            tipo,            
            'pendiente',
            '0',            // referencia temporal
            '0',            // telefono temporal
            '0',            // cedula temporal
            'PENDIENTE'     // banco temporal
        ]
    );

        res.status(201).json({ message: "Carga individual realizada con éxito" });

    } catch (error) {
        console.error("Error detallado:", error);
        res.status(500).json({ message: "Error al registrar en la base de datos" });
    }
};

export const updateUsuarioCondominio = async (req, res) => {
    // Recibimos 'correo' y 'condominio_id' desde el celular
    const { correo, condominio_id } = req.body;

    try {
        // CAMBIO CLAVE: Usamos la columna 'correo' en el WHERE, no 'email'
        const result = await pool.query(
            "UPDATE usuarios SET condominio_id = $1 WHERE correo = $2 RETURNING *",
            [condominio_id, correo]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Usuario no encontrado con ese correo." });
        }

        res.status(200).json({ 
            message: "Propietario vinculado exitosamente",
            usuario: result.rows[0] 
        });

    } catch (error) {
        console.error("Error al actualizar:", error);
        res.status(500).json({ message: "Error al actualizar en la base de datos" });
    }
};

export const registrarCargaEspecialUnidad = async (req, res) => {
    // El frontend ahora debe enviar el ID de la unidad
    const { unidad_id, monto, descripcion, tipo } = req.body;

    try {
        // 1. Buscamos la unidad para obtener el email del dueño y el condominio
        const unidadQuery = await pool.query(
            `SELECT u.nombre_unidad, u.condominio_id, us.correo 
             FROM unidades u 
             JOIN usuarios us ON u.usuario_id = us.id 
             WHERE u.id = $1`,
            [unidad_id]
        );

        if (unidadQuery.rowCount === 0) {
            return res.status(404).json({ message: "Unidad no encontrada" });
        }

        const { nombre_unidad, condominio_id, correo } = unidadQuery.rows[0];

        // 2. Insertamos el pago vinculado a esa unidad específica
        await pool.query(
            `INSERT INTO pagos (
                usuario_email, monto, descripcion, tipo_pago, 
                estatus, referencia, telefono, cedula, banco, nombre_unidad
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                correo, monto, descripcion, tipo, 
                'pendiente', '0', '0', '0', 'PENDIENTE', nombre_unidad
            ]
        );

        // 3. (Opcional) Actualizamos la deuda_actual en la tabla unidades
        await pool.query(
            "UPDATE unidades SET deuda_actual = deuda_actual + $1 WHERE id = $2",
            [monto, unidad_id]
        );

        res.status(201).json({ message: `Carga aplicada con éxito a la unidad ${nombre_unidad}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al registrar carga por unidad" });
    }
};

// 1. Asignar unidad (Vincula un usuario a una unidad de un condominio específico)
export const asignarUnidadPropietario = async (req, res) => {
    const { usuario_id, unidad_id } = req.body;

    try {
        const result = await pool.query(
            "UPDATE unidades SET usuario_id = $1 WHERE id = $2 RETURNING *",
            [usuario_id, unidad_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Unidad no encontrada" });
        }

        res.status(200).json({ message: "Unidad asignada con éxito", unidad: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: "Error al asignar unidad" });
    }
};

// 2. Modificar/Quitar unidad (Pone el usuario_id en NULL para reasignar)
export const desvincularUnidad = async (req, res) => {
    const { unidad_id } = req.body;

    try {
        await pool.query(
            "UPDATE unidades SET usuario_id = NULL WHERE id = $1",
            [unidad_id]
        );
        res.status(200).json({ message: "Unidad liberada correctamente" });
    } catch (error) {
        res.status(500).json({ error: "Error al modificar la unidad" });
    }
};

// 3. Listar todas las unidades de un usuario (de todos sus condominios)
export const getUnidadesGlobalesPropietario = async (req, res) => {
    const { correo } = req.params;
    try {
        const query = `
            SELECT u.id as unidad_id, u.nombre_unidad, c.nombre as nombre_condominio, u.deuda_actual
            FROM unidades u
            JOIN usuarios us ON u.usuario_id = us.id
            JOIN condominios c ON u.condominio_id = c.id
            WHERE us.correo = $1
        `;
        const result = await pool.query(query, [correo]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener historial de unidades" });
    }
};

// En usercontroller.js
export const getUnidadesLibres = async (req, res) => {
    const { condominio_id } = req.params;
    try {
        const result = await pool.query(
            "SELECT id, nombre_unidad FROM unidades WHERE condominio_id = $1 AND usuario_id IS NULL",
            [condominio_id]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Esta es la función que invoca AddUsuarioc.js
export const asignarUnidadPorCorreo = async (req, res) => {
    const { correo, unidad_id } = req.body;
    try {
        const userQuery = await pool.query("SELECT id FROM usuarios WHERE correo = $1", [correo]);
        if (userQuery.rowCount === 0) {
            return res.status(404).json({ message: "El correo no coincide con ningún usuario registrado." });
        }
        const usuario_id = userQuery.rows[0].id;
        const result = await pool.query(
            "UPDATE unidades SET usuario_id = $1 WHERE id = $2 RETURNING *",
            [usuario_id, unidad_id]
        );
        res.status(200).json({ message: "Unidad asignada", unidad: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// En tu controlador de vinculación (ej: usercontroller.js o unidadescontroller.js)
export const vincularUnidad = async (req, res) => {
    const { correo, unidad_id } = req.body;
    try {
        // 1. Buscar el ID del usuario por su correo
        const userRes = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);
        if (userRes.rows.length === 0) return res.status(404).json({ message: 'Correo no registrado' });

        const usuarioId = userRes.rows[0].id;

        // 2. Asignar el usuario a la unidad
        await pool.query(
            'UPDATE unidades SET usuario_id = $1 WHERE id = $2', 
            [usuarioId, unidad_id]
        );

        res.json({ message: 'Vínculo exitoso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Ejemplo de lógica para el botón Vincular
export const asignarUnidad = async (req, res) => {
    const { correo, unidad_id } = req.body;
    try {
        // 1. Buscamos al usuario por correo
        const user = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);
        if (user.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });

        // 2. Actualizamos la unidad (El Trigger que creamos protegerá esta operación)
        await pool.query(
            'UPDATE unidades SET usuario_id = $1 WHERE id = $2',
            [user.rows[0].id, unidad_id]
        );

        res.json({ message: "Propietario vinculado con éxito" });
    } catch (error) {
        // Si el Trigger salta, el error llegará aquí
        res.status(400).json({ message: error.message });
    }
};