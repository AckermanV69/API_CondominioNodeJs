import { pool } from "../config/db.js";

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toNum = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const toBool = (v, def = false) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  if (typeof v === "number") return v !== 0;
  return def;
};

// =======================
// GET /api/condominios/:id
// (tu comentario decía querystring, pero el código usa params.id)
// =======================
export const getCondominios = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "ID inválido" });
  }

  try {
    const q = await pool.query(
      `
      SELECT
        id_condominio AS id,
        nombre_condominio AS nombre,
        rif_condominio AS rif,
        direccion_condominio AS direccion,
        codigo_tlf_1,
        tlf_1,
        codigo_tlf_2,
        tlf_2,
        email AS correo_administrador,
        saldo_edificio,
        tipo_condominio,
        saldo_edificio_eur,
        saldo_edificio_usd,
        created_at,
        updated_at
      FROM condominio
      WHERE id_condominio = $1
      LIMIT 1
      `,
      [id]
    );

    if (!q.rowCount) return res.status(404).json({ message: "Condominio no encontrado" });

    return res.json(q.rows[0]);
  } catch (e) {
    console.error("getCondominioById:", e);
    return res.status(500).json({ message: "Error al obtener condominio" });
  }
};

// =======================
// POST /api/condominios/crear
// (reescrito para columnas reales de tu BD)
// =======================
export const crearCondominio = async (req, res) => {
  try {
    const {
      // payload “nuevo”
      nombre_condominio,
      rif_condominio,
      direccion_condominio,
      codigo_tlf_1,
      tlf_1,
      codigo_tlf_2,
      tlf_2,
      email,
      tipo_condominio,

      // compat “viejo”
      nombre,
      direccion,
      correo_administrador,
      admin,
      adminEmail,
    } = req.body || {};

    const nombreClean = String(nombre_condominio ?? nombre ?? "").trim();
    const emailClean = String(email ?? correo_administrador ?? admin ?? adminEmail ?? "")
      .trim()
      .toLowerCase();

    if (!nombreClean) {
      return res.status(400).json({ message: "Falta nombre_condominio" });
    }

    // ✅ NOT NULL en tu BD: codigo_tlf_1 (y usualmente tlf_1)
    // Define defaults seguros si el front no manda nada.
    const codigo1 = String(codigo_tlf_1 ?? "").trim() || "0000";
    const tlf1 = String(tlf_1 ?? "").trim() || "0000000000";

    // secundarios opcionales: los dejamos null si no vienen
    const codigo2 = String(codigo_tlf_2 ?? "").trim() || null;
    const tlf2 = String(tlf_2 ?? "").trim() || null;

    const rif = String(rif_condominio ?? "").trim() || null;
    const dir = String(direccion_condominio ?? direccion ?? "").trim() || null;
    const tipo = String(tipo_condominio ?? "").trim() || null;
    const correo = emailClean || null;

    const q = await pool.query(
      `
      INSERT INTO condominio (
        nombre_condominio,
        rif_condominio,
        direccion_condominio,
        codigo_tlf_1,
        tlf_1,
        codigo_tlf_2,
        tlf_2,
        email,
        tipo_condominio,
        created_at,
        updated_at,
        saldo_edificio,
        saldo_edificio_eur,
        saldo_edificio_usd
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        NOW(), NOW(),
        0,0,0
      )
      RETURNING
        id_condominio AS id,
        nombre_condominio AS nombre,
        rif_condominio AS rif,
        direccion_condominio AS direccion,
        codigo_tlf_1,
        tlf_1,
        codigo_tlf_2,
        tlf_2,
        email AS correo_administrador,
        saldo_edificio,
        tipo_condominio,
        saldo_edificio_eur,
        saldo_edificio_usd,
        created_at,
        updated_at
      `,
      [nombreClean, rif, dir, codigo1, tlf1, codigo2, tlf2, correo, tipo]
    );

    return res.status(201).json({ message: "Condominio creado", condominio: q.rows[0] });
  } catch (error) {
    console.error("crearCondominio:", error);
    if (error.code === "23505") {
      return res.status(409).json({ message: "Duplicado detectado.", detail: error.detail });
    }
    if (error.code === "23502") {
      // NOT NULL violation: devolvemos más info útil
      return res.status(400).json({
        message: `Falta un campo obligatorio (NOT NULL) en la DB: ${error.column ?? "desconocido"}`,
        detail: error.detail,
      });
    }
    return res.status(500).json({ message: "Error al crear condominio" });
  }
};

