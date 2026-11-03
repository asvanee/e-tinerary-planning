// ราคาต่อคนของสถานที่ (บาท) จาก priceRange ของ Google — ใช้กรองงบ คิดคะแนนราคา และคิดงบในแผน
// ⚠️ itineraryBuilder.ts ฝั่ง frontend มีสำเนาฟังก์ชันเหล่านี้ ต้องแก้คู่กัน

// ใช้ขอบบนของช่วงราคาก่อน ไม่มีค่อยใช้ขอบล่าง · null = ไม่มีข้อมูลราคา
export function getKnownPrice(
  priceRangeStart: number | null,
  priceRangeEnd: number | null
): number | null {
  return priceRangeEnd ?? priceRangeStart;
}

// ราคาที่ใช้คิดงบ — ไม่มีราคา: หมวดฟรีคิด 0 บาท · หมวดเสียเงินคืน null (ไม่ทราบ ไม่เดา)
export function getPlaceCost(
  priceRangeStart: number | null,
  priceRangeEnd: number | null,
  priceNature: "free" | "paid"
): number | null {
  const knownPrice = getKnownPrice(priceRangeStart, priceRangeEnd);
  if (knownPrice !== null) return knownPrice;
  if (priceNature === "free") return 0;
  return null;
}
