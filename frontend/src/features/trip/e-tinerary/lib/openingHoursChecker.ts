/**
 * openingHoursChecker.ts (frontend port)
 *
 * Port จาก backend/src/utils/openingHoursChecker.ts — logic เดิม 100% (pure function ไม่แตะ DB)
 * ใช้ตอน recompute client-side ในหน้า itinerary editor ให้ตรงกับที่ backend re-validate ซ้ำ
 * ก่อน save (ดูมติ "recompute logic ฝั่ง frontend" ใน itineraries_feature_status.md)
 *
 * ⚠️ ถ้าแก้ edge case ใดๆ ของไฟล์นี้ฝั่ง backend (เปิด 24 ชม./ข้ามเที่ยงคืน/หลายช่วงต่อวัน/
 * ไม่มีข้อมูล) ต้องแก้ไฟล์นี้คู่กันเสมอ ไม่งั้น badge conflict ที่ user เห็นตอนลากปรับ (client)
 * จะไม่ตรงกับที่ backend ยืนยันตอนกด "ยืนยันแผน"
 *
 * โครงสร้างจริงของ places.opening_hours (jsonb) ที่ยืนยันจากข้อมูลจริงใน Supabase:
 * {
 *   "periods": [
 *     { "open": { "day": 0, "time": "1030" }, "close": { "day": 0, "time": "2200" } },
 *     ...
 *   ],
 *   "open_now": true,
 *   "weekday_text": ["วันจันทร์: 11:00–21:00", ...]
 * }
 *
 * - day: 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date.getDay() ของ JS พอดี)
 * - time: string 4 หลัก "HHMM" ไม่มี ':' คั่น เช่น "0900", "2200"
 * - เปิด 24 ชม.: periods มีแค่ 1 entry ที่มี open แต่ไม่มี close เลย
 * - ปิดบางวัน: วันนั้นจะไม่มี entry อยู่ในอาร์เรย์เลย
 * - เปิดข้ามเที่ยงคืน: close.day = open.day + 1 เสมอ (ต้องเช็คย้อนไปถึง period ของ "เมื่อวาน" ด้วย)
 * - เปิดหลายช่วงในวันเดียว: มี period ซ้ำวันเดียวกัน 2 ช่วงได้ (เช่น เปิดเช้า-พักเที่ยง-เปิดบ่าย)
 *
 * ✅ นโยบายเมื่อไม่มีข้อมูล: "อนุญาตให้เลือกได้ + flag is_hours_unknown แยกจาก is_closed_conflict"
 */

export interface OpeningPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string }; // ไม่มี = เปิด 24 ชม. (เฉพาะกรณี periods.length === 1)
}

export interface OpeningHours {
  periods?: OpeningPeriod[];
  open_now?: boolean;
  weekday_text?: string[];
}

/**
 * แปลง "HHMM" -> จำนวนนาทีนับจากเที่ยงคืน เช่น "0930" -> 570
 */
function timeStringToMinutes(time: string): number {
  const hours = parseInt(time.slice(0, 2), 10);
  const minutes = parseInt(time.slice(2, 4), 10);
  return hours * 60 + minutes;
}

/**
 * เช็คว่าสถานที่เปิดอยู่ตลอดช่วง [arrivalMinutes, arrivalMinutes + durationMin] ของ dayOfWeek หรือไม่
 * ไม่มีข้อมูลเลย -> return false ("ยังไม่ยืนยันว่าเปิด") ไม่ใช่ "ปิดจริง" — ผู้เรียกต้องเช็ค
 * hasOpeningHoursData() คู่กันเสมอ (แนะนำให้เรียก checkOpeningStatus() แทนตรงๆ)
 */
export function isPlaceOpenAt(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number,
  arrivalMinutes: number,
  durationMin: number
): boolean {
  if (!openingHours || !openingHours.periods || openingHours.periods.length === 0) {
    return false;
  }

  const periods = openingHours.periods;

  // เคสเปิด 24 ชม.: มี period เดียวในทั้งอาร์เรย์ และไม่มี close เลย
  if (periods.length === 1 && periods[0].close === undefined) {
    return true;
  }

  for (const period of periods) {
    if (!period.close) continue; // period ประหลาดที่ไม่มี close แต่ไม่ใช่เคส 24 ชม. -> ข้าม กันพัง

    const openDay = period.open.day;
    const openMinutes = timeStringToMinutes(period.open.time);
    const closeDay = period.close.day;
    const closeMinutes = timeStringToMinutes(period.close.time);

    let spanMinutes = ((closeDay - openDay + 7) % 7) * 1440 + closeMinutes - openMinutes;
    if (spanMinutes <= 0) spanMinutes += 7 * 1440;

    for (const dayOffset of [0, 1]) {
      if ((openDay + dayOffset) % 7 !== dayOfWeek) continue;

      const relativeArrival = dayOffset * 1440 + arrivalMinutes;
      const relativeDeparture = relativeArrival + durationMin;

      if (relativeArrival >= openMinutes && relativeDeparture <= openMinutes + spanMinutes) {
        return true;
      }
    }
  }

  return false;
}

/**
 * เช็คว่า place นี้มีข้อมูล opening_hours อยู่จริงไหม (ไม่ว่าจะเปิด/ปิดตอนนี้)
 * ใช้แยก "ไม่รู้เลย" ออกจาก "รู้ว่าปิด"
 */
export function hasOpeningHoursData(
  openingHours: OpeningHours | null | undefined
): boolean {
  return !!(openingHours && openingHours.periods && openingHours.periods.length > 0);
}

export interface OpeningStatusResult {
  /** true = ยืนยันว่าเปิดครอบคลุมทั้งช่วงที่จะอยู่ (มีความหมายเฉพาะตอน hasData = true) */
  isOpen: boolean;
  /** false = ไม่มีข้อมูล opening_hours เลย ("ไม่รู้") */
  hasData: boolean;
}

/**
 * wrapper รวม isPlaceOpenAt() + hasOpeningHoursData() — เรียกตัวนี้แทนการเรียก isPlaceOpenAt() ตรงๆ
 */
export function checkOpeningStatus(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number,
  arrivalMinutes: number,
  durationMin: number
): OpeningStatusResult {
  const hasData = hasOpeningHoursData(openingHours);

  if (!hasData) {
    return { isOpen: true, hasData: false };
  }

  return {
    isOpen: isPlaceOpenAt(openingHours, dayOfWeek, arrivalMinutes, durationMin),
    hasData: true,
  };
}

/**
 * ดึงข้อความเวลาเปิด-ปิดของวันนั้นมาแสดงให้ user เห็นตรงๆ (ใช้ตอนแสดง badge "ปิดแล้วช่วงนี้")
 */
export function getWeekdayText(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number
): string | null {
  if (!openingHours?.weekday_text || openingHours.weekday_text.length !== 7) {
    return null;
  }
  const index = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return openingHours.weekday_text[index] ?? null;
}