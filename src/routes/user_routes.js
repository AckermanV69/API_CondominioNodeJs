import { Router } from "express";
import {
  usersget,
  usersgetid,
  usersgetByEmail,
  usersdelete,
  usersput,
  signUpUsuario,
} from "../controllers/usercontroller.js";

const router = Router();

// Users CRUD
router.get("/users", usersget);
router.get("/users/:id", usersgetid);
router.get("/users/email/:email", usersgetByEmail);
router.delete("/users/:id", usersdelete);
router.put("/users/:id", usersput);

// Auth
//router.post("/login", loginUsuario);
router.post("/signup", signUpUsuario);

export default router;
