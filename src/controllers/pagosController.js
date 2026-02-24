import { pool } from "../config/db.js";

const normalize = (v) => String(v || "").trim().toLowerCase();

export const registrarPago = async (req, res) => {
  const mail = normalize(req.user?.email);
  if (!mail) return res.status(401).json({ message: "Token sin email" });

  const { telefono, referencia, cedula, monto, banco, deuda_id } = req.body;

  const ref = String(referencia || "").trim();
  const tel = telefono ? String(telefono).trim() : null;
  const ci = cedula ? String(cedula).trim() : null;
  const bancoVal = banco ? String(banco).trim() : null;

  const montoNum = Number(monto);
  const deudaId = Number(deuda_id);

  if (!ref || !Number.isFinite(montoNum) || montoNum <= 0) {
    return res.status(400).json({ message: "Faltan referencia o monto válido." });
  }
  if (!Number.isFinite(deudaId) || deudaId <= 0) {
    return res.status(400).json({ message: "deuda_id inválido (requerido)" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 0) Lock deuda + domicilio (sin outer join)
    const dLock = await client.query(
      `
      SELECT
        d.id_deuda,
        d.monto_deuda,
        d.tipo_moneda,
        d.is_active,
        d.id_domicilio_id,
        dom.id_condominio_id,
        dom.id_propietario_id
      FROM deudas d
      JOIN domicilio dom ON dom.id_domicilio = d.id_domicilio_id
      WHERE d.id_deuda = $1
      FOR UPDATE
      `,
      [deudaId]
    );

    if (!dLock.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Deuda no encontrada" });
    }

    const deuda = dLock.rows[0];

    if (!deuda.is_active) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La deuda no está activa (ya pagada/inactiva)" });
    }

    // 0.1) Validar dueño por email (propietario -> usuarios)
    const ownerQ = await client.query(
      `
      SELECT
        p.id_propietario,
        u.email AS email_usuario
      FROM domicilio dom
      LEFT JOIN propietario p ON p.id_propietario = dom.id_propietario_id
      LEFT JOIN usuarios u ON u.id = p.id_usuario_id
      WHERE dom.id_domicilio = $1
      LIMIT 1
      `,
      [deuda.id_domicilio_id]
    );

    const owner = ownerQ.rows[0] || {};
    if (owner.email_usuario && normalize(owner.email_usuario) !== mail) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "La deuda no pertenece a este usuario" });
    }

    const tipoMoneda =
      deuda.tipo_moneda && String(deuda.tipo_moneda).trim()
        ? String(deuda.tipo_moneda).trim()
        : "USD";

    // 1) Insertar movimiento (pendiente)
    const movQ = await client.query(
      `
      INSERT INTO movimientos (
        fecha_movimiento,
        descripcion_movimiento,
        referencia_movimiento,
        debito_movimiento,
        credito_movimiento,
        monto_movimiento,
        estado_movimiento,
        tipo_moneda,
        concepto_movimiento,
        banco_emisor,
        created_at,
        updated_at
      )
      VALUES (
        CURRENT_DATE,
        $1,
        $2,
        0,
        $3,
        $3,
        0,              -- 0 = pendiente
        $4,
        $5,
        $6,
        NOW(),
        NOW()
      )
      RETURNING id_movimiento;
      `,
      [
        `Pago reportado por propietario (deuda #${deudaId})`,
        ref,
        montoNum,
        tipoMoneda,
        "PAGO_DEUDA",
        bancoVal,
      ]
    );

    const idMovimiento = movQ.rows[0].id_movimiento;

    // 2) datos_transaccion
    await client.query(
      `
      INSERT INTO datos_transaccion (
        nombre_titular,
        telefono_titular,
        correo_titular,
        dni_titular,
        codigo_area,
        tipo_transaccion,
        id_movimiento_id
      )
      VALUES ($1, $2, $3, $4, NULL, $5, $6)
      `,
      [mail, tel, mail, ci, "PAGO", idMovimiento]
    );

    // 3) recibo pendiente
    const recQ = await client.query(
      `
      INSERT INTO recibos (
        descripcion_recibo,
        monto,
        fecha_creacion,
        hora_creacion,
        id_deuda_id,
        categoria_recibo,
        id_movimiento_id
      )
      VALUES ($1, $2, CURRENT_DATE, CURRENT_TIME, $3, 'PENDIENTE', $4)
      RETURNING *;
      `,
      [
        `Reporte pendiente de pago deuda #${deudaId} (ref: ${ref})`,
        montoNum,
        deudaId,
        idMovimiento,
      ]
    );

    // 4) ingresos: link movimiento ↔ propietario
    if (owner.id_propietario) {
      await client.query(
        `
        INSERT INTO ingresos (
          tipo_ingreso,
          imagen_referencial,
          id_movimiento_id,
          id_propietario_id,
          factura,
          metodo_pago
        )
        VALUES ($1, NULL, $2, $3, NULL, NULL)
        `,
        ["PAGO", idMovimiento, owner.id_propietario]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: "✅ Pago reportado. Queda pendiente de aprobación.",
      id_movimiento: idMovimiento,
      recibo: recQ.rows[0],
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    console.error("registrarPago:", error);
    return res.status(500).json({ message: "Error interno al procesar el pago" });
  } finally {
    client.release();
  }
};