export const registrarCondominioConUnidades = async (req, res) => {
  const client = await pool.connect();

  try {
    const body = req.body || {};

    // 1) Normalizar condominio
    const nombreClean = String(
      body?.condominio?.nombre_condominio ??
      body?.nombre_condominio ??
      body?.nombre ??
      ""
    ).trim();

    const emailClean = String(
      body?.condominio?.email ??
      body?.email ??
      body?.correo_administrador ??
      body?.admin ??
      body?.adminEmail ??
      ""
    ).trim().toLowerCase();

    if (!nombreClean) {
      return res.status(400).json({ message: "Falta nombre_condominio (o nombre)" });
    }

    // 2) Normalizar torres+domicilios
    // Caso nuevo: viene torres[]
    let torres = Array.isArray(body?.torres) ? body.torres : null;

    // Caso viejo: viene unidades[]
    if (!torres) {
      const unidades = Array.isArray(body?.unidades) ? body.unidades : null;
      if (!unidades || unidades.length === 0) {
        return res.status(400).json({
          message: "Debe enviar torres[] (nuevo) o unidades[] (compatibilidad).",
        });
      }

      // Convertir unidades -> domicilios en una torre default
      const domicilios = unidades
        .map((u) => {
          const seccion = String(u?.seccion || "").trim();
          const numero = String(u?.numero ?? u?.nombre_unidad ?? "").trim();
          const nombre_domicilio = seccion ? `${seccion}-${numero}` : numero;
          return {
            nombre_domicilio: nombre_domicilio || null,
            piso_domicilio: null,
            tipo_domicilio: null,
            alicuota_domicilio: null,
            size_domicilio: null,
            estacionamientos: null,
            id_propietario_id: null,
            estado_deuda: false, // NOT NULL
            saldo: null,
            saldo_eur: null,
            saldo_usd: null,
          };
        })
        .filter((d) => d.nombre_domicilio);

      if (domicilios.length === 0) {
        return res.status(400).json({ message: "Unidades inválidas: falta numero/nombre_unidad" });
      }

      torres = [
        {
          nombre_torre: "TORRE 1",
          domicilios,
        },
      ];
    }

    // Validación mínima torres
    torres = torres
      .map((t) => ({
        nombre_torre: String(t?.nombre_torre || "").trim(),
        domicilios: Array.isArray(t?.domicilios) ? t.domicilios : [],
      }))
      .filter((t) => t.nombre_torre);

    if (torres.length === 0) {
      return res.status(400).json({ message: "torres inválidas: falta nombre_torre" });
    }

    // 3) Deduplicar domicilios por torre por (nombre_domicilio + piso)
    const torresNorm = torres.map((t) => {
      const seen = new Set();
      const domiciliosFinal = [];
      for (const d of t.domicilios) {
        const nombreDom = String(d?.nombre_domicilio || "").trim();
        if (!nombreDom) continue;

        const piso = d?.piso_domicilio == null ? "" : String(d.piso_domicilio).trim();
        const key = `${nombreDom.toLowerCase()}__${piso.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        domiciliosFinal.push({
          nombre_domicilio: nombreDom,
          piso_domicilio: d?.piso_domicilio == null ? null : toInt(d.piso_domicilio),
          tipo_domicilio: d?.tipo_domicilio ?? null,
          alicuota_domicilio: d?.alicuota_domicilio == null ? null : toNum(d.alicuota_domicilio),
          size_domicilio: d?.size_domicilio == null ? null : toNum(d.size_domicilio),
          estacionamientos: d?.estacionamientos == null ? null : toInt(d.estacionamientos),
          id_propietario_id: d?.id_propietario_id == null ? null : toInt(d.id_propietario_id),
          estado_deuda: toBool(d?.estado_deuda, false), // NOT NULL
          saldo: d?.saldo == null ? null : toNum(d.saldo),
          saldo_eur: d?.saldo_eur == null ? null : toNum(d.saldo_eur),
          saldo_usd: d?.saldo_usd == null ? null : toNum(d.saldo_usd),
        });
      }
      return { ...t, domicilios: domiciliosFinal };
    });

      // =======================
      // VALIDAR SUMA DE ALICUOTAS
      // =======================

      let sumaAlicuotas = 0;
      let totalDomiciliosConAlicuota = 0;

      for (const t of torresNorm) {
        for (const d of t.domicilios) {
          if (d.alicuota_domicilio != null) {
            sumaAlicuotas += d.alicuota_domicilio;
            totalDomiciliosConAlicuota++;
          }
        }
      }

      // Si ningún domicilio tiene alícuota, bloquear
      if (totalDomiciliosConAlicuota === 0) {
        return res.status(400).json({
          message: "Debe asignar alícuota a los domicilios.",
        });
      }

      // Redondear a 6 decimales para evitar error flotante
      const sumaRedondeada = Number(sumaAlicuotas.toFixed(6));

      // Validar que sea 1.0
      if (sumaRedondeada !== 1) {
        return res.status(400).json({
          message: `La suma total de alícuotas debe ser 1.0. Actualmente es ${sumaRedondeada}`,
        });
      }

    await client.query("BEGIN");

    // 4) Crear condominio real
    const condoIns = await client.query(
      `
      INSERT INTO condominio (
        nombre_condominio,
        rif_condominio,
        direccion_condominio,
        codigo_tlf_1,
        tlf_1,
        codigo_tlf_2,
        tlf_2,
        email,
        tipo_condominio,
        created_at,
        updated_at,
        saldo_edificio,
        saldo_edificio_eur,
        saldo_edificio_usd
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        NOW(), NOW(),
        COALESCE($10,0),
        COALESCE($11,0),
        COALESCE($12,0)
      )
      RETURNING id_condominio
      `,
      [
        nombreClean,
        body?.condominio?.rif_condominio ?? body?.rif_condominio ?? null,
        body?.condominio?.direccion_condominio ?? body?.direccion_condominio ?? body?.direccion ?? null,
        body?.condominio?.codigo_tlf_1 ?? body?.codigo_tlf_1 ?? null,
        body?.condominio?.tlf_1 ?? body?.tlf_1 ?? null,
        body?.condominio?.codigo_tlf_2 ?? body?.codigo_tlf_2 ?? null,
        body?.condominio?.tlf_2 ?? body?.tlf_2 ?? null,
        emailClean || null,
        body?.condominio?.tipo_condominio ?? body?.tipo_condominio ?? null,
        toNum(body?.condominio?.saldo_edificio ?? body?.saldo_edificio),
        toNum(body?.condominio?.saldo_edificio_eur ?? body?.saldo_edificio_eur),
        toNum(body?.condominio?.saldo_edificio_usd ?? body?.saldo_edificio_usd),
      ]
    );

    const condominioId = condoIns.rows[0].id_condominio;

    // 5) Insertar torres y domicilios
    const torresCreadas = [];
    let domiciliosCreados = 0;

    for (const t of torresNorm) {
      // Insert torre
      const torreIns = await client.query(
        `
        INSERT INTO torre (nombre_torre, id_condominio_id, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING id_torre, nombre_torre
        `,
        [t.nombre_torre, condominioId]
      );

      const torre = torreIns.rows[0];
      torresCreadas.push(torre);

      // Insert domicilios
      for (const d of t.domicilios) {
        // si viene propietario, validar exista
        if (d.id_propietario_id != null) {
          const pQ = await client.query(
            `SELECT 1 FROM propietario WHERE id_propietario = $1 LIMIT 1`,
            [d.id_propietario_id]
          );
          if (!pQ.rowCount) {
            throw new Error(`Propietario no existe (id_propietario_id=${d.id_propietario_id})`);
          }
        }

        await client.query(
          `
          INSERT INTO domicilio (
            nombre_domicilio,
            piso_domicilio,
            tipo_domicilio,
            created_at,
            updated_at,
            id_torre_id,
            estacionamientos,
            alicuota_domicilio,
            size_domicilio,
            id_propietario_id,
            saldo,
            saldo_eur,
            saldo_usd,
            estado_deuda,
            id_condominio_id
          )
          VALUES (
            $1,$2,$3,
            NOW(),NOW(),
            $4,$5,$6,$7,$8,
            $9,$10,$11,$12,$13
          )
          `,
          [
            d.nombre_domicilio,
            d.piso_domicilio,
            d.tipo_domicilio,
            torre.id_torre,
            d.estacionamientos,
            d.alicuota_domicilio,
            d.size_domicilio,
            d.id_propietario_id,
            d.saldo,
            d.saldo_eur,
            d.saldo_usd,
            d.estado_deuda, // NOT NULL
            condominioId,
          ]
        );

        domiciliosCreados += 1;
      }
    }

    await client.query("COMMIT");

    // Respuesta
    return res.status(201).json({
      message: "Condominio registrado (modelo real)",
      condominio: { id: condominioId, nombre: nombreClean, email: emailClean || null },
      torres_creadas: torresCreadas.length,
      domicilios_creados: domiciliosCreados,
      detalle_torres: torresCreadas,
      modo: Array.isArray(body?.torres) ? "nuevo" : "compat_unidades",
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {
      console.error("ROLLBACK error:", e);
    }

    console.error("registrarCondominioConUnidades (migrado a torres+domicilios):", error);

    if (error.code === "23505") {
      return res.status(409).json({ message: "Duplicado detectado.", detail: error.detail });
    }

    return res.status(500).json({
      message: "Error al registrar condominio (modelo real)",
      detalle: error.message,
    });
  } finally {
    client.release();
  }
};

// =======================
// GET /api/condominios/:id/resumen
// (tu implementación está bien, la dejo igual)
// =======================
export const getResumenCondominio = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ message: "ID inválido" });
  }

  try {
    // 1️⃣ Datos base del condominio
    const condoQ = await pool.query(
      `
      SELECT
        id_condominio AS id,
        nombre_condominio AS nombre,
        saldo_edificio,
        saldo_edificio_eur,
        saldo_edificio_usd
      FROM condominio
      WHERE id_condominio = $1
      `,
      [id]
    );

    if (!condoQ.rowCount) {
      return res.status(404).json({ message: "Condominio no encontrado" });
    }

    // 2️⃣ Cantidad de torres
    const torresQ = await pool.query(
      `SELECT COUNT(*) FROM torre WHERE id_condominio_id = $1`,
      [id]
    );

    // 3️⃣ Cantidad de domicilios
    const domiciliosQ = await pool.query(
      `
      SELECT COUNT(*)
      FROM domicilio d
      JOIN torre t ON t.id_torre = d.id_torre_id
      WHERE t.id_condominio_id = $1
      `,
      [id]
    );

    return res.json({
      ...condoQ.rows[0],
      total_torres: Number(torresQ.rows[0].count),
      total_domicilios: Number(domiciliosQ.rows[0].count),
    });
  } catch (e) {
    console.error("getResumenCondominio:", e);
    return res.status(500).json({ message: "Error al obtener resumen" });
  }
};

// GET /api/condominios
export const listCondominios = async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT
        id_condominio AS id,
        nombre_condominio AS nombre,
        rif_condominio AS rif,
        direccion_condominio AS direccion,
        email AS correo_administrador,
        created_at,
        updated_at
      FROM condominio
      ORDER BY id_condominio DESC
    `);

    return res.json(q.rows);
  } catch (e) {
    console.error("listCondominios:", e);
    return res.status(500).json({ message: "Error al listar condominios" });
  }
};
