import { Request, Response } from "express";
import { supabase } from "../../config/db";

type PlaceDetailRow = {
  category_labels: {
    categories: { price_nature: string | null };
  };
} & Record<string, unknown>;

/**
 * GET /api/places?ids=uuid1,uuid2,uuid3
 * ข้อมูลสถานที่ตาม place_id — frontend ใช้ join กับผลของ /calculate-poi (ซึ่งมีแค่ placeId + คะแนน)
 * และหน้า itinerary editor ใช้ recompute เอง (ต้องใช้ price_range_*, price_nature, opening_hours — เวลาที่อยู่ผู้ใช้กรอกเอง D-36)
 *
 * หมวดมาจากป้าย ททท. (places -> category_labels -> categories) แบบเดียวกับ itineraryPlaceQueries.ts::getSelectedPlaces
 * เพื่อให้ค่าที่ editor เห็นตรงกับตอน backend re-validate ก่อน save
 * price_range_* เป็นราคาต่อคนจริงจาก Google (null ได้ — D-52) · price_nature เป็น "free" | "paid"
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
      .select(
        `
        place_id,
        place_name,
        province,
        district,
        latitude,
        longitude,
        rating,
        price_range_start,
        price_range_end,
        formatted_address,
        phone_number,
        website,
        opening_hours,
        user_ratings_total,
        att_type_label,
        att_category_label,
        category_labels!inner(categories!inner(price_nature))
      `
      )
      .in("place_id", placeIds);

    if (error) {
      console.error("getPlacesByIds error:", error.message);
      return res.status(500).json({ message: "ดึงข้อมูลสถานที่ไม่สำเร็จ" });
    }

    const rows = (data ?? []) as unknown as PlaceDetailRow[];

    const places = rows.map(({ category_labels, ...place }) => ({
      ...place,
      price_nature: category_labels.categories.price_nature ?? null,
    }));

    return res.status(200).json({ places });
  } catch (err) {
    console.error("getPlacesByIds exception:", err);
    return res.status(500).json({
      message: (err as { message?: string } | null)?.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};
