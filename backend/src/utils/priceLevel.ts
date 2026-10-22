/**
 * price_level (0-4 จาก Google Places) -> ราคาบาทโดยประมาณ
 * ใช้ร่วมกันทั้ง hard filter งบ (poiPlaceQueries.ts), placeCost (poiScoreCalculator.ts)
 * และ itineraryBuilder.ts — ⚠️ frontend port ของ itineraryBuilder.ts มีสำเนาค่านี้ ต้องแก้คู่กัน
 */
export const PRICE_LEVEL_TO_BAHT: Record<number, number> = {
  0: 0,
  1: 200,
  2: 450,
  3: 900,
  4: 1500,
};
