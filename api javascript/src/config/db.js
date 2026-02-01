import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const user = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASSWORD || 'mu123456';
const host = process.env.DB_HOST || 'localhost';
const database = process.env.DB_NAME || 'condo_db';
const port = parseInt(process.env.DB_PORT || '5432', 10);

if (!password) {
    console.warn('⚠️ DB_PASSWORD vacío en .env – Verifica que exista .env en la raíz del proyecto y tenga DB_PASSWORD=tu_contraseña');
}

export const pool = new pg.Pool({ user, host, database, password, port });

pool.on('connect', () => {
    console.log('✅ Conectado a PostgreSQL');
});