import { haversineKm } from "../../utils/haversine";
import { PRICE_LEVEL_TO_BAHT } from "../../utils/priceLevel";
import type { PriceNature } from "./poiPlaceQueries";

/**
 * แปลง price_level (0-4) เป็นราคาบาทโดยประมาณ
 * ✅ Extract ไปเป็น shared constant แล้ว — ดู utils/priceLevel.ts
 * (เดิมประกาศซ้ำที่นี่กับ poiPlaceQueries.ts แยกกัน แก้ราคาต้องแก้ 2 ที่ ตอนนี้เหลือที่เดียว)
 * ยังใช้อยู่ที่นี่ แต่เปลี่ยนขอบเขตแล้ว — ใช้แค่คำนวณ placeCost สำหรับแสดงผล (ดูด้านล่าง)
 * ไม่ได้ใช้คำนวณ budget/price score อีกต่อไป (ดู PRICE_SCORE_REDESIGN.md)
 */

// ---------- คะแนนรายด้าน ----------

/**
 * category_score: ถ้าไม่ได้เลือก category เลย (confidenceScore = null) → default 1.0 ไม่ตัดคะแนน
 * ถ้าเลือกแล้ว match → ใช้ confidence_score ตรงๆ
 * ✅ แก้คอมเมนต์ (ของเดิมเข้าใจผิด): place หนึ่งมีได้หลาย category จริง (ดู
 * DATA_PREPARATION_4.md หัวข้อ 8.2 — เชียงใหม่ผ่าน Stage 3 แล้ว 429/429) แต่ฟังก์ชันนี้
 * ไม่ต้องรู้เรื่อง multi-category เลย เพราะ MAX aggregation (เลือก confidence_score สูงสุด
 * ต่อ place เมื่อแมทช์ได้หลาย category) ทำเสร็จแล้วตั้งแต่ต้นทางใน
 * queryPlacesWithCategoryInfo() (poiPlaceQueries.ts) — confidenceScore ที่ส่งเข้ามาที่นี่
 * จึงเป็นค่า best-match เดียวเสมอ ไม่ใช่ raw score ดิบที่อาจมีหลายค่าต่อ place
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
 * weather_score: mock คงที่ไปก่อน รอเชื่อม Weather API จริงในอนาคต
 */
export function calculateWeatherScore(): number {
  return 1.0;
}

// ---------- budget/price score (v2 — เขียนใหม่ทั้งหมด ดู PRICE_SCORE_REDESIGN.md) ----------

/**
 * ✅ v2 — เลิกเทียบกับ dailyBudget/numberOfPeople ในสูตรคะแนนแล้ว (มติที่ล็อกไว้ในเซสชันนี้)
 * เหตุผล: dailyBudget ทำหน้าที่ hard filter อยู่แล้วใน getFilteredPlaces() (poiPlaceQueries.ts)
 * — พอถึงขั้นคิดคะแนน place ที่เหลือทั้งหมด "จ่ายไหวอยู่แล้ว" เอามาเทียบซ้ำในสูตรคะแนนไม่ได้เพิ่ม
 * signal ใหม่ ตอนนี้ price_score ตอบคำถามคนละแบบ: "ราคานี้น่าสนใจแค่ไหนโดยทั่วไป" ไม่ขึ้นกับ
 * user คนไหนเลย เหมือน rating_score
 *
 * ✅ มติล่าสุด (revert บางส่วน): food missing กลับไปใช้ weight 0.08 เหมือนเดิม (ไม่ใช่ 0) —
 * ต่างจาก paid_other missing ที่ยังตัด weight ทิ้งทั้งหมด (=0) เหตุผลที่ยังแยก food ออกจาก
 * paid_other ตรงนี้: price_score เป็นมิติ "ความน่าสนใจ" ไม่ใช่เงินจริง เดาผิดเสี่ยงต่ำกว่า
 * hard filter/budget conflict มาก และ food range แคบกว่า paid_other พอจะให้เครดิตบางส่วนได้
 * (ต่างจาก hard filter งบ + itinerary budget conflict ที่ยังไม่เดา food missing เหมือนเดิม
 * เพราะเป็นตัวเลขบาทจริงเทียบกับงบจริง ผิดพลาดได้แพงกว่า — ตอนนี้ food ปฏิบัติต่างกันระหว่าง
 * 3 จุดโดยตั้งใจ ไม่ใช่ inconsistency ที่ตกหล่น)
 *
 * Lookup table (ตัดสินจาก priceNature ของ category ที่ confidence_score สูงสุด):
 *
 * | priceNature | price_level  | score | confidence     | weight |
 * |-------------|--------------|-------|-----------------|--------|
 * | free        | จริง = 0     | 90    | real            | 0.15   |
 * | free        | missing      | 80    | inferred_high   | 0.15   |
 * | food        | จริง 0-4     | 80/60/40/20/0 (linear) | real | 0.15 |
 * | food        | missing      | 60    | inferred_mid    | 0.08   |
 * | paid_other  | จริง 0-4     | 80/60/40/20/0 (linear) | real | 0.15 |
 * | paid_other  | missing      | 0     | inferred_low    | 0      |
 *
 * free ไม่มี fallback ที่ "ลงโทษ" เพราะรู้อยู่แล้วว่าธรรมชาติราคาของหมวดเอนไปทางไหน — food
 * missing ยังพอเดาได้บ้าง (ลด weight ไม่ตัดทิ้ง) มีแค่ paid_other missing เท่านั้นที่ไม่มี
 * หลักฐานพอจะเดาเลย จึงตัด weight ออกทั้งมิติ (=0) — weight ที่ไม่ครบ 0.15 จะถูก renormalize
 * คืนให้ 4 มิติที่เหลือใน calculatePoiScore() (ดู computeWeights ด้านล่าง)
 */
