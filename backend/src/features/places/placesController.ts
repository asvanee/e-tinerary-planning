import { Request, Response } from "express";
import { supabase } from "../../config/db";

/**
 * GET /api/places?ids=uuid1,uuid2,uuid3
 * คืนข้อมูลสถานที่ (ชื่อ, จังหวัด, พิกัด ฯลฯ) ตาม place_id ที่ส่งมา
 * ใช้สำหรับฝั่ง frontend join เข้ากับผลลัพธ์จาก /calculate-poi
 * (ฝั่งนั้น return แค่ placeId + คะแนน ไม่มีชื่อสถานที่)
 */
export const getPlacesByIds = async (req: Request, res: Response) => {
  const { ids } = req.query;

  if (!ids || typeof ids !== "string") {
    return res.status(400).json({ message: "ต้องระบุ ids (comma-separated)" });
  }

  const placeIds = ids
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (placeIds.length === 0) {
    return res.status(400).json({ message: "ไม่พบ id ที่ถูกต้อง" });
  }

  try {
    const { data, error } = await supabase
  .from("places")
  .select(`
    place_id,
    place_name,
    province,
    district,
    latitude,
    longitude,
    rating,
    price_level,
    formatted_address,
    phone_number,
    website,
    opening_hours,
    user_ratings_total,
    att_type_label,
    att_category_label
  `)
  .in("place_id", placeIds);

    if (error) {
      console.error("getPlacesByIds error:", error.message);
      return res.status(500).json({ message: "ดึงข้อมูลสถานที่ไม่สำเร็จ" });
    }

    return res.status(200).json({ places: data ?? [] });
  } catch (err: any) {
    console.error("getPlacesByIds exception:", err);
    return res.status(500).json({ message: err.message || "เกิดข้อผิดพลาดภายในระบบ" });
  }
};