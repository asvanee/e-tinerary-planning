import { Request, Response } from "express";
import { supabase } from "../../../config/db";

// dropdown จังหวัด/อำเภอในฟอร์มสร้างทริป — ดึงจากตาราง places ให้เลือกได้เฉพาะพื้นที่ที่มีสถานที่ในระบบ

// ตัดค่าว่าง/ซ้ำ แล้วเรียงตามตัวอักษรไทย
function distinctSorted(values: (string | null)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim() !== ""))
  ).sort((a, b) => a.localeCompare(b, "th"));
}

export const getProvinces = async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("places")
    .select("province")
    .not("province", "is", null);

  if (error) return res.status(500).json({ message: error.message });

  res.json({ provinces: distinctSorted((data ?? []).map((row: { province: string | null }) => row.province)) });
};

// ส่ง ?province= มาจะได้เฉพาะอำเภอของจังหวัดนั้น ไม่ส่งได้ทั้งหมด
export const getDistricts = async (req: Request, res: Response) => {
  const { province } = req.query;

  let query = supabase
    .from("places")
    .select("district")
    .not("district", "is", null);

  if (typeof province === "string" && province.trim() !== "") {
    query = query.eq("province", province);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ message: error.message });

  res.json({ districts: distinctSorted((data ?? []).map((row: { district: string | null }) => row.district)) });
};
