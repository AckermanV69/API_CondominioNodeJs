import { Router } from "express";
import { login, me, logout } from "../controllers/authController.js";
import { authRequired } from "../middlewares/authRequired.js";

const router = Router();

router.post("/login", login);
router.get("/me", authRequired, me);
router.post("/logout", authRequired, logout);

export default router;