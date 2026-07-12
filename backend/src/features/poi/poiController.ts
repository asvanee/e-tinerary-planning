import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";
import { getTripInfo, getFilteredPlaces } from "./poiPlaceQueries";
import { calculatePoiScore } from "./poiScoreCalculator";

const RESULT_LIMIT = 50;

/**
 * POST /api/poi/trips/:tripId/calculate-poi
 * ✅ แก้แล้ว: path เดิมเขียนผิดเป็น /api/trips/... — path จริงคือ /api/poi/trips/...
 * เพราะ poiRoutes.ts mount ที่ /api/poi ใน server.ts (ดู poiRoutes.ts + PROJECT_BRIEF ข้อ 3.6)
 * คำนวณสดทุกครั้งที่เรียก ไม่ cache, upsert ทับผลลัพธ์เดิมของ trip นั้นใน poi_scores
 * (มี unique constraint (trip_id, place_id) ยืนยันแล้ว ใช้ upsert ได้)
 */
export const calculatePoi = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  // ✅ เช็คทั้ง undefined และ array (Express params type อนุญาตเป็น string | string[] ได้)
  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  try {
    // 1. ดึงข้อมูลทริป
    const trip = await getTripInfo(tripId);

    if (!trip) {
      return res.status(404).json({ message: "ไม่พบทริปนี้ในระบบ" });
    }

    // ✅ เช็คว่าเป็นเจ้าของทริปจริง ไม่ใช่ user คนอื่น
    if (trip.userId !== req.user?.id) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงทริปนี้" });
    }

    if (trip.startLat === null || trip.startLng === null) {
      return res.status(400).json({
        message: "ทริปนี้ยังไม่มีพิกัดจุดเริ่มต้น ไม่สามารถคำนวณคะแนนได้",
      });
    }

    // 2. กรองสถานที่ตาม pipeline ข้อ 4.1 + 4.5 (province -> category(+fallback) -> budget -> time)
    const { places, categoryFallbackUsed } = await getFilteredPlaces(
      tripId,
      trip
    );

    if (places.length === 0) {
      return res.status(200).json({
        message:
          "ไม่พบสถานที่ที่ตรงเงื่อนไข (จังหวัด/งบ/เวลา) ของทริปนี้",
        categoryFallbackUsed,
        results: [],
      });
    }

    // 3. คำนวณคะแนนทุก place
    const scoredPlaces = places.map((place) => {
      const breakdown = calculatePoiScore(
        place.confidenceScore,
        place.rating,
        trip.startLat,
        trip.startLng,
        place.latitude,
        place.longitude,
        trip.dailyBudget,
        trip.numberOfPeople,
        place.priceLevel,
        place.hasPriceLevel
      );

      return {
        placeId: place.placeId,
        // ✅ เพิ่ม — ใช้แสดง badge หมวดหมู่ที่ตรงกับความสนใจที่เลือกไว้ในหน้า Recommendation
        // (ไม่ใช่ส่วนหนึ่งของสูตรคะแนน แค่ pass-through ข้อมูล display เฉยๆ)
        categoryName: place.categoryName,
        ...breakdown,
      };
    });

    // 4. เรียงคะแนนมากไปน้อย ตัดเหลือ 20-50 อันดับแรก
    scoredPlaces.sort((a, b) => b.poiScore - a.poiScore);
    const topResults = scoredPlaces.slice(0, RESULT_LIMIT);

    // 5. Upsert ลง poi_scores (มี unique constraint (trip_id, place_id) แล้ว)
    const upsertRows = topResults.map((result) => ({
      trip_id: tripId,
      place_id: result.placeId,
      category_score: result.categoryScore,
      rating_score: result.ratingScore,
      distance_score: result.distanceScore,
      budget_score: result.budgetScore,
      weather_score: result.weatherScore,
      poi_score: result.poiScore,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("poi_scores")
      .upsert(upsertRows, { onConflict: "trip_id,place_id" });

    if (upsertError) {
      console.error("Upsert poi_scores error:", upsertError.message);
      return res.status(500).json({
        message: "คำนวณคะแนนสำเร็จ แต่บันทึกผลลัพธ์ไม่สำเร็จ",
      });
    }

    return res.status(200).json({
      message: "คำนวณคะแนนสถานที่สำเร็จ",
      categoryFallbackUsed,
      results: topResults,
    });
  } catch (err: any) {
    console.error("Calculate POI exception:", err);
    return res.status(500).json({
      message: err.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};