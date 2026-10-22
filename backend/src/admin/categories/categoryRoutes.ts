import { Router } from "express";
import { getAdminCategories, putCategory, putLabelCategory } from "./categoryController";

// mount ใต้ adminRoutes (/api/admin/categories) — ผ่าน requireAuth + requireAdmin แล้ว
// ขอบเขต D-40: ย้ายป้าย + แก้ชื่อ/กลุ่ม/env/price เท่านั้น (ไม่มีเพิ่ม/ลบ/รวมหมวด)
const router = Router();

router.get("/", getAdminCategories);
router.put("/labels/:labelId", putLabelCategory);
router.put("/:categoryId", putCategory);

export default router;
