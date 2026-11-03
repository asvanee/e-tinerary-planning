import { getKnownPrice, getPlaceCost } from "../../utils/placePrice";
import type { PriceNature, EnvironmentType } from "./poiPlaceQueries";

// คะแนนหมวด: ตรงหมวดที่เลือก = 1 · หมวดอื่นที่เติมเข้ามา = 0 · ไม่ได้เลือกหมวด = null (ไม่คิดในสูตร)
export function calculateCategoryScore(categoryMatch: boolean | null): number | null {
  if (categoryMatch === null) return null;
  return categoryMatch ? 1 : 0;
}

// คะแนนรีวิว = rating / 5 · ไม่มี rating = null (ไม่คิดในสูตร ไม่เดาคะแนน)
export function calculateRatingScore(rating: number | null): number | null {
  if (rating === null) return null;
  return rating / 5;
}

// คะแนนระยะทาง: ยิ่งใกล้ยิ่งสูง (ระยะ 0 ได้ 1)
export function calculateDistanceScore(distanceKm: number): number {
  return 1 / (1 + distanceKm);
}

// สถานที่โดนฝนแค่ไหน ตาม environment_type ของหมวด (กลางแจ้ง 1 · ผสม 0.5 · ในร่ม 0)
const RAIN_EXPOSURE: Record<EnvironmentType, number> = {
  OUTDOOR: 1,
  MIXED: 0.5,
  INDOOR: 0,
};

// คะแนนสภาพอากาศ (ดูแค่โอกาสฝน %) = exposure × (1 − ฝน) + (1 − exposure)
// ในร่มได้ 1 เสมอ · ไม่มีพยากรณ์ได้ 1 ทุกที่ (อันดับไม่เปลี่ยน)
export function calculateWeatherScore(
  environmentType: EnvironmentType,
  rainProbability: number | null
): number {
  if (rainProbability === null || !Number.isFinite(rainProbability)) return 1.0;

  const rain = Math.min(1, Math.max(0, rainProbability / 100));
  const exposure = RAIN_EXPOSURE[environmentType] ?? RAIN_EXPOSURE.MIXED;

  return exposure * (1 - rain) + (1 - exposure) * 1;
}

// คะแนนราคา = 1 − ราคาต่อคน / งบต่อคนต่อวัน (0-1) · ฟรีได้ 1 · ไม่ทราบราคา = null (ไม่คิดในสูตร)
export function calculatePriceScore(
  placeCost: number | null,
  dailyBudget: number
): number | null {
  if (placeCost === null) return null;
  if (dailyBudget <= 0) return placeCost === 0 ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - placeCost / dailyBudget));
}

const WEIGHTS = {
  category: 0.35,
  rating: 0.25,
  distance: 0.15,
  budget: 0.15,
  weather: 0.1,
};

// น้ำหนักของแต่ละด้าน — ด้านที่ไม่คิดในสูตร (ราคา/หมวด/รีวิว) ได้ 0 แล้วแบ่งน้ำหนักคืนให้ด้านที่เหลือ
// ตามสัดส่วนเดิม ให้รวมเป็น 1 เสมอ (ราคาคงที่ 0.15 เมื่อคิด)
function computeWeights(budgetWeight: number, includeCategory: boolean, includeRating: boolean) {
  const category = includeCategory ? WEIGHTS.category : 0;
  const rating = includeRating ? WEIGHTS.rating : 0;
  const scale =
    (1 - budgetWeight) /
    (category + rating + WEIGHTS.distance + WEIGHTS.weather);
  return {
    category: category * scale,
    rating: rating * scale,
    distance: WEIGHTS.distance * scale,
    weather: WEIGHTS.weather * scale,
    budget: budgetWeight,
  };
}

export interface PoiScoreBreakdown {
  // คะแนนที่เป็น null = ด้านนั้นไม่ได้คิดในสูตร
  categoryScore: number | null;
  ratingScore: number | null;
  distanceScore: number;
  // คะแนนราคา (บันทึกในคอลัมน์ budget_score)
  budgetScore: number | null;
  weatherScore: number;
  poiScore: number;
  // ราคาต่อคนจาก Google — null = ไม่ทราบราคา (ไม่ใช่ฟรี) หน้าเว็บแสดง "ไม่ทราบราคาแน่ชัด"
  placeCost: number | null;
  perPersonDailyBudget: number | null;
}

// คะแนนรวม POI ของสถานที่ 1 แห่ง — คิดราคาเฉพาะเมื่อตั้งงบและรู้ราคา
export function calculatePoiScore(
  categoryMatch: boolean | null, // null = ผู้ใช้ไม่ได้เลือกหมวด
  rating: number | null,
  distanceKm: number, // ระยะทางถนนจากจุดเริ่มต้น (กม.)
  dailyBudget: number | null, // งบต่อคนต่อวัน
  priceRangeStart: number | null, // ช่วงราคาต่อคน (บาท)
  priceRangeEnd: number | null,
  priceNature: PriceNature,
  useBudget: boolean,
  environmentType: EnvironmentType,
  rainProbability: number | null // null = ไม่มีพยากรณ์
): PoiScoreBreakdown {
  const categoryScore = calculateCategoryScore(categoryMatch);
  const includeCategory = categoryScore !== null;
  const ratingScore = calculateRatingScore(rating);
  const distanceScore = calculateDistanceScore(distanceKm);
  const weatherScore = calculateWeatherScore(environmentType, rainProbability);

  // ราคาใช้แสดงผล — คืนเสมอแม้ไม่ได้ตั้งงบ
  const placeCost = getKnownPrice(priceRangeStart, priceRangeEnd);

  const budgetScore =
    useBudget && dailyBudget !== null
      ? calculatePriceScore(getPlaceCost(priceRangeStart, priceRangeEnd, priceNature), dailyBudget)
      : null;

  const weights = computeWeights(
    budgetScore === null ? 0 : WEIGHTS.budget,
    includeCategory,
    ratingScore !== null
  );

  const poiScore =
    weights.category * (categoryScore ?? 0) +
    weights.rating * (ratingScore ?? 0) +
    weights.distance * distanceScore +
    weights.budget * (budgetScore ?? 0) +
    weights.weather * weatherScore;

  return {
    categoryScore,
    ratingScore,
    distanceScore,
    budgetScore,
    weatherScore,
    poiScore,
    placeCost,
    perPersonDailyBudget: dailyBudget,
  };
}