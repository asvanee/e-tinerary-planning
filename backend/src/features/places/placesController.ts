import { Request, Response } from "express";
import { supabase } from "../../config/db";

/**
 * GET /api/places?ids=uuid1,uuid2,uuid3
 * คืนข้อมูลสถานที่ (ชื่อ, จังหวัด, พิกัด ฯลฯ) ตาม place_id ที่ส่งมา
 * ใช้สำหรับฝั่ง frontend join เข้ากับผลลัพธ์จาก /calculate-poi
 * (ฝั่งนั้น return แค่ placeId + คะแนน ไม่มีชื่อสถานที่)
 *
 * ✅ อัปเดต: เพิ่ม default_duration_min (จาก categories.default_duration_min ผ่าน place_categories)
 * เข้า response ด้วย — จำเป็นสำหรับหน้า itinerary editor ฝั่ง frontend ที่ต้อง recompute
 * buildDayItems/buildItinerary เอง (client-side, ไม่รอ network) ต้องการ field นี้เพื่อคำนวณ
 * endTime ต่อกันเป็นลูกโซ่ทั้งวัน — join pattern + coalesce (price_level, default_duration_min)
 * mirror ให้ตรงกับ getSelectedPlaces() ใน itineraryPlaceQueries.ts เป๊ะ (ไฟล์เดียวกับที่
 * buildDraft/confirmItinerary controller เรียกใช้จริง) กันค่าเพี้ยนกันระหว่าง endpoint นี้
 * กับตอน backend re-validate ซ้ำก่อน save
 *
 * หมายเหตุ: place หนึ่งอาจมีได้หลาย category ใน place_categories (many-to-many) แต่ในทางปฏิบัติ
 * ของโปรเจกต์นี้ query pattern เดิม (poiPlaceQueries.ts) ไม่ dedupe เพิ่ม — ที่นี่ dedupe ด้วย
 * placeId กันเผื่อไว้ (ใช้ default_duration_min จากแถวแรกที่เจอ) ไม่ให้ response มี place ซ้ำ
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
        categories!inner(default_duration_min, default_price_level),
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

    // dedupe ตาม place_id เผื่อ place หนึ่งมีได้หลาย category (ใช้แถวแรกที่เจอ — ตรงกับ
    // สมมติฐานเดียวกับ itineraryPlaceQueries.ts / poiPlaceQueries.ts)
    const placeMap = new Map<string, any>();

    for (const row of data ?? []) {
      const place = (row as any).places;
      const category = (row as any).categories;

      if (!place || placeMap.has(place.place_id)) continue;

      // ✅ coalesce price_level ให้ตรงกับ getSelectedPlaces() ใน itineraryPlaceQueries.ts เป๊ะ
      // (places.price_level -> categories.default_price_level -> 0) กันหน้า Editor คำนวณ
      // placeCost ผิดจากที่ backend re-validate ตอนกด "ยืนยันแผน"
      const { price_level: rawPriceLevel, ...placeRest } = place;
      const coalescedPriceLevel = rawPriceLevel ?? category?.default_price_level ?? 0;

      placeMap.set(place.place_id, {
        ...placeRest,
        price_level: coalescedPriceLevel,
        default_duration_min: category?.default_duration_min ?? 60,
      });
    }

    return res.status(200).json({ places: Array.from(placeMap.values()) });
  } catch (err: any) {
    console.error("getPlacesByIds exception:", err);
    return res.status(500).json({ message: err.message || "เกิดข้อผิดพลาดภายในระบบ" });
  }
};