import { Request, Response } from "express";
import { supabase } from "../../config/db";

// หมวดทั้งหมดพร้อมกลุ่มใหญ่ (HISTORY_CULTURE | NATURE | RECREATION) ให้หน้าสร้างทริปจัดกลุ่ม chip
export const getCategories = async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("categories")
    .select("category_id, category_name, parent_group")
    .order("category_name");

  if (error) {
    console.error("getCategories error:", error.message);
    return res.status(500).json({ message: "ดึงหมวดหมู่ไม่สำเร็จ" });
  }
  res.json({ categories: data });
};
