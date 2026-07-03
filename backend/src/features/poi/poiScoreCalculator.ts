import { haversineKm } from "../../utils/haversine";

/**
 * แปลง price_level (0-4) เป็นราคาบาทโดยประมาณ
 */
const PRICE_LEVEL_TO_BAHT: Record<number, number> = {
  0: 0,
  1: 200,
  2: 450,
  3: 900,
  4: 1500,
};

// ---------- คะแนนรายด้าน ----------

/**
 * category_score: ถ้าไม่ได้เลือก category เลย (confidenceScore = null) → default 1.0 ไม่ตัดคะแนน
 * ถ้าเลือกแล้ว match → ใช้ confidence_score ตรงๆ (schema ปัจจุบัน 1 place : 1 category)
 */
export function calculateCategoryScore(confidenceScore: number | null): number {
  if (confidenceScore === null) return 1.0;
  return confidenceScore;
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
 */
export function calculateDistanceScore(
  startLat: number,
  startLng: number,
  placeLat: number,
  placeLng: number
): number {
  const distanceKm = haversineKm(startLat, startLng, placeLat, placeLng);
  return 1 / (1 + distanceKm);
}

/**
 * budget_score: daily_budget null = ไม่จำกัดงบ → คะแนนเต็ม 1.0 เสมอ ไม่หาร
 * ✅ แก้แล้ว (v6): เดิมใช้ divisor = Math.max(perPersonDailyBudget, 1500) ทำให้เมื่อ
 * งบต่อคนต่อวันน้อยกว่า 1500 (เคสส่วนใหญ่ของข้อมูลกรุงเทพฯ) divisor จะล็อกที่ 1500 เสมอ
 * บีบคะแนนให้อยู่แคบๆ 0.70-1.00 แทบไม่มีผลต่อการจัดอันดับ (weight budget แค่ 0.15 อยู่แล้ว)
 * เปลี่ยนมาใช้ perPersonDailyBudget ตรงๆ เป็น divisor เพื่อให้คะแนนสะท้อนงบของผู้ใช้คนนั้นจริงๆ
 * ("ใช้งบเกือบหมด" ≈ 0, "ถูกกว่ามาก" ≈ 1) แทนการเทียบกับราคาแพงสุดที่มีในระบบ (hardcode)
 *
 * หมายเหตุ: getFilteredPlaces() ใน poiPlaceQueries.ts กรอง hard filter ตัด
 * placeCost > perPersonDailyBudget ออกไปก่อนแล้วเสมอ ดังนั้นในทางปฏิบัติ placeCost
 * จะ ≤ perPersonDailyBudget เสมอ ผลลัพธ์จึงไม่มีทางติดลบ — guard ด้านล่างกันไว้เผื่อ
 * ฟังก์ชันนี้ถูกเรียกตรงๆ โดยไม่ผ่าน filter (เช่น unit test ในอนาคต)
 */
export function calculateBudgetScore(
  dailyBudget: number | null,
  numberOfPeople: number,
  priceLevel: number
): number {
  if (dailyBudget === null) return 1.0;

  const perPersonDailyBudget = dailyBudget / numberOfPeople;
  const placeCost = PRICE_LEVEL_TO_BAHT[priceLevel] ?? 0;

  if (perPersonDailyBudget <= 0) {
    return placeCost === 0 ? 1.0 : 0.0;
  }

  return 1 - placeCost / perPersonDailyBudget;
}

/**
 * weather_score: mock คงที่ไปก่อน รอเชื่อม Weather API จริงในอนาคต
 */
export function calculateWeatherScore(): number {
  return 1.0;
}

// ---------- สูตรรวม ----------

const WEIGHTS = {
  category: 0.35,
  rating: 0.25,
  distance: 0.15,
  budget: 0.15,
  weather: 0.1,
};

export interface PoiScoreBreakdown {
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  budgetScore: number;
  weatherScore: number;
  poiScore: number;
}

/**
 * คำนวณคะแนนรวม POI_SCORE จากคะแนนรายด้านทั้ง 5 
 * รับ input แบบ primitive ตรงๆ ไม่ใช่ object ก้อนใหญ่ ตามที่ตกลงกัน
 */
export function calculatePoiScore(
  confidenceScore: number | null,
  rating: number | null,
  startLat: number,
  startLng: number,
  placeLat: number,
  placeLng: number,
  dailyBudget: number | null,
  numberOfPeople: number,
  priceLevel: number
): PoiScoreBreakdown {
  const categoryScore = calculateCategoryScore(confidenceScore);
  const ratingScore = calculateRatingScore(rating);
  const distanceScore = calculateDistanceScore(
    startLat,
    startLng,
    placeLat,
    placeLng
  );
  const budgetScore = calculateBudgetScore(
    dailyBudget,
    numberOfPeople,
    priceLevel
  );
  const weatherScore = calculateWeatherScore();

  const poiScore =
    WEIGHTS.category * categoryScore +
    WEIGHTS.rating * ratingScore +
    WEIGHTS.distance * distanceScore +
    WEIGHTS.budget * budgetScore +
    WEIGHTS.weather * weatherScore;

  return {
    categoryScore,
    ratingScore,
    distanceScore,
    budgetScore,
    weatherScore,
    poiScore,
  };
}