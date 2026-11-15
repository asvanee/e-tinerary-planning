// ช่วงวันเดินทาง: วันที่เป็น YYYY-MM-DD, วันจบไม่ก่อนวันเริ่ม และรวมไม่เกิน 31 วัน
// ⚠️ จำนวนวันสูงสุดต้องตรงกับ frontend/src/user/trip/create/tripDates.ts
// [ค่า] หน้าสร้างแผน(ตรวจวันที่) · MAX_TRIP_DAYS = 31 — จำนวนวันสูงสุดของแผน (ต้องตรง frontend tripDates.ts)
export const MAX_TRIP_DAYS = 31;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// คืนเวลา UTC เที่ยงคืนของวันนั้น หรือ null ถ้ารูปแบบผิด/ไม่มีวันนั้นจริง (เช่น 2026-02-30)
function toUtcDay(isoDate: unknown): number | null {
  if (typeof isoDate !== "string" || !ISO_DATE.test(isoDate)) return null;
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== isoDate) return null;
  return time;
}

// ทุกวันตั้งแต่ startDate ถึง endDate ("YYYY-MM-DD") รวมวันแรกและวันสุดท้าย
export function enumerateDates(startDate: string, endDate: string): string[] {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const dates: string[] = [];
  for (let time = Date.parse(`${startDate}T00:00:00Z`); time <= end; time += DAY_MS) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

// วันเริ่มต้องไม่ผ่านมาแล้ว (เทียบกับวันนี้ตามเวลาไทย) · ทั้งสองค่าเป็น "YYYY-MM-DD" ที่ผ่านการตรวจรูปแบบแล้ว
// null = ผ่าน, string = ข้อความ error
export function getPastStartDateError(startDate: string, today: string): string | null {
  return startDate < today ? "ไม่สามารถเลือกวันที่ผ่านมาแล้วเป็นวันเริ่มต้นได้" : null;
}

// null = ผ่าน, string = ข้อความ error
export function getTripDateRangeError(startDate: unknown, endDate: unknown): string | null {
  const start = toUtcDay(startDate);
  const end = toUtcDay(endDate);
  if (start === null || end === null) return "รูปแบบวันที่ไม่ถูกต้อง";
  if (end < start) return "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น";
  if ((end - start) / DAY_MS + 1 > MAX_TRIP_DAYS) {
    return `แผนยาวได้ไม่เกิน ${MAX_TRIP_DAYS} วัน`;
  }
  return null;
}
