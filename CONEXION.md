# API Condominios – Conexión BD y frontend

## Base de datos

- **Archivo de diseño:** `base de datos local.pgerd` (pgAdmin).
- **Conexión** (en `src/config/db.js`): PostgreSQL en `localhost:5432`, base `postgres`, usuario `marco`.

Las tablas que usa el backend son: **usuarios**, **condominios**, **unidades**, **pagos** (y opcionalmente **estados**, **ciudades**).  
Si hace falta crearlas, usa el esquema de referencia en `db/schema.sql` (alineado con el código).

## Arrancar el servidor

```bash
cd "C:\Users\marco\Desktop\api javascript"
npm install
npm run dev
```

API en **http://localhost:3000** (rutas bajo `/api`).

## Frontend

El frontend (app condominios, Expo) debe tener en `config/config.js`:

- `IS_PRODUCTION = false`
- `BASE_DOMAIN = "localhost:3000"` (o tu IP si pruebas en dispositivo físico)

Con eso la app usa `http://localhost:3000/api` para todas las peticiones.

Ver **CONEXION.md** en la raíz del proyecto frontend para más detalle.
