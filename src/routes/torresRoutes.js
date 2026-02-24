import { Router } from "express";
import { getTorres, getTorreById, createTorre, updateTorre } from "../controllers/torresController.js";

const router = Router();

// GET /api/torres?condominioId=1
router.get("/", getTorres);

// GET /api/torres/:id
router.get("/:id", getTorreById);

// POST /api/torres
router.post("/", createTorre);

// PUT /api/torres/:id
router.put("/:id", updateTorre);

export default router;

