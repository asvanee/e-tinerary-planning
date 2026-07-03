import { Request, Response } from "express";
import { supabase } from "../../../config/db";

/**
 * placeDropdownController.ts
 * รวม endpoint ที่ใช้ populate dropdown ในฟอร์มสร้างทริป (createTrip.tsx):
 * - จังหวัด (province)
 * - อำเภอ/เขต (district)
 * ทั้งสองดึงค่าจริงจากตาราง places แทนการ hardcode/ให้พิมพ์เอง เพื่อกันผู้ใช้เลือก/พิมพ์
 * ค่าที่ไม่มีข้อมูลจริงในระบบ แล้วได้ผลลัพธ์ 0 ที่แบบเงียบๆ ตอนคำนวณ POI score
 *
 * mount ที่ /api/place-dropdown (ไม่ใช่ /api/places — path นั้นถูกใช้โดย
 * features/places/placesRoutes.ts เดิมอยู่แล้ว ดู PROJECT_BRIEF หัวข้อ 3.12)
 */

/**
 * GET /api/place-dropdown/provinces
 *
 * คืนรายชื่อจังหวัดที่มีสถานที่จริงอยู่ในระบบเท่านั้น (distinct, sort ตามตัวอักษรไทย)
 * ใช้แทน array 77 จังหวัดที่ hardcode ไว้เดิมใน createTrip.tsx — ข้อมูลตอนนี้มีแค่
 * กรุงเทพฯ จังหวัดเดียว ถ้าปล่อยให้เลือกจังหวัดอื่นที่ยังไม่มีข้อมูล places จะได้
 * ผลลัพธ์ 0 ที่แบบเงียบๆ เหมือนบั๊ก province/district null ที่เคยเจอ
 */
export const getProvinces = async (req: Request, res: Response) => {
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
 * คืนรายชื่อ district ที่มีอยู่จริงใน places (distinct, sort ตามตัวอักษรไทย)
 * ถ้าส่ง province มา -> กรองเฉพาะ district ที่อยู่ในจังหวัดนั้น
 * ถ้าไม่ส่ง province -> คืน district ทั้งหมดที่มีในระบบ
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