import { Request, Response } from "express";
import { supabase } from "../../../config/db";

// dropdown จังหวัด/อำเภอในฟอร์มสร้างทริป — ดึงจากตาราง places ให้เลือกได้เฉพาะพื้นที่ที่มีสถานที่ในระบบ

// ตัดค่าว่าง/ซ้ำ แล้วเรียงตามตัวอักษรไทย
function distinctSorted(values: (string | null)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim() !== ""))
  ).sort((a, b) => a.localeCompare(b, "th"));
}

// อ่านค่าคอลัมน์เดียวของทุกแถวใน places ทีละ 1,000 แถว (Supabase ตอบได้สูงสุด 1,000 แถวต่อครั้ง) · filterProvince = กรองเฉพาะจังหวัดนั้น
const PAGE_SIZE = 1000;
async function fetchColumnValues(
  column: "province" | "district",
  filterProvince?: string
): Promise<{ values: (string | null)[]; failed: boolean }> {
  const values: (string | null)[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from("places").select(column).not(column, "is", null);
    if (filterProvince) query = query.eq("province", filterProvince);
    const { data, error } = await query.order(column).range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`fetch places ${column} error:`, error);
      return { values, failed: true };
    }
    const rows = (data ?? []) as unknown as Record<string, string | null>[];
    values.push(...rows.map((row) => row[column]));
    if (rows.length < PAGE_SIZE) return { values, failed: false };
  }
}

// รายชื่อจังหวัดทั้งหมดที่มีสถานที่ในระบบ (ไม่รับ parameter)
export const getProvinces = async (_req: Request, res: Response) => {
  const { values, failed } = await fetchColumnValues("province");
  if (failed) return res.status(500).json({ message: "ไม่สามารถโหลดรายชื่อจังหวัดได้" });

  res.json({ provinces: distinctSorted(values) });
};

// รายชื่ออำเภอ รับ ?province= (ไม่ส่งจะได้ทุกอำเภอ ส่งมาจะได้เฉพาะของจังหวัดนั้น)
export const getDistricts = async (req: Request, res: Response) => {
  const { province } = req.query;
  const filterProvince = typeof province === "string" && province.trim() !== "" ? province : undefined;

  const { values, failed } = await fetchColumnValues("district", filterProvince);
  if (failed) return res.status(500).json({ message: "ไม่สามารถโหลดรายชื่ออำเภอได้" });

  res.json({ districts: distinctSorted(values) });
};
