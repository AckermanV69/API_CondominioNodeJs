import "dotenv/config";

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const HOST = process.env.HOST || "0.0.0.0";
export const PORT = toInt(process.env.PORT, 3000);

export const DB_HOST = process.env.DB_HOST || "localhost";
export const DB_PORT = toInt(process.env.DB_PORT, 5432);
export const DB_USER = process.env.DB_USER || "postgres";
export const DB_PASSWORD = process.env.DB_PASSWORD || "";
export const DB_NAME = process.env.DB_NAME || "saphiro-condominio";
export const DB_SSL = process.env.DB_SSL === "true";

// Recomendado: fallar rápido en entornos donde sí debe existir password
if (!DB_PASSWORD) {
  throw new Error("Missing DB_PASSWORD in environment");
}