import { Router } from "express";
import { register, login, logout } from "./authController";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

export default router;