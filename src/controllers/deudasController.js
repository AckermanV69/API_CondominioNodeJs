import { pool } from "../config/db.js";

/**
 * POST /api/deudas/carga-comun
 * Admin genera mensualidad/extraordinaria para todas las unidades OCUPADAS del condominio
 * body: { condominio, monto, descripcion?, tipo? }
 */
export const generarCargaComun = async (req, res) => {
  try {
    const { condominio, monto, descripcion, tipo } = req.body;

    const nombreCondo = String(condominio || "").trim();
    const montoNum = Number(monto);
    const desc = String(descripcion || "").trim() || null;
    const tipoDeuda = String(tipo || "mensualidad").trim(); // mensualidad | extraordinaria | especial...

    if (!nombreCondo || !Number.isFinite(montoNum) || montoNum <= 0) {
      return res.status(400).json({ message: "Condominio y monto válido son requeridos" });
    }

    // 1) buscar condominio por nombre
    const qCondo = await pool.query(
      `SELECT id FROM condominios WHERE LOWER(nombre) = LOWER($1) LIMIT 1`,
      [nombreCondo]
    );

    if (!qCondo.rowCount) {
      return res.status(404).json({ message: "Condominio no encontrado" });
    }

    const condominioId = qCondo.rows[0].id;

    // 2) unidades ocupadas (usuario_id NOT NULL)
    const qUnidades = await pool.query(
      `SELECT id AS unidad_id, usuario_id
       FROM unidades
       WHERE condominio_id = $1 AND usuario_id IS NOT NULL`,
      [condominioId]
    );

    if (!qUnidades.rowCount) {
      return res.status(400).json({ message: "No hay unidades asignadas a usuarios en este condominio" });
    }

    // 3) insertar deudas masivo
    const params = [];
    const values = [];
    let i = 1;

    for (const u of qUnidades.rows) {
      params.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, 'pendiente', NOW())`);
      values.push(
        u.usuario_id, // usuario_id
        condominioId, // condominio_id
        u.unidad_id,  // unidad_id
        montoNum,     // monto
        desc,         // descripcion
        tipoDeuda     // tipo_deuda
      );
    }

    await pool.query(
      `INSERT INTO deudas (usuario_id, condominio_id, unidad_id, monto, descripcion, tipo_deuda, estado, created_at)
       VALUES ${params.join(", ")}`,
      values
    );

    return res.status(201).json({
      message: `✅ Deudas creadas: ${qUnidades.rowCount}`,
      condominio_id: condominioId,
      tipo_deuda: tipoDeuda,
      deudas_creadas: qUnidades.rowCount,
    });
  } catch (error) {
    console.error("generarCargaComun (deudas):", error);
    return res.status(500).json({ message: "Error interno al generar deudas" });
  }
};

export const generarCargaEspecial = async (req, res) => {
  try {
    const { correo, email, monto, descripcion, tipo, unidad_id } = req.body;
    const mail = String(correo || email || "").trim().toLowerCase();

    const montoNum = Number(monto);
    if (!mail || !Number.isFinite(montoNum) || montoNum <= 0) {
      return res.status(400).json({ message: "Faltan correo o monto válido." });
    }

    // 1) usuario por email (tu DB: usuarios.email)
    const uQ = await pool.query(
      `SELECT id FROM usuarios WHERE LOWER(email) = $1 LIMIT 1`,
      [mail]
    );
    if (!uQ.rowCount) return res.status(404).json({ message: "Usuario no encontrado" });

    const usuarioId = uQ.rows[0].id;

    // 2) resolver unidad y condominio (tu DB: unidades.condominio_id)
    let unidadIdFinal = null;
    let condominioId = null;

    if (unidad_id) {
      const un = await pool.query(
        `SELECT id, condominio_id
         FROM unidades
         WHERE id = $1 AND usuario_id = $2`,
        [Number(unidad_id), usuarioId]
      );
      if (!un.rowCount) {
        return res.status(400).json({ message: "La unidad no pertenece a ese usuario o no existe." });
      }
      unidadIdFinal = un.rows[0].id;
      condominioId = un.rows[0].condominio_id;
    } else {
      const un = await pool.query(
        `SELECT id, condominio_id
         FROM unidades
         WHERE usuario_id = $1
         ORDER BY id ASC
         LIMIT 1`,
        [usuarioId]
      );
      if (!un.rowCount) return res.status(400).json({ message: "El usuario no tiene unidades asignadas." });

      unidadIdFinal = un.rows[0].id;
      condominioId = un.rows[0].condominio_id;
    }

    const tipoDeuda = String(tipo || "especial").trim();
    const desc = descripcion ? String(descripcion).trim() : null;

    await pool.query(
      `INSERT INTO deudas (usuario_id, condominio_id, unidad_id, monto, descripcion, tipo_deuda, estado, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', NOW())`,
      [usuarioId, condominioId, unidadIdFinal, montoNum, desc, tipoDeuda]
    );

    return res.status(201).json({ message: "✅ Deuda individual creada con éxito" });
  } catch (error) {
    console.error("generarCargaEspecial (deudas):", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

/**
 * GET /api/deudas/pendientes?correo=...
 * Propietario ve deudas pendientes (por email)
 */
export const deudasPendientes = async (req, res) => {
  const { correo, email } = req.query;
  const mail = String(correo || email || "").trim().toLowerCase();

  if (!mail) return res.status(400).json({ message: "Falta parámetro correo." });

  try {
    const result = await pool.query(
      `SELECT d.id, d.monto, d.descripcion, d.tipo_deuda, d.estado, d.created_at,
              c.nombre AS condominio,
              u.nombre_unidad, u.seccion
       FROM deudas d
       JOIN usuarios us ON us.id = d.usuario_id
       LEFT JOIN condominios c ON c.id = d.condominio_id
       LEFT JOIN unidades u ON u.id = d.unidad_id
       WHERE LOWER(us.email) = $1
         AND d.estado = 'pendiente'
       ORDER BY d.created_at DESC`,
      [mail]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("deudasPendientes:", error);
    return res.status(500).json({ message: "Error al obtener deudas pendientes" });
  }
};

/**
 * (Opcional) PATCH /api/deudas/marcar-pagada
 * Úsalo SOLO si luego haces "aprobar" pagos.
 * body: { deuda_id }
 */
export const marcarDeudaPagada = async (req, res) => {
  const { deuda_id } = req.body;
  const id = Number(deuda_id);

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "deuda_id inválido" });
  }

  try {
    const up = await pool.query(
      `UPDATE deudas
       SET estado = 'pagada',
           pagada_at = NOW()
       WHERE id = $1
       RETURNING id, estado, pagada_at`,
      [id]
    );

    if (!up.rowCount) return res.status(404).json({ message: "Deuda no encontrada" });
    return res.json({ message: "✅ Deuda marcada como pagada", deuda: up.rows[0] });
  } catch (error) {
    console.error("marcarDeudaPagada:", error);
    return res.status(500).json({ message: "Error interno" });
  }
};
