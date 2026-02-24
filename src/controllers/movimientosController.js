import { pool } from "../config/db.js";

export const listarPendientes = async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT
        m.id_movimiento,
        m.fecha_movimiento,
        m.referencia_movimiento,
        m.monto_movimiento,
        m.estado_movimiento,
        m.tipo_moneda,
        m.banco_emisor,
        m.created_at,

        r.id_recibo,
        r.id_deuda_id,
        r.categoria_recibo,

        dt.id_transaccion,
        dt.nombre_titular,
        dt.correo_titular,
        dt.dni_titular,
        dt.tipo_transaccion
      FROM movimientos m
      JOIN recibos r
        ON r.id_movimiento_id = m.id_movimiento
       AND r.categoria_recibo = 'PENDIENTE'
      LEFT JOIN LATERAL (
        SELECT
          id_transaccion,
          nombre_titular,
          correo_titular,
          dni_titular,
          tipo_transaccion,
          id_movimiento_id
        FROM datos_transaccion
        WHERE id_movimiento_id = m.id_movimiento
        ORDER BY id_transaccion DESC
        LIMIT 1
      ) dt ON true
      WHERE m.estado_movimiento = 0
      ORDER BY m.id_movimiento DESC
    `);

    return res.json(q.rows);
  } catch (e) {
    console.error("listarPendientes:", e);
    return res.status(500).json({ message: "Error al listar pendientes" });
  }
};

/**
 * GET /api/movimientos/:id
 * Útil para debug / admin.
 */
export const getMovimientoById = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "id inválido" });
  }

  try {
    const q = await pool.query(
      `
      SELECT
        m.*,
        dt.id_transaccion,
        dt.nombre_titular,
        dt.correo_titular,
        dt.dni_titular,
        dt.tipo_transaccion
      FROM movimientos m
      LEFT JOIN LATERAL (
        SELECT *
        FROM datos_transaccion
        WHERE id_movimiento_id = m.id_movimiento
        ORDER BY id_transaccion DESC
        LIMIT 1
      ) dt ON true
      WHERE m.id_movimiento = $1
      `,
      [id]
    );

    if (!q.rowCount) return res.status(404).json({ message: "Movimiento no encontrado" });

    return res.json(q.rows[0]);
  } catch (e) {
    console.error("getMovimientoById:", e);
    return res.status(500).json({ message: "Error al obtener movimiento" });
  }
};

/**
 * PUT /api/movimientos/:id/aprobar
 */
export const aprobarMovimiento = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "id inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Traer movimiento + recibo pendiente + deuda (lock)
    const baseQ = await client.query(
      `
      SELECT
        m.id_movimiento,
        m.estado_movimiento,
        m.monto_movimiento,

        r.id_recibo,
        r.id_deuda_id,
        r.categoria_recibo,

        d.id_deuda,
        d.is_active,
        d.id_domicilio_id
      FROM movimientos m
      JOIN recibos r ON r.id_movimiento_id = m.id_movimiento
      JOIN deudas d ON d.id_deuda = r.id_deuda_id
      WHERE m.id_movimiento = $1
      FOR UPDATE
      `,
      [id]
    );

    if (!baseQ.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Movimiento no encontrado o no tiene recibo asociado" });
    }

    const row = baseQ.rows[0];

    if (Number(row.estado_movimiento) !== 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Este movimiento no está pendiente" });
    }

    if (String(row.categoria_recibo || "") !== "PENDIENTE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "El recibo asociado no está en PENDIENTE" });
    }

    if (!row.is_active) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La deuda ya está inactiva/pagada" });
    }

    // 2) Aprobar movimiento
    const movUpd = await client.query(
      `
      UPDATE movimientos
      SET estado_movimiento = 1,
          updated_at = NOW()
      WHERE id_movimiento = $1
      RETURNING
        id_movimiento,
        estado_movimiento,
        referencia_movimiento,
        monto_movimiento,
        tipo_moneda,
        banco_emisor,
        updated_at
      `,
      [id]
    );

    // 3) Pasar recibo a PAGO
    const recUpd = await client.query(
      `
      UPDATE recibos
      SET categoria_recibo = 'PAGO'
      WHERE id_recibo = $1
      RETURNING *;
      `,
      [row.id_recibo]
    );

    // 4) Cerrar deuda
    const deudaUpd = await client.query(
      `
      UPDATE deudas
      SET is_active = false,
          is_moroso = false,
          updated_at = NOW()
      WHERE id_deuda = $1
      RETURNING *;
      `,
      [row.id_deuda]
    );

    // 5) Recalcular estado_deuda del domicilio (NOT NULL)
    await client.query(
      `
      UPDATE domicilio dom
      SET estado_deuda = EXISTS (
        SELECT 1 FROM deudas d
        WHERE d.id_domicilio_id = dom.id_domicilio
          AND d.is_active = true
      )
      WHERE dom.id_domicilio = $1
      `,
      [row.id_domicilio_id]
    );

    await client.query("COMMIT");

    return res.json({
      message: "Movimiento aprobado y deuda cerrada",
      movimiento: movUpd.rows[0],
      recibo: recUpd.rows[0],
      deuda: deudaUpd.rows[0],
    });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("aprobarMovimiento:", e);
    return res.status(500).json({ message: "Error al aprobar movimiento" });
  } finally {
    client.release();
  }
};


/**
 * PUT /api/movimientos/:id/rechazar
 * Body opcional: { motivo: "..." }
 */
export const rechazarMovimiento = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "id inválido" });
  }

  const motivo = req.body?.motivo ? String(req.body.motivo).trim() : "";
  if (!motivo) return res.status(400).json({ message: "motivo es requerido" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock movimiento + recibo si existe
    const baseQ = await client.query(
      `
      SELECT
        m.id_movimiento,
        m.estado_movimiento,
        m.descripcion_movimiento,
        r.id_recibo,
        r.categoria_recibo
      FROM movimientos m
      LEFT JOIN recibos r ON r.id_movimiento_id = m.id_movimiento
      WHERE m.id_movimiento = $1
      FOR UPDATE
      `,
      [id]
    );

    if (!baseQ.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Movimiento no encontrado" });
    }

    const row = baseQ.rows[0];
    if (Number(row.estado_movimiento) !== 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Este movimiento no está pendiente" });
    }

    const movUpd = await client.query(
      `
      UPDATE movimientos
      SET estado_movimiento = 2,
          descripcion_movimiento = (descripcion_movimiento || ' | RECHAZO: ' || $2::text),
          updated_at = NOW()
      WHERE id_movimiento = $1
      RETURNING
        id_movimiento,
        estado_movimiento,
        referencia_movimiento,
        monto_movimiento,
        tipo_moneda,
        banco_emisor,
        descripcion_movimiento,
        updated_at
      `,
      [id, motivo]
    );

    // Si había recibo pendiente, pásalo a RECHAZADO
    let recibo = null;
    if (row.id_recibo && String(row.categoria_recibo) === "PENDIENTE") {
      const recUpd = await client.query(
        `
        UPDATE recibos
        SET categoria_recibo = 'RECHAZADO',
            descripcion_recibo = ('RECHAZADO: ' || $2::text || ' | ' || descripcion_recibo)
        WHERE id_recibo = $1
        RETURNING *;
        `,
        [row.id_recibo, motivo]
      );
      recibo = recUpd.rows[0];
    }

    await client.query("COMMIT");
    return res.json({ message: "Movimiento rechazado", movimiento: movUpd.rows[0], recibo });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("rechazarMovimiento:", e);
    return res.status(500).json({ message: "Error al rechazar movimiento" });
  } finally {
    client.release();
  }
};

const normalizeEmail = (v) => String(v || "").trim().toLowerCase();

export const historialMovimientosPorCorreo = async (req, res) => {
  const mail = normalizeEmail(req.query.correo || req.query.email);

  if (!mail || !mail.includes("@")) {
    return res.status(400).json({ message: "Falta correo válido en query (?correo=...)" });
  }

  const estadoRaw = req.query.estado;
  const estado =
    estadoRaw === undefined || estadoRaw === null || estadoRaw === ""
      ? null
      : Number(estadoRaw);

  if (estado !== null && (!Number.isFinite(estado) || ![0, 1, 2].includes(estado))) {
    return res.status(400).json({ message: "estado inválido (use 0, 1 o 2)" });
  }

  const limit = Math.min(
    Math.max(Number(req.query.limit || 200), 1),
    500
  );

  try {
    const q = await pool.query(
      `
      SELECT
        m.id_movimiento,
        m.fecha_movimiento,
        m.descripcion_movimiento,
        m.referencia_movimiento,
        m.debito_movimiento,
        m.credito_movimiento,
        m.monto_movimiento,
        m.estado_movimiento,
        m.tipo_moneda,
        m.concepto_movimiento,
        m.banco_emisor,
        m.id_banco_id,
        m.created_at,
        m.updated_at,

        dt.id_transaccion,
        dt.nombre_titular,
        dt.correo_titular,
        dt.dni_titular,
        dt.telefono_titular,
        dt.codigo_area,
        dt.tipo_transaccion
      FROM movimientos m
      JOIN LATERAL (
        SELECT *
        FROM datos_transaccion dt
        WHERE dt.id_movimiento_id = m.id_movimiento
          AND LOWER(dt.correo_titular) = $1
        ORDER BY dt.id_transaccion DESC
        LIMIT 1
      ) dt ON true
      WHERE ($2::int IS NULL OR m.estado_movimiento = $2::int)
      ORDER BY m.fecha_movimiento DESC NULLS LAST, m.id_movimiento DESC
      LIMIT $3
      `,
      [mail, estado, limit]
    );

    return res.json(q.rows);
  } catch (e) {
    console.error("historialMovimientosPorCorreo:", e);
    return res.status(500).json({ message: "Error al obtener historial de movimientos" });
  }
};  

const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const isYMD = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const historialMovimientosMe = async (req, res) => {
  try {
    const usuarioId = toInt(req.user?.id);
    if (!usuarioId || usuarioId <= 0) {
      return res.status(401).json({ message: "No autenticado" });
    }

    // 1) buscar propietario del usuario logueado
    const pQ = await pool.query(
      `
      SELECT id_propietario
      FROM propietario
      WHERE id_usuario_id = $1
      LIMIT 1
      `,
      [usuarioId]
    );

    if (!pQ.rowCount) {
      return res.status(404).json({ message: "No existe propietario para este usuario" });
    }

    const propietarioId = pQ.rows[0].id_propietario;

    // 2) filtros
    const condominioId = toInt(req.query?.condominioId);
    const desde = String(req.query?.desde || "").trim();
    const hasta = String(req.query?.hasta || "").trim();

    const params = [propietarioId];
    const where = [`d.id_propietario_id = $1`];

    if (condominioId && condominioId > 0) {
      params.push(condominioId);
      where.push(`d.id_condominio_id = $${params.length}`);
    }

    if (isYMD(desde)) {
      params.push(desde);
      where.push(`(m.fecha_movimiento::date) >= $${params.length}::date`);
    }

    if (isYMD(hasta)) {
      params.push(hasta);
      where.push(`(m.fecha_movimiento::date) <= $${params.length}::date`);
    }

    // 3) query historial (mismo “shape” que te está funcionando en resumen)
    const q = await pool.query(
      `
      SELECT
        m.id_movimiento,
        m.fecha_movimiento,
        m.monto_movimiento,
        m.estado_movimiento,
        m.tipo_moneda,
        m.referencia_movimiento,
        m.concepto_movimiento,
        m.banco_emisor,

        r.id_recibo,
        r.categoria_recibo,

        de.concepto_deuda,
        de.monto_deuda AS monto_deuda_original,

        d.nombre_domicilio,
        t.nombre_torre,
        c.nombre_condominio,

        dt.tipo_transaccion,
        dt.nombre_titular,

        d.id_condominio_id
      FROM domicilio d
      JOIN torre t ON t.id_torre = d.id_torre_id
      JOIN condominio c ON c.id_condominio = d.id_condominio_id
      JOIN deudas de ON de.id_domicilio_id = d.id_domicilio
      JOIN recibos r ON r.id_deuda_id = de.id_deuda
      JOIN movimientos m ON m.id_movimiento = r.id_movimiento_id
      LEFT JOIN datos_transaccion dt ON dt.id_movimiento_id = m.id_movimiento
      WHERE ${where.join(" AND ")}
      ORDER BY m.fecha_movimiento DESC NULLS LAST, m.id_movimiento DESC
      LIMIT 200
      `,
      params
    );

    return res.json(q.rows);
  } catch (e) {
    console.error("historialMovimientosMe:", e);
    return res.status(500).json({ message: "Error al obtener historial" });
  }
};

