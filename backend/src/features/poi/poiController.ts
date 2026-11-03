import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";
import { getTripInfo, getFilteredPlaces, POI_RESULT_LIMIT } from "./poiPlaceQueries";
import { calculatePoiScore } from "./poiScoreCalculator";
import { getRoadDistancesKm } from "../../utils/orsDistance";
import { getAverageRainProbability, gridKey } from "../../utils/weatherForecast";
import { errorMessage } from "../../utils/errorMessage";

// ลบ poi_scores ของทริปที่ไม่อยู่ในผลรอบล่าสุด (keepPlaceIds ว่าง = ลบทั้งทริป)
// เรียกหลังบันทึกผลใหม่สำเร็จเท่านั้น ถ้าบันทึกพังผลเดิมยังอยู่ครบ
async function deleteStalePoiScores(tripId: string, keepPlaceIds: string[]) {
  let query = supabase.from("poi_scores").delete().eq("trip_id", tripId);

  if (keepPlaceIds.length > 0) {
    query = query.not("place_id", "in", `(${keepPlaceIds.join(",")})`);
  }

  return query;
}

// คำนวณคะแนน POI ของทริปใหม่ทุกครั้ง: กรองสถานที่ → หาระยะทาง + พยากรณ์ฝน → คิดคะแนน
// → เก็บ 50 อันดับแรกลง poi_scores แล้วลบผลเก่าที่หลุดอันดับ
export const calculatePoi = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  try {
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

    const { places, categoryMatchCount, categoryFilled } = await getFilteredPlaces(
      tripId,
      trip
    );

    if (places.length === 0) {
      const { error: clearError } = await deleteStalePoiScores(tripId, []);
      if (clearError) {
        console.error("Clear poi_scores error:", clearError.message);
      }

      return res.status(200).json({
        message:
          "ไม่พบสถานที่ที่ตรงเงื่อนไข (จังหวัด/งบ) ของทริปนี้",
        categoryMatchCount,
        categoryFilled,
        results: [],
      });
    }

    const {
      distancesKm,
      source: distanceSource,
      perPlaceSource,
    } = await getRoadDistancesKm(
      trip.startLat,
      trip.startLng,
      places
    );

    const rainByGrid = await getAverageRainProbability(
      places.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })),
      trip.startDate,
      trip.endDate
    );

    const scoredPlaces = places.map((place) => {
      // getRoadDistancesKm คืนค่าให้ทุกสถานที่เสมอ
      const distanceKm = distancesKm.get(place.placeId) as number;

      const breakdown = calculatePoiScore(
        place.categoryMatch,
        place.rating,
        distanceKm,
        trip.dailyBudget,
        place.priceRangeStart,
        place.priceRangeEnd,
        place.priceNature,
        trip.useBudget,
        place.environmentType,
        rainByGrid.get(gridKey(Number(place.latitude), Number(place.longitude))) ?? null
      );

      return {
        placeId: place.placeId,
        // categoryName / priceNature ใช้แสดงผลในหน้าแนะนำ
        categoryName: place.categoryName,
        priceNature: place.priceNature,
        // "ors" = ระยะทางถนน, "haversine" = เส้นตรงโดยประมาณ
        distanceMethod: perPlaceSource.get(place.placeId) ?? "haversine",
        ...breakdown,
      };
    });

    scoredPlaces.sort((a, b) => b.poiScore - a.poiScore);
    const topResults = scoredPlaces.slice(0, POI_RESULT_LIMIT);

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

    // Auto Trip อ่าน poi_scores ทุกแถวของทริป จึงต้องลบผลที่หลุดอันดับ
    const { error: staleError } = await deleteStalePoiScores(
      tripId,
      topResults.map((result) => result.placeId)
    );

    if (staleError) {
      console.error("Delete stale poi_scores error:", staleError.message);
      return res.status(500).json({
        message: "คำนวณคะแนนสำเร็จ แต่ล้างผลลัพธ์เก่าไม่สำเร็จ",
      });
    }

    return res.status(200).json({
      message: "คำนวณคะแนนสถานที่สำเร็จ",
      categoryMatchCount,
      categoryFilled,
      distanceSource,
      // false = ไม่มีพยากรณ์ฝนเลย คะแนนสภาพอากาศเป็น 1.0 ทุกที่
      weatherAvailable: rainByGrid.size > 0,
      results: topResults,
    });
  } catch (err) {
    console.error("Calculate POI exception:", err);
    return res.status(500).json({
      message: errorMessage(err) || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};
