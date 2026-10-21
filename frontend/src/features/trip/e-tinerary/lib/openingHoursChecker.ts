/**
 * openingHoursChecker.ts (frontend port)
 *
 * เช็คเวลาเปิด-ปิดจาก places.opening_hours (pure function ไม่แตะ DB)
 * ⚠️ สำเนาของ backend/src/utils/openingHoursChecker.ts ต้องตรงกันทุกบรรทัด
 *
 * โครงสร้างจริงของ places.opening_hours (jsonb รูปแบบ Google):
 * {
 *   "periods": [
 *     { "open": { "day": 0, "time": "1030" }, "close": { "day": 0, "time": "2200" } },
 *     ...
 *   ],
 *   "open_now": true,
 *   "weekday_text": ["วันจันทร์: 11:00–21:00", ...]
 * }
 *
 * - day: 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date.getDay() ของ JS)
 * - time: string 4 หลัก "HHMM" ไม่มี ':' คั่น เช่น "0900", "2200"
 * - เปิด 24 ชม.: periods มีแค่ 1 entry ที่มี open แต่ไม่มี close
 * - ปิดบางวัน: วันนั้นไม่มี entry ในอาร์เรย์เลย
 * - เปิดข้ามเที่ยงคืน: close.day = open.day + 1 (ต้องเช็ค period ของ "เมื่อวาน" ด้วย)
 * - เปิดหลายช่วงในวันเดียว: มี period วันเดียวกันได้หลายช่วง (เช่น เช้า-พักเที่ยง-บ่าย)
 *
 * ไม่มีข้อมูล = เลือกได้ แต่ flag is_hours_unknown (แยกจาก is_closed_conflict)
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
 * (ต้องเปิดครอบคลุมทั้งช่วงที่จะอยู่ ไม่ใช่แค่ตอนไปถึง)
 * ไม่มีข้อมูลเลย -> return false ("ยังไม่ยืนยันว่าเปิด") ไม่ใช่ "ปิดจริง" — ให้เรียก checkOpeningStatus() แทน
 *
 * @param dayOfWeek      0=อาทิตย์ ... 6=เสาร์ (จาก trip_days.visit_date)
 * @param arrivalMinutes นาทีที่ไปถึง นับจากเที่ยงคืนของ dayOfWeek (เช่น 09:30 = 570)
 * @param durationMin    เวลาที่อยู่ที่นั่น (นาที) จาก categories.default_duration_min
 */
function isPlaceOpenAt(
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

  // ไล่ทุก period (อาจมีหลายช่วงในวันเดียว) แต่ละ period เช็ค 2 กรณี:
  //   dayOffset=0 -> วันที่เช็คคือวันที่ period นี้เริ่มเปิด
  //   dayOffset=1 -> วันที่เช็คคือวันถัดไป (ครอบคลุมช่วงหลังเที่ยงคืนของ period ที่เปิดข้ามวัน)
  for (const period of periods) {
    if (!period.close) continue; // period ที่ไม่มี close แต่ไม่ใช่เคส 24 ชม. -> ข้าม กันพัง

    const openDay = period.open.day;
    const openMinutes = timeStringToMinutes(period.open.time);
    const closeDay = period.close.day;
    const closeMinutes = timeStringToMinutes(period.close.time);

    // ความยาวของช่วงเปิด (นาที) รองรับข้ามเที่ยงคืน
    let spanMinutes = ((closeDay - openDay + 7) % 7) * 1440 + closeMinutes - openMinutes;
    if (spanMinutes <= 0) spanMinutes += 7 * 1440;

    for (const dayOffset of [0, 1]) {
      if ((openDay + dayOffset) % 7 !== dayOfWeek) continue;

      // แปลงเวลาไปถึงให้อยู่ใน timeline เดียวกับวันที่ period เริ่มเปิด
      const relativeArrival = dayOffset * 1440 + arrivalMinutes;
      const relativeDeparture = relativeArrival + durationMin;

      if (relativeArrival >= openMinutes && relativeDeparture <= openMinutes + spanMinutes) {
        return true;
      }
    }
  }

  // ไม่มี period ไหนครอบคลุม (รวมถึงวันนั้นไม่มี entry = ปิดทั้งวัน)
  return false;
}

/**
 * มีข้อมูล opening_hours จริงไหม — แยก "ไม่รู้เลย" ออกจาก "รู้ว่าปิด"
 */
function hasOpeningHoursData(
  openingHours: OpeningHours | null | undefined
): boolean {
  return !!(openingHours && openingHours.periods && openingHours.periods.length > 0);
}

interface OpeningStatusResult {
  /** true = ยืนยันว่าเปิดครอบคลุมทั้งช่วงที่จะอยู่ (มีความหมายเฉพาะตอน hasData = true) */
  isOpen: boolean;
  /** false = ไม่มีข้อมูล opening_hours เลย ("ไม่รู้") */
  hasData: boolean;
}

/**
 * รวม isPlaceOpenAt() + hasOpeningHoursData() — ผู้เรียกตั้ง flag ดังนี้
 *   is_closed_conflict = hasData ? !isOpen : false
 *   is_hours_unknown   = !hasData
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
