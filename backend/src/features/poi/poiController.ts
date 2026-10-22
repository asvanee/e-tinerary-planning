import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";
import { getTripInfo, getFilteredPlaces } from "./poiPlaceQueries";
import { calculatePoiScore } from "./poiScoreCalculator";
import { getRoadDistancesKm } from "../../utils/orsDistance";
import { getAverageRainProbability, gridKey } from "../../utils/weatherForecast";

const RESULT_LIMIT = 50;

/**
 * POST /api/poi/trips/:tripId/calculate-poi
 * คำนวณสดทุกครั้งที่เรียก ไม่ cache แล้ว upsert ทับผลเดิมของทริปใน poi_scores
 * (unique (trip_id, place_id))
 */
export const calculatePoi = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  try {
    // 1. ดึงข้อมูลทริป + เช็คเจ้าของ
    const trip = await getTripInfo(tripId);

    if (!trip) {
      return res.status(404).json({ message: "ไม่พบทริปนี้ในระบบ" });
    }

    if (trip.userId !== req.user?.id) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงทริปนี้" });
    }

    if (trip.startLat === null || trip.startLng === null) {
      return res.status(400).json({
        message: "ทริปนี้ยังไม่มีพิกัดจุดเริ่มต้น ไม่สามารถคำนวณคะแนนได้",
      });
    }

    // 2. กรองสถานที่ตามลำดับ province -> category(+fallback) -> budget -> time
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

    // 2.5 ระยะทางถนนจากจุดเริ่มต้นไปทุก place (ORS Matrix ยิงครั้งเดียวต่อ chunk + cache)
    // ไม่ throw — ถ้า ORS พลาดจะ fallback เป็น haversine ให้เอง แล้วบอกผ่าน distanceSource
    const {
      distancesKm,
      source: distanceSource,
      perPlaceSource,
    } = await getRoadDistancesKm(
      trip.startLat,
      trip.startLng,
      places
    );

    // 2.6 โอกาสฝนเฉลี่ยของช่วงวันเดินทาง (Open-Meteo, ยิง batch ครั้งเดียวต่อคำขอ + cache)
    // ไม่ throw — ถ้า API ล่ม/วันเดินทางเกินช่วงพยากรณ์ จะได้ Map ว่าง → rainProbability = null
    // → weather_score = 1.0 ทุก place (ค่าเท่ากันหมด อันดับไม่เปลี่ยน)
    const rainByGrid = await getAverageRainProbability(
      places.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })),
      trip.startDate,
      trip.endDate
    );

    // 3. คำนวณคะแนนทุก place
    const scoredPlaces = places.map((place) => {
      // ทุก placeId ใน places มีค่าใน distancesKm เสมอ (รับประกันโดย getRoadDistancesKm)
      const distanceKm = distancesKm.get(place.placeId) as number;

      const breakdown = calculatePoiScore(
        place.confidenceScore,
        place.rating,
        distanceKm,
        trip.dailyBudget,
        trip.numberOfPeople,
        place.rawPriceLevel,
        place.priceNature,
        trip.useBudget,
        place.environmentType,
        rainByGrid.get(gridKey(Number(place.latitude), Number(place.longitude))) ?? null
      );

      return {
        placeId: place.placeId,
        // ใช้แสดง badge หมวดหมู่ในหน้า Recommendation (ไม่อยู่ในสูตรคะแนน)
        categoryName: place.categoryName,
        // "ors" = ระยะทางถนนจริง, "haversine" = เส้นตรงประมาณ (ORS หาเส้นทางไปสถานที่นี้ไม่ได้)
        distanceMethod: perPlaceSource.get(place.placeId) ?? "haversine",
        ...breakdown,
      };
    });

    // 4. เรียงคะแนนมากไปน้อย ตัดเหลือ 50 อันดับแรก
    scoredPlaces.sort((a, b) => b.poiScore - a.poiScore);
    const topResults = scoredPlaces.slice(0, RESULT_LIMIT);

    // 5. Upsert ลง poi_scores
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
      distanceSource, // "ors" | "haversine" | "mixed"
      // true = มีพยากรณ์ฝนอย่างน้อยหนึ่งพื้นที่ (false = ใช้ fallback weather_score 1.0 ทุก place)
      weatherAvailable: rainByGrid.size > 0,
      results: topResults,
    });
  } catch (err) {
    console.error("Calculate POI exception:", err);
    return res.status(500).json({
      message: (err as { message?: string } | null)?.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};
