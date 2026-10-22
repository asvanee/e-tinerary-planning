import { Router } from "express";
import { requireAuth } from "../features/auth/authMiddleware";
import { requireAdmin } from "./requireAdmin";
import { getAdminMe } from "./adminController";
import provincesRoutes from "./provinces/provincesRoutes";
import importRoutes from "./imports/importRoutes";
import categoryRoutes from "./categories/categoryRoutes";

const router = Router();

// ทุก route ของ admin ต้องผ่านทั้งสองตัว (D-24)
router.use(requireAuth, requireAdmin);

router.get("/me", getAdminMe);
router.use("/provinces", provincesRoutes);
router.use("/imports", importRoutes);
router.use("/categories", categoryRoutes);

export default router;
