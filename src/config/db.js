import pg from "pg";
import {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL,
} from "./env.js";

export const pool = new pg.Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  ssl: DB_SSL ? { rejectUnauthorized: false } : false,
});

pool.on("connect", async (client) => {
  try {
    const r = await client.query(
      "select current_database() db, inet_server_addr() addr, inet_server_port() port, current_user usr"
    );
    console.log("✅ PG:", r.rows[0]);
  } catch {
    console.log("✅ PG: conectado");
  }
});

pool.on("error", (err) => {
  console.error("❌ Pool error:", err);
});