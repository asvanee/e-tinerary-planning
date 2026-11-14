import { Request, Response } from "express";
import { supabase } from "../../config/db";
import { errorMessage } from "../../utils/errorMessage";

type PlaceDetailRow = {
  category_labels: {
    categories: { price_nature: string | null };
  };
} & Record<string, unknown>;

// GET /api/places?ids=a,b,c — ข้อมูลสถานที่ตาม id ให้หน้าแนะนำและหน้าจัดแผนใช้คำนวณเอง
// อ่านหมวดแบบเดียวกับ getSelectedPlaces เพื่อให้ตัวเลขที่หน้าเว็บเห็นตรงกับตอน backend ตรวจซ้ำ
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
      message: errorMessage(err) || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};
