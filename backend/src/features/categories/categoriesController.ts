import { Request, Response } from "express";
import { supabase } from "../../config/db";

// หมวดจากป้าย ททท. (D-39) พร้อมกลุ่มใหญ่ (HISTORY_CULTURE | NATURE | RECREATION) ให้หน้าสร้างทริปจัด chip ตามกลุ่ม
// กรอง parent_group ไม่ว่าง = ซ่อนหมวดอังกฤษเดิมที่ยังค้างใน DB จนกว่า SQL P5b ชุดที่ 2 ลบทิ้ง (เอาเงื่อนไขออกได้หลังจากนั้น)
export const getCategories = async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("categories")
    .select("category_id, category_name, parent_group")
    .not("parent_group", "is", null)
    .order("category_name");

  if (error) {
    console.error("getCategories error:", error.message);
    return res.status(500).json({ message: "ดึงหมวดหมู่ไม่สำเร็จ" });
  }
  res.json({ categories: data });
};
