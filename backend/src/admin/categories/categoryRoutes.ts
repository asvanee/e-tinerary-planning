import { Router } from "express";
import { getAdminCategories, putCategory, putLabelCategory } from "./categoryController";

// /api/admin/categories — ย้ายป้ายและแก้รายละเอียดหมวดได้เท่านั้น (ไม่มีเพิ่ม/ลบ/รวมหมวด)
const router = Router();

router.get("/", getAdminCategories);
router.put("/labels/:labelId", putLabelCategory);
router.put("/:categoryId", putCategory);

export default router;
