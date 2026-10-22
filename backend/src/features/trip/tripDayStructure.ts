// ช่องของ trips ที่ใช้สร้าง trip_days (วันที่ทุกวัน, เวลาเริ่ม/จบ, งบต่อวัน — ดู getOrCreateTripDays)
// ถ้าช่องไหนเปลี่ยน trip_days เดิมจะไม่ตรงกับทริปแล้ว (Known Issue #6)
export const DAY_STRUCTURE_FIELDS = [
  "start_date",
  "end_date",
  "start_time",
  "available_time_per_day",
  "daily_budget",
] as const;

export type DayStructure = Record<(typeof DAY_STRUCTURE_FIELDS)[number], string | number | null>;

const BUDGET_EPSILON = 0.005; // daily_budget เป็น numeric — กันทศนิยมคลาดเล็กน้อย

function sameValue(a: string | number | null, b: string | number | null): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === "number" || typeof b === "number") {
    return Number.isFinite(na) && Number.isFinite(nb) ? Math.abs(na - nb) < BUDGET_EPSILON : String(a) === String(b);
  }
  return String(a) === String(b);
}

// เทียบค่าที่อ่านจาก DB ทั้งก่อนและหลัง update (format เดียวกัน เช่น start_time "HH:MM:SS")
export function dayStructureChanged(before: DayStructure, after: DayStructure): boolean {
  return DAY_STRUCTURE_FIELDS.some((field) => !sameValue(before[field], after[field]));
}