export const historialPagos = async (req, res) => {
  const mail = normalize(req.user?.email);
  if (!mail) return res.status(401).json({ message: "Token sin email" });

  try {
    const result = await pool.query(
      `
      SELECT
        m.id_movimiento,
        m.fecha_movimiento,
        m.descripcion_movimiento,
        m.referencia_movimiento,
        m.monto_movimiento,
        m.estado_movimiento,
        m.tipo_moneda,
        m.banco_emisor,
        m.created_at,

        dt.id_transaccion,
        dt.tipo_transaccion,
        dt.nombre_titular,
        dt.correo_titular,
        dt.dni_titular,

        r.id_recibo,
        r.id_deuda_id,
        r.categoria_recibo
      FROM movimientos m
      JOIN LATERAL (
        SELECT *
        FROM datos_transaccion dt
        WHERE dt.id_movimiento_id = m.id_movimiento
          AND LOWER(dt.correo_titular) = $1
        ORDER BY dt.id_transaccion DESC
        LIMIT 1
      ) dt ON true
      LEFT JOIN recibos r ON r.id_movimiento_id = m.id_movimiento
      ORDER BY m.fecha_movimiento DESC NULLS LAST, m.created_at DESC, m.id_movimiento DESC
      `,
      [mail]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("historialPagos:", error);
    return res.status(500).json({ message: "Error al obtener historial" });
  }
};

export const pagosPendientes = async (req, res) => {
  const mail = normalize(req.user?.email);
  if (!mail) return res.status(401).json({ message: "Token sin email" });

  try {
    const result = await pool.query(
      `
      SELECT
        m.id_movimiento,
        m.monto_movimiento,
        m.referencia_movimiento,
        m.estado_movimiento,
        m.fecha_movimiento,
        m.banco_emisor,
        m.created_at,

        dt.id_transaccion,
        dt.correo_titular,

        r.id_recibo,
        r.id_deuda_id,
        r.categoria_recibo
      FROM movimientos m
      JOIN LATERAL (
        SELECT *
        FROM datos_transaccion dt
        WHERE dt.id_movimiento_id = m.id_movimiento
          AND LOWER(dt.correo_titular) = $1
        ORDER BY dt.id_transaccion DESC
        LIMIT 1
      ) dt ON true
      LEFT JOIN recibos r ON r.id_movimiento_id = m.id_movimiento
      WHERE m.estado_movimiento = 0
      ORDER BY m.created_at DESC, m.id_movimiento DESC
      `,
      [mail]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("pagosPendientes:", error);
    return res.status(500).json({ message: "Error al obtener pagos pendientes" });
  }
};