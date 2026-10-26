import { getKnownPrice, getPlaceCost } from "../../utils/placePrice";
import type { PriceNature, EnvironmentType } from "./poiPlaceQueries";

// ---------- คะแนนรายด้าน ----------

/**
 * category_score (D-48): 1 สถานที่ = 1 หมวด (D-39)
 * - categoryMatch = true  → หมวดของสถานที่อยู่ในหมวดที่ผู้ใช้เลือก (หมวดใดหมวดหนึ่ง) → 1
 * - categoryMatch = false → ไม่อยู่ในหมวดที่เลือก (ถูกเติมเข้ามาเพราะหมวดที่เลือกมีไม่ถึง 50 ที่) → 0
 * - categoryMatch = null  → ผู้ใช้ไม่ได้เลือกหมวด → null = ตัด category ออกจากสูตร
 */
export function calculateCategoryScore(categoryMatch: boolean | null): number | null {
  if (categoryMatch === null) return null;
  return categoryMatch ? 1 : 0;
}

/**
 * rating_score: rating null → ใช้ 0.5 คงที่
 */
export function calculateRatingScore(rating: number | null): number {
  if (rating === null) return 0.5;
  return rating / 5;
}

/**
 * distance_score: ยิ่งใกล้ยิ่งคะแนนสูง เข้าใกล้ 1 เมื่อระยะทาง = 0
 * รับ distanceKm สำเร็จรูป (ระยะทางถนนจาก ORS Matrix — ดู utils/orsDistance.ts ซึ่งมี
 * fallback เป็น haversine ในตัว)
 */
export function calculateDistanceScore(distanceKm: number): number {
  return 1 / (1 + distanceKm);
}

/**
 * สัดส่วนที่สถานที่ได้รับผลจากฝน ตาม categories.environment_type
 * เกณฑ์จัดกลุ่ม: "ระหว่างทำกิจกรรมหลักของสถานที่นั้น ส่วนใหญ่อยู่ในที่ที่ฝนตกใส่ได้หรือไม่"
 * OUTDOOR = โดนเต็มที่, MIXED = มีทั้งกลางแจ้ง/ในร่ม (ค่ากลาง ไม่มีข้อมูลว่าส่วนไหนมากกว่า),
 * INDOOR = ไม่โดนเลย — ค่าเหล่านี้เป็นพารามิเตอร์ที่ทีมกำหนด ไม่มีมาตรฐานกลาง
 * (ควรทำ sensitivity analysis ของค่า MIXED ที่ 0.3/0.5/0.7 ในรายงาน)
 */
const RAIN_EXPOSURE: Record<EnvironmentType, number> = {
  OUTDOOR: 1,
  MIXED: 0.5,
  INDOOR: 0,
};

/**
 * weather_score (0-1, ยิ่งสูงยิ่งดี): พิจารณาโอกาสฝนตกอย่างเดียว (v1)
 *
 * สูตร: score = exposure × (1 − rainProbability/100) + (1 − exposure) × 1
 * - สถานที่ในร่ม (exposure 0) ได้ 1.0 เสมอ ไม่ถูกลงโทษเพราะฝน
 * - สถานที่กลางแจ้ง (exposure 1) ได้ตามโอกาสฝนจริง
 * - rainProbability = null (ไม่มีพยากรณ์: API ล่ม/timeout หรือวันเดินทางไกลเกินช่วงพยากรณ์)
 *   → คืน 1.0 ทุกสถานที่ ค่าเท่ากันหมด อันดับจึงไม่เปลี่ยนและไม่ต้องปรับ weight
 *
 * rainProbability รับเป็นเปอร์เซ็นต์ 0-100 (precipitation_probability_max ของ Open-Meteo)
 * ปัจจัยอื่น (ความร้อน, UV, ลม, PM2.5) ยังไม่รวม — เป็นแนวทางพัฒนาต่อ
 */
export function calculateWeatherScore(
  environmentType: EnvironmentType,
  rainProbability: number | null
): number {
  if (rainProbability === null || !Number.isFinite(rainProbability)) return 1.0;

  const rain = Math.min(1, Math.max(0, rainProbability / 100));
  const exposure = RAIN_EXPOSURE[environmentType] ?? RAIN_EXPOSURE.MIXED;

  return exposure * (1 - rain) + (1 - exposure) * 1;
}

// ---------- price score (D-52) ----------

/**
 * price_score (0-1): ยิ่งราคาต่อคนน้อยเทียบกับงบต่อคนต่อวัน (D-51) ยิ่งคะแนนสูง
 * สูตร: 1 − placeCost / dailyBudget (cap 0-1) — ไม่มีค่าคงที่ที่ทีมตั้งเอง ใช้แค่ราคาจาก Google กับงบที่ผู้ใช้กรอก
 * - ฟรี (placeCost 0) = 1 · ราคาเท่างบพอดี = 0 (ที่แพงกว่างบถูก hard filter ตัดไปแล้ว)
 * - ไม่ทราบราคา (paid ที่ไม่มี priceRange) → null = ตัดมิติราคาออก แล้ว renormalize weight คืนให้มิติอื่น
 * placeCost ใช้กฎเดียวกับ filter งบและ itineraryBuilder (utils/placePrice.ts::getPlaceCost)
 */
