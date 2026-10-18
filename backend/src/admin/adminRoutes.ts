import { Router } from "express";
import { requireAuth } from "../features/auth/authMiddleware";
import { requireAdmin } from "./requireAdmin";
import { getAdminMe } from "./adminController";
import provincesRoutes from "./provinces/provincesRoutes";

const router = Router();

// ทุก route ของ admin ต้องผ่านทั้งสองตัว (D-24)
router.use(requireAuth, requireAdmin);

router.get("/me", getAdminMe);
router.use("/provinces", provincesRoutes);

export default router;
