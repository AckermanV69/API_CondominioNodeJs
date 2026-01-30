CREATE TABLE IF NOT EXISTS usuarios (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(255) NOT NULL,
    cedula          VARCHAR(50),
    correo          VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    rol             VARCHAR(50)  NOT NULL DEFAULT 'propietario',
    telefono        VARCHAR(50),
    deuda           DECIMAL(12,2) NOT NULL DEFAULT 0,
    condominio_id   INTEGER,
    apartamento     VARCHAR(50),
    seccion         VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);
CREATE INDEX IF NOT EXISTS idx_usuarios_condominio ON usuarios(condominio_id);

-- 2. CONDOMINIOS
CREATE TABLE IF NOT EXISTS condominios (
    id                      SERIAL PRIMARY KEY,
    nombre                  VARCHAR(255) NOT NULL,
    estado                  VARCHAR(100),
    ciudad                  VARCHAR(100),
    direccion               TEXT,
    correo_administrador    VARCHAR(255) NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_condominios_admin ON condominios(correo_administrador);

ALTER TABLE usuarios
    DROP CONSTRAINT IF EXISTS fk_usuarios_condominio;
ALTER TABLE usuarios
    ADD CONSTRAINT fk_usuarios_condominio
    FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE SET NULL;

-- 3. UNIDADES
CREATE TABLE IF NOT EXISTS unidades (
    id              SERIAL PRIMARY KEY,
    condominio_id   INTEGER NOT NULL REFERENCES condominios(id) ON DELETE CASCADE,
    nombre_unidad   VARCHAR(100) NOT NULL,
    seccion         VARCHAR(50),
    mt2             VARCHAR(20),
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    deuda_actual    DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_unidades_condominio ON unidades(condominio_id);
CREATE INDEX IF NOT EXISTS idx_unidades_usuario ON unidades(usuario_id);

-- 4. PAGOS (registro de pagos + cargas)
CREATE TABLE IF NOT EXISTS pagos (
    id              SERIAL PRIMARY KEY,
    usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_email   VARCHAR(255),
    condominio_id   INTEGER REFERENCES condominios(id) ON DELETE SET NULL,
    monto           DECIMAL(12,2) NOT NULL,
    descripcion     VARCHAR(255),
    tipo_pago       VARCHAR(50),
    estado          VARCHAR(50) DEFAULT 'pendiente',
    referencia      VARCHAR(100),
    telefono        VARCHAR(50),
    cedula          VARCHAR(50),
    banco           VARCHAR(100),
    fecha_pago      DATE,
    nombre_unidad   VARCHAR(100),
    estatus         VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pagos_usuario ON pagos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_pagos_email ON pagos(usuario_email);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago);

-- 5. ESTADOS / CIUDADES (opcional, para usercontroller getEstadosConCiudades)
CREATE TABLE IF NOT EXISTS estados (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(100) NOT NULL
);
CREATE TABLE IF NOT EXISTS ciudades (
    id          SERIAL PRIMARY KEY,
    estado_id   INTEGER NOT NULL REFERENCES estados(id),
    nombre      VARCHAR(100) NOT NULL
);