function priceLevelToGradientScore(priceLevel: number): number {
  // price_level 0→80, 1→60, 2→40, 3→20, 4→0 (linear เท่ากันทุกขั้น ตามที่ล็อกไว้)
  return Math.max(0, 80 - priceLevel * 20);
}

export type PriceConfidence =
  | "real"
  | "inferred_high"
  | "inferred_mid"
  | "inferred_low";

export interface PriceScoreResult {
  score: number; // 0-1 (สเกลเดียวกับมิติอื่นๆ)
  weight: number; // weight ของ budget dimension ที่ควรใช้ในสูตรรวม (0 - 0.15)
  confidence: PriceConfidence;
}

export function calculatePriceScore(
  rawPriceLevel: number | null,
  priceNature: PriceNature
): PriceScoreResult {
  if (priceNature === "free") {
    if (rawPriceLevel !== null) {
      return { score: 90 / 100, weight: 0.15, confidence: "real" };
    }
    return { score: 80 / 100, weight: 0.15, confidence: "inferred_high" };
  }

  if (priceNature === "food") {
    if (rawPriceLevel !== null) {
      return {
        score: priceLevelToGradientScore(rawPriceLevel) / 100,
        weight: 0.15,
        confidence: "real",
      };
    }
    // ✅ revert กลับมาแล้ว: food missing ยังให้เครดิตบางส่วน (weight 0.08 ไม่ใช่ 0) ต่างจาก
    // paid_other missing ที่ตัด weight ทิ้งทั้งหมด — ดู comment หัวฟังก์ชันสำหรับเหตุผล
    return { score: 60 / 100, weight: 0.08, confidence: "inferred_mid" };
  }

  // priceNature === "paid_other"
  if (rawPriceLevel !== null) {
    return {
      score: priceLevelToGradientScore(rawPriceLevel) / 100,
      weight: 0.15,
      confidence: "real",
    };
  }
  return { score: 0, weight: 0, confidence: "inferred_low" };
}

// ---------- สูตรรวม ----------

const WEIGHTS = {
  category: 0.35,
  rating: 0.25,
  distance: 0.15,
  budget: 0.15,
  weather: 0.1,
};

const REMAINING_BASE_SUM =
  WEIGHTS.category + WEIGHTS.rating + WEIGHTS.distance + WEIGHTS.weather; // 0.85

/**
 * ✅ Generalize จาก WEIGHTS_NO_BUDGET เดิม (ที่รองรับแค่ 0 หรือ 0.15) ให้รับ budgetWeight
 * เป็นเศษส่วนใดก็ได้ระหว่าง 0-0.15 (ค่าที่เป็นไปได้จริงตอนนี้มี 3 ค่า: 0, 0.08, 0.15 — เขียน
 * เป็นสูตรทั่วไปไว้เผื่ออนาคตมีค่าอื่นเพิ่ม) กระจายส่วนต่างคืนให้ 4 มิติที่เหลือตามสัดส่วนเดิม
 * ของมันเอง (renormalize ให้ผลรวม weight กลับมาเป็น 1 พอดีเสมอ)
 *
 * budgetWeight = 0.15 (เต็ม) -> scale = 1 -> เหมือนสูตรเดิมทุกประการ (ไม่กระทบ real/inferred_high)
 * budgetWeight = 0    (ตัดทิ้ง) -> เหมือน WEIGHTS_NO_BUDGET เดิมทุกประการ (useBudget=false หรือ
 * paid_other missing)
 */
