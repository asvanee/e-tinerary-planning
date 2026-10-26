/**
 * ราคาต่อคนของสถานที่ (บาท) จาก priceRange ของ Google Places API (New) — D-52
 * ใช้ร่วมกันทั้ง hard filter งบ (poiPlaceQueries.ts), price score / placeCost (poiScoreCalculator.ts)
 * และ itineraryBuilder.ts — ⚠️ frontend port ของ itineraryBuilder.ts มีสำเนาฟังก์ชันเหล่านี้ ต้องแก้คู่กัน
 */

/**
 * ราคาที่รู้จาก Google: ขอบบนของ priceRange -> ขอบล่าง (ช่วงแบบ "มากกว่า X" ไม่มีขอบบน)
 * null = Google ไม่มีข้อมูลราคา
 */
export function getKnownPrice(
  priceRangeStart: number | null,
  priceRangeEnd: number | null
): number | null {
  return priceRangeEnd ?? priceRangeStart;
}

/**
 * ราคาที่ใช้คิดงบ — ไม่มีราคาจาก Google: free -> 0 บาท (วัด/สวนสาธารณะมักฟรีจริง) · paid -> null (ไม่ทราบราคา ไม่เดา)
 */
export function getPlaceCost(
  priceRangeStart: number | null,
  priceRangeEnd: number | null,
  priceNature: "free" | "paid"
): number | null {
  const knownPrice = getKnownPrice(priceRangeStart, priceRangeEnd);
  if (knownPrice !== null) return knownPrice;
  if (priceNature === "free") return 0;
  return null; // paid + missing = unknown จริง
}
