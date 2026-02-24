// controllers/propietariosController.js
import { pool } from "../config/db.js";
import { getUltimaTasaNormalizada } from "./tasasController.js";

// helpers
const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const money3 = () => ({ USD: 0, EUR: 0, BS: 0 });

const addMoney = (acc, tipo, monto) => {
  const key = String(tipo || "").trim().toUpperCase();
  if (!["USD", "EUR", "BS"].includes(key)) return acc;
  acc[key] = Number(acc[key] || 0) + Number(monto || 0);
  return acc;
};

const calcEquivalentes = ({ totals, tasas }) => {
  const usd_bs = Number(tasas?.usd_bs);
  const eur_bs = Number(tasas?.eur_bs);

  const USD = Number(totals?.USD || 0);
  const EUR = Number(totals?.EUR || 0);
  const BS = Number(totals?.BS || 0);

  if (!Number.isFinite(usd_bs) || usd_bs <= 0 || !Number.isFinite(eur_bs) || eur_bs <= 0) {
    return null;
  }

  const total_bs = BS + USD * usd_bs + EUR * eur_bs;
  const total_usd = USD + BS / usd_bs + (EUR * eur_bs) / usd_bs;
  const total_eur = EUR + BS / eur_bs + (USD * usd_bs) / eur_bs;

  return { total_bs, total_usd, total_eur };
};

async function getTasaVigente(client = pool) {
  const r = await getUltimaTasaNormalizada(client);
  if (!r) {
    return { id: null, usd_bs: null, eur_bs: null, created_at: null, updated_at: null };
  }
  return {
    id: r.id ?? null,
    usd_bs: r.usd_bs ?? null,
    eur_bs: r.eur_bs ?? null,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
  };
}

function accumulatePorCondominio({ deudas, soloActivas = true, excluirMorosas = false }) {
  const map = new Map();

  for (const d of deudas) {
    if (soloActivas && d.is_active !== true) continue;
    if (excluirMorosas && d.is_moroso === true) continue;

    const condId = d.id_condominio_id ?? d.condominio_id ?? d.id_condominio;
    const key = String(condId ?? "");
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        condominio_id: condId ?? null,
        nombre_condominio: d.nombre_condominio ?? null,
        totales: money3(),
      });
    }

    const entry = map.get(key);
    addMoney(entry.totales, d.tipo_moneda, d.monto_deuda);
  }

  return Array.from(map.values()).sort((a, b) => {
    const na = String(a.nombre_condominio || "");
    const nb = String(b.nombre_condominio || "");
    return na.localeCompare(nb);
  });
}

