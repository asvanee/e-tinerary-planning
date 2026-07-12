import { haversineKm } from "../../utils/haversine";
import { PRICE_LEVEL_TO_BAHT } from "../../utils/priceLevel";

/**
 * แปลง price_level (0-4) เป็นราคาบาทโดยประมาณ
 * ✅ Extract ไปเป็น shared constant แล้ว — ดู utils/priceLevel.ts
 * (เดิมประกาศซ้ำที่นี่กับ poiPlaceQueries.ts แยกกัน แก้ราคาต้องแก้ 2 ที่ ตอนนี้เหลือที่เดียว)
 */

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
 * placeCost > perPersonDailyBudget ออกไปก่อนแล้วเสมอ (เฉพาะสถานที่ที่มี price_level จริง —
 * ดู hasPriceLevel) ดังนั้นในทางปฏิบัติ placeCost จะ ≤ perPersonDailyBudget เสมอ ผลลัพธ์จึง
 * ไม่มีทางติดลบ — guard ด้านล่างกันไว้เผื่อฟังก์ชันนี้ถูกเรียกตรงๆ โดยไม่ผ่าน filter
 * (เช่น unit test ในอนาคต)
 *
 * ⚠️ ฟังก์ชันนี้ถูกเรียกเฉพาะตอน hasPriceLevel = true เท่านั้น (ดู calculatePoiScore ด้านล่าง)
 * priceLevel รับเป็น number ตรงๆ ไม่ nullable เพราะผู้เรียกรับประกันแล้วว่ามีค่าจริง
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

/**
 * ✅ เพิ่มใหม่: ใช้กับสถานที่ที่ไม่มี price_level จริง (hasPriceLevel = false)
 * แทนที่จะ coalesce price_level เป็นค่า default ของ category แล้วเสแสร้งว่ามีข้อมูล (มติเดิม
 * ที่ยกเลิกไปแล้ว — ดู PROJECT_BRIEF ข้อ 4.3 เวอร์ชันใหม่) ตอนนี้ตัด budget ออกจากสูตรไปเลย
 * แล้วกระจาย weight ของ budget (0.15) คืนให้ 4 มิติที่เหลือตามสัดส่วนเดิมของมันเอง
 * (renormalize ให้ผลรวม weight กลับมาเป็น 1 พอดี ไม่ทำให้เพดานคะแนนของกลุ่มนี้ต่ำกว่ากลุ่มที่มี
 * price_level อย่างไม่เป็นธรรม)
 */
const REMAINING_SUM =
  WEIGHTS.category + WEIGHTS.rating + WEIGHTS.distance + WEIGHTS.weather; // 0.85

const WEIGHTS_NO_BUDGET = {
  category: WEIGHTS.category / REMAINING_SUM, // ≈ 0.4118
  rating: WEIGHTS.rating / REMAINING_SUM, // ≈ 0.2941
  distance: WEIGHTS.distance / REMAINING_SUM, // ≈ 0.1765
  weather: WEIGHTS.weather / REMAINING_SUM, // ≈ 0.1176
};

export interface PoiScoreBreakdown {
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  // ✅ เปลี่ยนเป็น nullable: null = ไม่ได้คิดในสูตรนี้เลย (ไม่ใช่ 0 — 0 จะสื่อผิดว่า "แพงเกินงบ")
  budgetScore: number | null;
  weatherScore: number;
  poiScore: number;
  // ✅ เพิ่มใหม่ — ค่าดิบเป็นบาท ให้ frontend แสดงผลแบบ "placeCost/perPersonDailyBudget บาท"
  // แทนเปอร์เซ็นต์ ไม่ต้อง derive กลับจาก budgetScore (ซึ่งมีแค่สัดส่วน ไม่มีทางคำนวณ
  // ย้อนกลับเป็น 2 ค่าดิบแยกกันได้จริง) — null ทั้งคู่เมื่อ hasPriceLevel = false
  // perPersonDailyBudget เป็น null ได้อีกกรณี (แม้ hasPriceLevel = true): ตอน trip.dailyBudget
  // เป็น null เอง (ไม่ได้ตั้งงบไว้เลย) placeCost ยังคำนวณได้ตามปกติ
  placeCost: number | null;
  perPersonDailyBudget: number | null;
}

/**
 * คำนวณคะแนนรวม POI_SCORE
 *
 * ✅ แก้แล้ว: เพิ่ม hasPriceLevel เข้ามาแยกสูตร
 * - hasPriceLevel = true  -> สูตรเต็ม 5 มิติ (WEIGHTS เดิม, มี budget_score)
 * - hasPriceLevel = false -> สูตร 4 มิติ ไม่มี budget_score (WEIGHTS_NO_BUDGET) — priceLevel
 *   ที่ส่งเข้ามาตอนนั้นจะเป็น null และไม่ถูกใช้เลย
 *
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
  priceLevel: number | null,
  hasPriceLevel: boolean
): PoiScoreBreakdown {
  const categoryScore = calculateCategoryScore(confidenceScore);
  const ratingScore = calculateRatingScore(rating);
  const distanceScore = calculateDistanceScore(
    startLat,
    startLng,
    placeLat,
    placeLng
  );
  const weatherScore = calculateWeatherScore();

  if (!hasPriceLevel) {
    const poiScore =
      WEIGHTS_NO_BUDGET.category * categoryScore +
      WEIGHTS_NO_BUDGET.rating * ratingScore +
      WEIGHTS_NO_BUDGET.distance * distanceScore +
      WEIGHTS_NO_BUDGET.weather * weatherScore;

    return {
      categoryScore,
      ratingScore,
      distanceScore,
      budgetScore: null,
      weatherScore,
      poiScore,
      placeCost: null,
      perPersonDailyBudget: null,
    };
  }

  const budgetScore = calculateBudgetScore(
    dailyBudget,
    numberOfPeople,
    priceLevel as number
  );

  // ✅ ค่าดิบสำหรับ frontend แสดงเป็น "placeCost/perPersonDailyBudget บาท"
  // (คำนวณตามสูตรเดียวกับใน calculateBudgetScore เป๊ะ ให้ตัวเลขสอดคล้องกัน)
  const placeCost = PRICE_LEVEL_TO_BAHT[priceLevel as number] ?? 0;
  const perPersonDailyBudget =
    dailyBudget === null ? null : dailyBudget / numberOfPeople;

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
    placeCost,
    perPersonDailyBudget,
  };
}