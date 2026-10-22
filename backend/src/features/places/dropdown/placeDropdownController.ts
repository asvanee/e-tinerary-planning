import { Request, Response } from "express";
import { supabase } from "../../../config/db";

/**
 * dropdown จังหวัด/อำเภอในฟอร์มสร้างทริป (createTrip.tsx) — ดึงค่าจริงจากตาราง places
 * เพื่อให้ผู้ใช้เลือกได้เฉพาะพื้นที่ที่มีสถานที่ในระบบ (ไม่ได้ผล POI 0 ที่แบบเงียบๆ)
 *
 * mount ที่ /api/place-dropdown (แยกจาก /api/places ของ placesRoutes.ts)
 */

/**
 * GET /api/place-dropdown/provinces
 * รายชื่อจังหวัดที่มีสถานที่ในระบบ (distinct, เรียงตามตัวอักษรไทย)
 */
export const getProvinces = async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("places")
    .select("province")
    .not("province", "is", null);

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  const provinces = Array.from(
    new Set(
      (data ?? [])
        .map((row: { province: string | null }) => row.province)
        .filter((p): p is string => !!p && p.trim() !== "")
    )
  ).sort((a, b) => a.localeCompare(b, "th"));

  res.json({ provinces });
};

/**
 * GET /api/place-dropdown/districts
 * GET /api/place-dropdown/districts?province=กรุงเทพมหานคร
 *
 * รายชื่อ district ที่มีใน places (distinct, เรียงตามตัวอักษรไทย)
 * ส่ง province มา -> เฉพาะจังหวัดนั้น · ไม่ส่ง -> ทั้งหมด
 */
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

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  const districts = Array.from(
    new Set(
      (data ?? [])
        .map((row: { district: string | null }) => row.district)
        .filter((d): d is string => !!d && d.trim() !== "")
    )
  ).sort((a, b) => a.localeCompare(b, "th"));

  res.json({ districts });
};