async function buildResumenPropietario({ propietarioId, client = pool }) {
  // 1) domicilios
  const domiciliosQ = await client.query(
    `
    SELECT
      d.*,
      t.nombre_torre,
      c.nombre_condominio,
      t.id_condominio_id
    FROM domicilio d
    JOIN torre t ON t.id_torre = d.id_torre_id
    JOIN condominio c ON c.id_condominio = t.id_condominio_id
    WHERE d.id_propietario_id = $1
    ORDER BY c.nombre_condominio, t.nombre_torre, d.piso_domicilio, d.nombre_domicilio
    `,
    [propietarioId]
  );

  const domicilios = domiciliosQ.rows;

  // ✅ tasa vigente (ya no rompe por nombres de columna)
  const tasas = await getTasaVigente(client);

  if (!domicilios.length) {
    return {
      domicilios: [],
      deudas: [],
      movimientos: [],
      tasas,
      totales_activos_con_morosidad: money3(),
      totales_activos_sin_morosidad: money3(),
      equivalentes_activos_con_morosidad: null,
      equivalentes_activos_sin_morosidad: null,
      totales_activos_con_morosidad_por_condominio: [],
      totales_activos_sin_morosidad_por_condominio: [],
      equivalentes_activos_con_morosidad_por_condominio: [],
      equivalentes_activos_sin_morosidad_por_condominio: [],
    };
  }

  // 2) deudas
  const deudasQ = await client.query(
    `
    SELECT
      de.*,
      d.nombre_domicilio,
      d.piso_domicilio,
      t.nombre_torre,
      c.nombre_condominio,
      t.id_condominio_id
    FROM deudas de
    JOIN domicilio d ON d.id_domicilio = de.id_domicilio_id
    JOIN torre t ON t.id_torre = d.id_torre_id
    JOIN condominio c ON c.id_condominio = t.id_condominio_id
    WHERE d.id_propietario_id = $1
    ORDER BY de.is_active DESC, de.is_moroso DESC, de.fecha_deuda DESC, de.id_deuda DESC
    `,
    [propietarioId]
  );

  const deudas = deudasQ.rows;

  // 3) totales globales
  const totalesConMor = money3();
  const totalesSinMor = money3();

  for (const d of deudas) {
    if (d.is_active !== true) continue;

    addMoney(totalesConMor, d.tipo_moneda, d.monto_deuda);
    if (d.is_moroso !== true) addMoney(totalesSinMor, d.tipo_moneda, d.monto_deuda);
  }

  const equivalentesConMor = calcEquivalentes({ totals: totalesConMor, tasas });
  const equivalentesSinMor = calcEquivalentes({ totals: totalesSinMor, tasas });

  // 5) por condominio
  const porCondoConMor = accumulatePorCondominio({ deudas, soloActivas: true, excluirMorosas: false });
  const porCondoSinMor = accumulatePorCondominio({ deudas, soloActivas: true, excluirMorosas: true });

  const equivPorCondoConMor = porCondoConMor.map((x) => ({
    condominio_id: x.condominio_id,
    nombre_condominio: x.nombre_condominio,
    totales: x.totales,
    equivalentes: calcEquivalentes({ totals: x.totales, tasas }),
  }));

  const equivPorCondoSinMor = porCondoSinMor.map((x) => ({
    condominio_id: x.condominio_id,
    nombre_condominio: x.nombre_condominio,
    totales: x.totales,
    equivalentes: calcEquivalentes({ totals: x.totales, tasas }),
  }));

  // 7) movimientos
  const movimientosQ = await client.query(
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
      dt.nombre_titular
    FROM domicilio d
    JOIN torre t ON t.id_torre = d.id_torre_id
    JOIN condominio c ON c.id_condominio = t.id_condominio_id
    JOIN deudas de ON de.id_domicilio_id = d.id_domicilio
    JOIN recibos r ON r.id_deuda_id = de.id_deuda
    JOIN movimientos m ON m.id_movimiento = r.id_movimiento_id
    LEFT JOIN datos_transaccion dt ON dt.id_movimiento_id = m.id_movimiento
    WHERE d.id_propietario_id = $1
    ORDER BY m.fecha_movimiento DESC NULLS LAST, m.id_movimiento DESC
    LIMIT 200
    `,
    [propietarioId]
  );

  return {
    domicilios,
    deudas,
    movimientos: movimientosQ.rows,
    tasas,

    totales_activos_con_morosidad: totalesConMor,
    totales_activos_sin_morosidad: totalesSinMor,

    equivalentes_activos_con_morosidad: equivalentesConMor,
    equivalentes_activos_sin_morosidad: equivalentesSinMor,

    totales_activos_con_morosidad_por_condominio: porCondoConMor,
    totales_activos_sin_morosidad_por_condominio: porCondoSinMor,

    equivalentes_activos_con_morosidad_por_condominio: equivPorCondoConMor,
    equivalentes_activos_sin_morosidad_por_condominio: equivPorCondoSinMor,
  };
}

export const getResumenPropietarioMe = async (req, res) => {
  try {
    const usuarioId = toInt(req.user?.id);
    if (!usuarioId || usuarioId <= 0) return res.status(401).json({ message: "No autenticado" });

    const pQ = await pool.query(
      `
      SELECT *
      FROM propietario
      WHERE id_usuario_id = $1
      LIMIT 1
      `,
      [usuarioId]
    );

    if (!pQ.rowCount) {
      return res.status(404).json({ message: "No existe propietario para este usuario" });
    }

    const propietario = pQ.rows[0];

    const resumen = await buildResumenPropietario({
      propietarioId: propietario.id_propietario,
      client: pool,
    });

    return res.json({ propietario, ...resumen });
  } catch (error) {
    console.error("getResumenPropietarioMe:", error);
    return res.status(500).json({ message: "Error al obtener resumen del propietario" });
  }
};

export const getResumenPropietarioPorUsuario = async (req, res) => {
  try {
    const usuarioId = toInt(req.params.usuarioId);
    if (!usuarioId || usuarioId <= 0) return res.status(400).json({ message: "usuarioId inválido" });

    const pQ = await pool.query(
      `
      SELECT *
      FROM propietario
      WHERE id_usuario_id = $1
      LIMIT 1
      `,
      [usuarioId]
    );

    if (!pQ.rowCount) {
      return res.status(404).json({ message: "No existe propietario para este usuario" });
    }

    const propietario = pQ.rows[0];

    const resumen = await buildResumenPropietario({
      propietarioId: propietario.id_propietario,
      client: pool,
    });

    return res.json({ propietario, ...resumen });
  } catch (error) {
    console.error("getResumenPropietarioPorUsuario:", error);
    return res.status(500).json({ message: "Error al obtener resumen del propietario" });
  }
};