export function calculatePriceScore(
  placeCost: number | null,
  dailyBudget: number
): number | null {
  if (placeCost === null) return null;
  if (dailyBudget <= 0) return placeCost === 0 ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - placeCost / dailyBudget));
}

// ---------- สูตรรวม ----------

const WEIGHTS = {
  category: 0.35,
  rating: 0.25,
  distance: 0.15,
  budget: 0.15,
  weather: 0.1,
};

/**
 * รับ budgetWeight ระหว่าง 0-0.15 แล้วกระจายส่วนต่างคืนให้มิติที่เหลือตามสัดส่วนของมันเอง
 * (renormalize ให้ผลรวม weight เป็น 1 พอดีเสมอ)
 *
 * budgetWeight = 0.15 (เต็ม) -> scale = 1 -> ใช้ WEIGHTS ตรงๆ (รู้ราคา)
 * budgetWeight = 0    (ตัดทิ้ง) -> ตัดมิติราคาออก (ไม่ได้ตั้งงบ หรือไม่ทราบราคา)
 * includeCategory = false (ผู้ใช้ไม่ได้เลือกหมวด — D-48) -> ตัด category ออก แล้วกระจาย
 * weight ของมันคืนให้ rating/distance/weather ด้วยวิธีเดียวกัน
 */
function computeWeights(budgetWeight: number, includeCategory: boolean) {
  const category = includeCategory ? WEIGHTS.category : 0;
  const scale =
    (1 - budgetWeight) /
    (category + WEIGHTS.rating + WEIGHTS.distance + WEIGHTS.weather);
  return {
    category: category * scale,
    rating: WEIGHTS.rating * scale,
    distance: WEIGHTS.distance * scale,
    weather: WEIGHTS.weather * scale,
    budget: budgetWeight,
  };
}

export interface PoiScoreBreakdown {
  // null = ผู้ใช้ไม่ได้เลือกหมวด ไม่ได้คิดในสูตร (D-48)
  categoryScore: number | null;
  ratingScore: number;
  distanceScore: number;
  // price_score (calculatePriceScore — D-52) เก็บในคอลัมน์ budget_score
  // null = ไม่ได้คิดในสูตร (ไม่ได้ตั้งงบ หรือไม่ทราบราคา)
  budgetScore: number | null;
  weatherScore: number;
  poiScore: number;
  // placeCost = ราคาต่อคนที่รู้จาก Google (priceRange — D-52) ไม่เดาจากหมวด — null
  // แปลว่า "ไม่ทราบราคาแน่ชัด" ไม่ใช่ "ฟรี"
  // frontend ควรแสดง "ไม่ทราบราคาแน่ชัด" แทนตัวเลขเมื่อ null ไม่ใช่ซ่อนไปเฉยๆ
  placeCost: number | null;
  perPersonDailyBudget: number | null;
}

/**
 * คำนวณคะแนนรวม POI_SCORE
 *
 * - ตั้งงบ (useBudget + dailyBudget) และรู้ราคา -> price_score weight 0.15
 * - ไม่ได้ตั้งงบ หรือไม่ทราบราคา -> ตัดมิติราคาออก แล้ว renormalize มิติที่เหลือ
 *
 * รับ input แบบ primitive ตรงๆ ไม่ใช่ object ก้อนใหญ่ ตามที่ตกลงกัน
 */
export function calculatePoiScore(
  categoryMatch: boolean | null, // null = ผู้ใช้ไม่ได้เลือกหมวด (D-48)
  rating: number | null,
  distanceKm: number, // ระยะทางถนนจากจุดเริ่มต้น (km) — คำนวณนอกฟังก์ชันนี้ทีเดียวทั้งก้อน
  dailyBudget: number | null, // งบต่อคนต่อวัน (D-51)
  priceRangeStart: number | null, // priceRange ต่อคน (บาท — D-52)
  priceRangeEnd: number | null,
  priceNature: PriceNature,
  useBudget: boolean,
  // weather: environment_type ของหมวดสถานที่ + โอกาสฝน (%) ของวัน/พื้นที่ของ place นี้
  // rainProbability = null ได้ (ไม่มีพยากรณ์ → weather_score = 1.0 ทุกที่ ตาม fallback)
  environmentType: EnvironmentType,
  rainProbability: number | null
): PoiScoreBreakdown {
  const categoryScore = calculateCategoryScore(categoryMatch);
  const includeCategory = categoryScore !== null;
  const ratingScore = calculateRatingScore(rating);
  const distanceScore = calculateDistanceScore(distanceKm);
  const weatherScore = calculateWeatherScore(environmentType, rainProbability);

  // placeCost / perPersonDailyBudget ใช้แสดงผลเท่านั้น — คืนเสมอแม้ไม่ได้ตั้งงบ (ให้ frontend โชว์ราคาได้ถ้ารู้จริง)
  const placeCost = getKnownPrice(priceRangeStart, priceRangeEnd);

  const budgetScore =
    useBudget && dailyBudget !== null
      ? calculatePriceScore(getPlaceCost(priceRangeStart, priceRangeEnd, priceNature), dailyBudget)
      : null;

  const weights = computeWeights(budgetScore === null ? 0 : WEIGHTS.budget, includeCategory);

  const poiScore =
    weights.category * (categoryScore ?? 0) +
    weights.rating * ratingScore +
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