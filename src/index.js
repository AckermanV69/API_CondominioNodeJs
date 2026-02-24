import express from "express";
import cors from "cors";
import morgan from "morgan";
import { PORT, HOST } from "./config/env.js";

// Importación de rutas
import userRoutes from "./routes/user_routes.js";
import pagosRoutes from "./routes/pagos_routes.js";
import condominioRoutes from "./routes/condominioRoutes.js";
import deudas_Routes from "./routes/deudas_Routes.js";
import torresRoutes from "./routes/torresRoutes.js";
import propietariosRoutes from "./routes/propietariosRoutes.js";
import movimientosRoutes from "./routes/movimientosRoutes.js";
import domiciliosRoutes from "./routes/domiciliosRoutes.js";
import propietariosAdminRoutes from "./routes/propietariosAdminRoutes.js";
import usuariosAdminRoutes from "./routes/usuariosAdminRoutes.js";
import adminDashboardRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/authRoutes.js";
import tasasRoutes from "./routes/tasasRoutes.js";
import adminTasasRouter from "./routes/tasasAdminRoutes.js";

const app = express();

app.set("etag", false);
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// --- Middlewares ---
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// --- Definición de Rutas ---
app.use("/api", userRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/condominios", condominioRoutes);
app.use("/api/deudas", deudas_Routes);
app.use("/api/torres", torresRoutes);
app.use("/api/propietarios", propietariosRoutes);
app.use("/api/movimientos", movimientosRoutes);
app.use("/api/domicilios", domiciliosRoutes);
app.use("/api", propietariosAdminRoutes);
app.use("/api", usuariosAdminRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/tasas", tasasRoutes);
app.use("/api/admin", adminTasasRouter);

// ✅ CATCH GLOBAL (siempre después de routes)
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", {
    path: req.originalUrl,
    method: req.method,
    message: err.message,
    code: err.code,
    detail: err.detail,
    hint: err.hint,
    where: err.where,
    routine: err.routine,
    schema: err.schema,
    table: err.table,
    column: err.column,
    constraint: err.constraint,
  });

  if (err.query) console.error("SQL:", err.query);
  if (err.parameters) console.error("PARAMS:", err.parameters);

  res.status(500).json({ message: "Error interno del servidor" });
});

// --- Encendido del Servidor ---
const host = process.env.HOST || HOST || "0.0.0.0";
app.listen(PORT, host, () => console.log(`Servidor listo en http://${host}:${PORT}`));