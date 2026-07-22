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
 * endTime ต่อกันเป็นลูกโซ่ทั้งวัน
 *
 * ✅ v2 (แก้จริงรอบนี้ — รอบก่อนแก้ไม่ครบ เหลือ has_price_level ค้างอยู่ ทำให้ frontend เอาไป
 * สร้าง PlaceInput สำหรับ itineraryBuilder.ts::getPlaceCost(rawPriceLevel, priceNature) ไม่ได้):
 * เลิก coalesce price_level กับ categories.default_price_level (column กำลังจะ drop ตาม
 * PRICE_SCORE_REDESIGN.md) คืนค่า price_level จริงตรงๆ (null ได้) + เปลี่ยนจาก has_price_level
 * (boolean เดิม) เป็น price_nature ("free" | "food" | "paid_other") ให้ตรงกับ contract ใหม่ที่
 * poiPlaceQueries.ts / poiScoreCalculator.ts / itineraryPlaceQueries.ts::getSelectedPlaces() /
 * itineraryBuilder.ts ใช้กันอยู่แล้วทั้งระบบ
 *
 * join pattern มิเรอร์ให้ตรงกับ getSelectedPlaces() เป๊ะ (ไฟล์เดียวกับที่ buildDraft/
 * confirmItinerary controller เรียกใช้จริง) กันค่าเพี้ยนกันระหว่าง endpoint นี้ (ที่ ItineraryEditor.tsx
 * ใช้ recompute ตอน user ลากปรับ) กับตอน backend re-validate ซ้ำก่อน save
 *
 * ✅ แก้เพิ่มรอบนี้: select confidence_score มาด้วย แล้ว dedupe ด้วยแถวที่ confidence_score
 * สูงสุดต่อ place_id (เกณฑ์เดียวกับ poiPlaceQueries.ts::queryPlacesWithCategoryInfo และ
 * itineraryPlaceQueries.ts::getSelectedPlaces()) — เดิม dedupe ด้วย "แถวแรกที่เจอ" ซึ่งลำดับจาก
 * Supabase ไม่การันตี ทำให้ place ที่มีหลาย category อาจได้ default_duration_min/price_nature
 * คนละค่ากับตอน backend re-validate (getSelectedPlaces) ได้ — ทำให้ user เห็นค่ากะพริบเปลี่ยน
 * ตอนกด "ยืนยันแผน" เหมือนบั๊กเดิมที่เคยแก้ไปแล้วฝั่ง itineraryPlaceQueries.ts
 *
 * หมายเหตุ: place หนึ่งอาจมีได้หลาย category ใน place_categories (many-to-many) — ตอนนี้ dedupe
 * ตามเกณฑ์ confidence_score สูงสุดแล้ว ไม่ใช่แถวแรกที่เจอแบบเดิม
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

    // ✅ Multi-category dedupe — group by place_id แล้วเลือกแถวที่ confidence_score สูงสุด
    // (เกณฑ์เดียวกับ poiPlaceQueries.ts / itineraryPlaceQueries.ts::getSelectedPlaces()) กัน
    // default_duration_min/price_nature สุ่มมาจากคนละ category ทุกครั้งที่ query
    const bestRowByPlaceId = new Map<string, any>();

    for (const row of (data ?? []) as any[]) {
      const place = row.places;
      if (!place) continue;

      const existing = bestRowByPlaceId.get(place.place_id);
      if (
        !existing ||
        (row.confidence_score ?? 0) > (existing.confidence_score ?? 0)
      ) {
        bestRowByPlaceId.set(place.place_id, row);
      }
    }

    // ✅ v2: price_level จริงตรงๆ (null ได้ ไม่ coalesce กับ default_price_level อีกต่อไป) +
    // price_nature แทน has_price_level เดิม — ตรงกับ contract ที่ itineraryBuilder.ts::
    // getPlaceCost(rawPriceLevel, priceNature) ต้องการ
    const places = Array.from(bestRowByPlaceId.values()).map((row: any) => {
      const place = row.places;
      const category = row.categories;
      const { price_level: rawPriceLevel, ...placeRest } = place;

      return {
        ...placeRest,
        price_level: rawPriceLevel,
        price_nature: category?.price_nature ?? null,
        default_duration_min: category?.default_duration_min ?? 60,
      };
    });

    return res.status(200).json({ places });
  } catch (err: any) {
    console.error("getPlacesByIds exception:", err);
    return res.status(500).json({ message: err.message || "เกิดข้อผิดพลาดภายในระบบ" });
  }
};