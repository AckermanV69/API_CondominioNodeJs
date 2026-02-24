import { pool } from "../config/db.js";

const toIntOrNull = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const toDateOrDefault = (v, fallback) => {
  if (!v) return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : v; // devolvemos string YYYY-MM-DD
};

export const getAdminDashboard = async (req, res) => {
  const condominioId = toIntOrNull(req.query.condominioId);

  // default: últimos 30 días
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hoy = `${yyyy}-${mm}-${dd}`;

  const hace30 = new Date(now);
  hace30.setDate(hace30.getDate() - 30);
  const yyyy2 = hace30.getFullYear();
  const mm2 = String(hace30.getMonth() + 1).padStart(2, "0");
  const dd2 = String(hace30.getDate()).padStart(2, "0");
  const defaultDesde = `${yyyy2}-${mm2}-${dd2}`;

  const desde = toDateOrDefault(req.query.desde, defaultDesde);
  const hasta = toDateOrDefault(req.query.hasta, hoy);

  try {
    const deudaActivaSQL = `
      SELECT
        d.tipo_moneda,
        COUNT(*)::int AS deudas_activas,
        COALESCE(SUM(d.monto_deuda), 0)::numeric AS total_deuda_activa
      FROM deudas d
      JOIN domicilio dom ON dom.id_domicilio = d.id_domicilio_id
      JOIN torre t ON t.id_torre = dom.id_torre_id
      WHERE d.is_active = true
        AND ($1::int IS NULL OR t.id_condominio_id = $1)
      GROUP BY d.tipo_moneda
      ORDER BY d.tipo_moneda;
    `;

    const morosidadSQL = `
      SELECT
        d.tipo_moneda,
        COUNT(*)::int AS deudas_morosas,
        COALESCE(SUM(d.monto_deuda), 0)::numeric AS total_morosidad
      FROM deudas d
      JOIN domicilio dom ON dom.id_domicilio = d.id_domicilio_id
      JOIN torre t ON t.id_torre = dom.id_torre_id
      WHERE d.is_active = true
        AND d.is_moroso = true
        AND ($1::int IS NULL OR t.id_condominio_id = $1)
      GROUP BY d.tipo_moneda
      ORDER BY d.tipo_moneda;
    `;

    const pagosSQL = `
      SELECT
        m.tipo_moneda,
        COUNT(*)::int AS pagos_aprobados,
        COALESCE(SUM(m.monto_movimiento), 0)::numeric AS total_pagos_aprobados
      FROM movimientos m
      JOIN recibos r ON r.id_movimiento_id = m.id_movimiento
      JOIN deudas d ON d.id_deuda = r.id_deuda_id
      JOIN domicilio dom ON dom.id_domicilio = d.id_domicilio_id
      JOIN torre t ON t.id_torre = dom.id_torre_id
      WHERE m.estado_movimiento = 1
        AND r.categoria_recibo = 'PAGO'
        AND (m.fecha_movimiento::date BETWEEN $2::date AND $3::date)
        AND ($1::int IS NULL OR t.id_condominio_id = $1)
      GROUP BY m.tipo_moneda
      ORDER BY m.tipo_moneda;
    `;

    const topMorososSQL = `
      SELECT
        dom.id_domicilio,
        dom.nombre_domicilio,
        t.nombre_torre,
        c.nombre_condominio,
        d.tipo_moneda,
        COUNT(*)::int AS deudas_activas,
        COALESCE(SUM(d.monto_deuda), 0)::numeric AS total_deuda
      FROM deudas d
      JOIN domicilio dom ON dom.id_domicilio = d.id_domicilio_id
      JOIN torre t ON t.id_torre = dom.id_torre_id
      JOIN condominio c ON c.id_condominio = t.id_condominio_id
      WHERE d.is_active = true
        AND ($1::int IS NULL OR c.id_condominio = $1)
      GROUP BY dom.id_domicilio, dom.nombre_domicilio, t.nombre_torre, c.nombre_condominio, d.tipo_moneda
      ORDER BY total_deuda DESC
      LIMIT 10;
    `;

    const [deudaActiva, morosidad, pagos, topMorosos] = await Promise.all([
      pool.query(deudaActivaSQL, [condominioId]),
      pool.query(morosidadSQL, [condominioId]),
      pool.query(pagosSQL, [condominioId, desde, hasta]),
      pool.query(topMorososSQL, [condominioId]),
    ]);

    return res.json({
      filtros: { condominioId, desde, hasta },
      deuda_activa_por_moneda: deudaActiva.rows,
      morosidad_por_moneda: morosidad.rows,
      pagos_aprobados_por_moneda: pagos.rows,
      top_morosos: topMorosos.rows,
    });
  } catch (e) {
    console.error("getAdminDashboard:", e);
    return res.status(500).json({ message: "Error al obtener dashboard admin" });
  }
};
