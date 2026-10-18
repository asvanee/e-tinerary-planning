import { Router } from "express";
import {
  deleteGroupDecision,
  deleteRowDecision,
  getProvinceReview,
  getProvinces,
  putGroupDecision,
  putRowDecision,
} from "./provincesController";

// mount ใต้ adminRoutes (/api/admin/provinces) — ผ่าน requireAuth + requireAdmin แล้ว
const router = Router();

router.get("/", getProvinces);
router.get("/:province/review", getProvinceReview);
router.put("/:province/groups", putGroupDecision);
router.delete("/:province/groups", deleteGroupDecision);
router.put("/:province/rows/:attId", putRowDecision);
router.delete("/:province/rows/:attId", deleteRowDecision);

export default router;
