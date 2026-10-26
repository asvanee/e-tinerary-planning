/**
 * แปลงเวลา "HH:MM[:SS]" ของ Postgres `time` กับนาทีนับจากเที่ยงคืน
 * ⚠️ frontend port ของ itineraryBuilder.ts มีสำเนาฟังก์ชันเหล่านี้ ต้องแก้คู่กัน
 */

export function timeStringToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

/** cap ที่ 23:59 เพราะ `time` เก็บข้ามเที่ยงคืนไม่ได้ */
export function minutesToTimeString(totalMinutes: number): string {
  const capped = Math.min(Math.max(totalMinutes, 0), 24 * 60 - 1);
  const hh = Math.floor(capped / 60);
  const mm = capped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}
