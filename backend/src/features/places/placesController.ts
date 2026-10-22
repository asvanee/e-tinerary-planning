import { Request, Response } from "express";
import { supabase } from "../../config/db";
import { pickBestCategoryRows } from "../../utils/bestCategoryRow";

interface PlaceDetailRow {
  confidence_score: number | null;
  categories: { default_duration_min: number | null; price_nature: string | null } | null;
  places: ({ place_id: string; price_level: number | null } & Record<string, unknown>) | null;
}

/**
 * GET /api/places?ids=uuid1,uuid2,uuid3
 * ข้อมูลสถานที่ตาม place_id — frontend ใช้ join กับผลของ /calculate-poi (ซึ่งมีแค่ placeId + คะแนน)
 * และหน้า itinerary editor ใช้ recompute เอง (ต้องใช้ default_duration_min, price_level, price_nature)
 *
 * join และเลือก category (confidence_score สูงสุด) แบบเดียวกับ itineraryPlaceQueries.ts::getSelectedPlaces
 * เพื่อให้ค่าที่ editor เห็นตรงกับตอน backend re-validate ก่อน save
 * price_level เป็นราคาจริง (null ได้) · price_nature เป็น "free" | "paid"
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
      .from("place_categories")
      .select(
        `
        confidence_score,
        categories!inner(default_duration_min, price_nature),
        places!inner(
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
        )
      `
      )
      .in("place_id", placeIds);

    if (error) {
      console.error("getPlacesByIds error:", error.message);
      return res.status(500).json({ message: "ดึงข้อมูลสถานที่ไม่สำเร็จ" });
    }

    const rows = (data ?? []) as unknown as PlaceDetailRow[];

    const places = pickBestCategoryRows(rows, (row) => row.places?.place_id).map((row) => {
      const { price_level: rawPriceLevel, ...placeRest } = row.places!;

      return {
        ...placeRest,
        price_level: rawPriceLevel,
        price_nature: row.categories?.price_nature ?? null,
        default_duration_min: row.categories?.default_duration_min ?? 60,
      };
    });

    return res.status(200).json({ places });
  } catch (err) {
    console.error("getPlacesByIds exception:", err);
    return res.status(500).json({
      message: (err as { message?: string } | null)?.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};