function computeWeights(budgetWeight: number) {
  const scale = (1 - budgetWeight) / REMAINING_BASE_SUM;
  return {
    category: WEIGHTS.category * scale,
    rating: WEIGHTS.rating * scale,
    distance: WEIGHTS.distance * scale,
    weather: WEIGHTS.weather * scale,
    budget: budgetWeight,
  };
}

export interface PoiScoreBreakdown {
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  // ✅ v2: ยังชื่อ budgetScore ตามเดิม (ลดจุดที่ต้องแก้ไฟล์อื่นที่ยังไม่เปิดดู เช่น
  // itineraryBuilder.ts/frontend) แต่ความหมายเปลี่ยนเป็น "price_score" แล้ว — ไม่ได้วัดว่า
  // "จ่ายไหวไหม" (นั่นคือหน้าที่ของ hard filter ใน poiPlaceQueries.ts) แต่วัดว่า "ราคานี้
  // น่าสนใจแค่ไหนโดยทั่วไป" ไม่ขึ้นกับ dailyBudget ของ user คนไหนเลย
  // null = ไม่ได้คิดในสูตรนี้เลย (useBudget=false เท่านั้น — ต่างจาก weight=0 ของ
  // paid_other+missing ซึ่งยังคำนวณ score ได้ (=0) แค่ไม่ถูกใช้ในสูตรรวม)
  budgetScore: number | null;
  // ✅ ใหม่: ความมั่นใจของ budgetScore — null เมื่อ useBudget=false (ไม่ได้คิดเลย)
  priceConfidence: PriceConfidence | null;
  weatherScore: number;
  poiScore: number;
  // ✅ v2: placeCost มาจาก rawPriceLevel (ราคาจริงเท่านั้น) ไม่ fallback อีกต่อไป — null
  // แปลว่า "ไม่ทราบราคาแน่ชัด" ไม่ใช่ "ฟรี" (ต่างจากพฤติกรรมเดิมที่เคย fallback มา coalesce)
  // frontend ควรแสดง "ไม่ทราบราคาแน่ชัด" แทนตัวเลขเมื่อ null ไม่ใช่ซ่อนไปเฉยๆ
  placeCost: number | null;
  perPersonDailyBudget: number | null;
}

/**
 * คำนวณคะแนนรวม POI_SCORE
 *
 * ✅ v2 — เปลี่ยน param จาก priceLevel เดี่ยวๆ เป็น rawPriceLevel + priceNature (ดู
 * poiPlaceQueries.ts::PlaceWithScore ที่ส่งสองค่านี้มาแทน effectivePriceLevel ตัวเดียว)
 * - useBudget = true  -> คำนวณ price_score จาก lookup table เสมอ (weight ผัน 0-0.15 ตาม
 *   confidence) แล้ว renormalize 4 มิติที่เหลือให้พอดีตาม weight ที่ได้
 * - useBudget = false -> ตัด budget dimension ทิ้งทั้งหมดทันที ไม่คำนวณ price_score เลย
 *   (พฤติกรรมเดิม ไม่เปลี่ยน)
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
  rawPriceLevel: number | null,
  priceNature: PriceNature,
  useBudget: boolean
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

  // ✅ placeCost/perPersonDailyBudget เป็นข้อมูลแสดงผลล้วนๆ ไม่เข้าสูตรคะแนนแล้ว —
  // คำนวณแยกจาก useBudget เสมอ (แม้ useBudget=false ก็ยังอยากให้ frontend โชว์ราคาได้ถ้ารู้จริง)
  const placeCost =
    rawPriceLevel === null ? null : PRICE_LEVEL_TO_BAHT[rawPriceLevel] ?? null;
  const perPersonDailyBudget =
    dailyBudget === null ? null : dailyBudget / numberOfPeople;

  if (!useBudget) {
    const weights = computeWeights(0);
    const poiScore =
      weights.category * categoryScore +
      weights.rating * ratingScore +
      weights.distance * distanceScore +
      weights.weather * weatherScore;

    return {
      categoryScore,
      ratingScore,
      distanceScore,
      budgetScore: null,
      priceConfidence: null,
      weatherScore,
      poiScore,
      placeCost,
      perPersonDailyBudget,
    };
  }

  const { score: budgetScore, weight: budgetWeight, confidence } =
    calculatePriceScore(rawPriceLevel, priceNature);

  const weights = computeWeights(budgetWeight);

  const poiScore =
    weights.category * categoryScore +
    weights.rating * ratingScore +
    weights.distance * distanceScore +
    weights.budget * budgetScore +
    weights.weather * weatherScore;

  return {
    categoryScore,
    ratingScore,
    distanceScore,
    budgetScore,
    priceConfidence: confidence,
    weatherScore,
    poiScore,
    placeCost,
    perPersonDailyBudget,
  };
}