/**
 * ⚠️ ตั้งแต่ R5 P5c เหลือใช้แค่ getAutoTripPlaces (Auto Trip ของเพื่อน) — โค้ดอื่นหาหมวดจากป้าย ททท.
 * (places -> category_labels -> categories) แล้ว · ลบพร้อม place_categories ใน P5g (D-38)
 *
 * Multi-category dedupe — place หนึ่งมีได้หลาย category ใน place_categories
 * จึงเลือกแถวที่ confidence_score สูงสุดเป็นตัวแทนของ place นั้น (เท่ากัน = แถวแรกที่เจอ)
 * ทุก query ที่ join place_categories ต้องใช้ฟังก์ชันนี้ เพื่อให้ duration/ราคา/หมวดที่เห็น
 * ตอน POI list, ตอน editor และตอน backend re-validate เป็นค่าเดียวกันเสมอ
 *
 * placeIdOf คืน undefined = ข้ามแถวนั้น · ลำดับผลลัพธ์ = ลำดับที่ place แต่ละตัวโผล่ครั้งแรก
 */
export function pickBestCategoryRows<T extends { confidence_score: number | null }>(
  rows: T[],
  placeIdOf: (row: T) => string | undefined
): T[] {
  const bestRowByPlaceId = new Map<string, T>();

  for (const row of rows) {
    const placeId = placeIdOf(row);
    if (placeId === undefined) continue;

    const existing = bestRowByPlaceId.get(placeId);
    if (!existing || (row.confidence_score ?? 0) > (existing.confidence_score ?? 0)) {
      bestRowByPlaceId.set(placeId, row);
    }
  }

  return Array.from(bestRowByPlaceId.values());
}
