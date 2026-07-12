/**
 * priceLevel.ts
 *
 * Shared constant: แปลง price_level (0-4 จาก Google Places) เป็นราคาบาทโดยประมาณ
 *
 * ✅ Extract มาจากที่เคยประกาศซ้ำ 2 ที่ (poiPlaceQueries.ts + poiScoreCalculator.ts)
 * ทั้งสองไฟล์ต้อง import จากที่นี่แทนการประกาศเองซ้ำ — กันปัญหาแก้ราคาที่เดียวแล้วอีกที่ไม่ตรง
 * (เคยเสี่ยงทำให้ budget hard filter กับ budget_score คำนวณคนละราคากันได้)
 *
 * ที่มาของตัวเลข: price_level_cost จริงใน Supabase (0->0, 1->200, 2->450, 3->900, 4->1500)
 */
export const PRICE_LEVEL_TO_BAHT: Record<number, number> = {
  0: 0,
  1: 200,
  2: 450,
  3: 900,
  4: 1500,
};

/**
 * Helper: แปลง price_level เป็นราคาบาท พร้อม fallback เป็น 0 ถ้าเจอค่าที่ไม่รู้จัก
 * (เช่น price_level เกิน 4 หรือค่าผิดปกติที่ไม่ควรเกิดในทางปฏิบัติ)
 */
export function priceLevelToBaht(priceLevel: number): number {
  return PRICE_LEVEL_TO_BAHT[priceLevel] ?? 0;
}