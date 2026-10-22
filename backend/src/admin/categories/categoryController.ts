import { Response } from "express";
import { AuthRequest } from "../../features/auth/authMiddleware";
import { isUuid, parseCategoryUpdate, parseLabelMove } from "./categoryInput";
import {
  categoryExists,
  isCategoryNameTaken,
  listAdminCategories,
  moveLabel,
  updateCategory,
} from "./categoryQueries";

// ทุก response ที่แก้สำเร็จคืนรายการล่าสุดทั้งหมด ให้หน้าเว็บแสดงผลตาม DB ทันที
async function respondWithCategories(res: Response) {
  res.json({ categories: await listAdminCategories() });
}

// GET /api/admin/categories
export const getAdminCategories = async (_req: AuthRequest, res: Response) => {
  try {
    await respondWithCategories(res);
  } catch (err) {
    console.error("getAdminCategories error:", err);
    res.status(500).json({ message: "ดึงข้อมูลหมวดหมู่ไม่สำเร็จ" });
  }
};

// PUT /api/admin/categories/:categoryId — แก้ชื่อ กลุ่มใหญ่ env price (D-40)
export const putCategory = async (req: AuthRequest, res: Response) => {
  const { categoryId } = req.params;
  if (!isUuid(categoryId)) return res.status(400).json({ message: "รหัสหมวดหมู่ไม่ถูกต้อง" });

  const parsed = parseCategoryUpdate(req.body);
  if ("error" in parsed) return res.status(400).json({ message: parsed.error });

  try {
    if (await isCategoryNameTaken(parsed.value.category_name, categoryId)) {
      return res.status(409).json({ message: "มีหมวดชื่อนี้อยู่แล้ว" });
    }
    if (!(await updateCategory(categoryId, parsed.value))) {
      return res.status(404).json({ message: "ไม่พบหมวดหมู่นี้" });
    }
    await respondWithCategories(res);
  } catch (err) {
    console.error("putCategory error:", err);
    res.status(500).json({ message: "บันทึกหมวดหมู่ไม่สำเร็จ" });
  }
};

// PUT /api/admin/categories/labels/:labelId — ย้ายป้าย ททท. ไปหมวดอื่น (D-40)
export const putLabelCategory = async (req: AuthRequest, res: Response) => {
  const { labelId } = req.params;
  if (!isUuid(labelId)) return res.status(400).json({ message: "รหัสป้ายไม่ถูกต้อง" });

  const parsed = parseLabelMove(req.body);
  if ("error" in parsed) return res.status(400).json({ message: parsed.error });

  try {
    if (!(await categoryExists(parsed.value))) {
      return res.status(400).json({ message: "ไม่พบหมวดปลายทาง" });
    }
    if (!(await moveLabel(labelId, parsed.value))) {
      return res.status(404).json({ message: "ไม่พบป้ายนี้" });
    }
    await respondWithCategories(res);
  } catch (err) {
    console.error("putLabelCategory error:", err);
    res.status(500).json({ message: "ย้ายป้ายไม่สำเร็จ" });
  }
};
