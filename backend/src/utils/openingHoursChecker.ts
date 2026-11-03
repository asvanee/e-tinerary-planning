// ⚠️ ต้องแก้คู่กับ frontend/src/features/trip/e-tinerary/lib/openingHoursChecker.ts

// เช็คว่าสถานที่เปิดตลอดช่วงที่ไปเที่ยวไหม จาก places.opening_hours (รูปแบบ Google periods)
// day 0 = อาทิตย์ .. 6 = เสาร์, time = "HHMM" · ไม่มี close = เปิด 24 ชม. · ไม่มีข้อมูล = ไม่ทราบ (ไม่ใช่ปิด)

export interface OpeningPeriod {
  open: { day: number; time: string };
  close?: { day: number; time: string };
}

export interface OpeningHours {
  periods?: OpeningPeriod[];
  open_now?: boolean;
  weekday_text?: string[];
}

// "0930" -> 570 นาทีนับจากเที่ยงคืน
function hhmmToMinutes(time: string): number {
  const hours = parseInt(time.slice(0, 2), 10);
  const minutes = parseInt(time.slice(2, 4), 10);
  return hours * 60 + minutes;
}

// เปิดตั้งแต่ถึงจนออกไหม (durationMin 0 = เช็คแค่ตอนถึง)
function isPlaceOpenAt(
  periods: OpeningPeriod[],
  dayOfWeek: number,
  arrivalMinutes: number,
  durationMin: number
): boolean {
  if (periods.length === 1 && periods[0].close === undefined) return true;

  for (const period of periods) {
    if (!period.close) continue;

    const openDay = period.open.day;
    const openMinutes = hhmmToMinutes(period.open.time);
    let spanMinutes =
      ((period.close.day - openDay + 7) % 7) * 1440 + hhmmToMinutes(period.close.time) - openMinutes;
    if (spanMinutes <= 0) spanMinutes += 7 * 1440;

    // เช็ควันที่ช่วงนี้เปิด และวันถัดไป (กรณีเปิดข้ามเที่ยงคืน)
    for (const dayOffset of [0, 1]) {
      if ((openDay + dayOffset) % 7 !== dayOfWeek) continue;
      const arrival = dayOffset * 1440 + arrivalMinutes;
      if (arrival >= openMinutes && arrival + durationMin <= openMinutes + spanMinutes) return true;
    }
  }

  return false;
}

interface OpeningStatusResult {
  isOpen: boolean;
  hasData: boolean;
}

// hasData = false คือไม่มีข้อมูลเวลาเปิด → ผู้เรียกตั้ง is_hours_unknown แทน is_closed_conflict
export function checkOpeningStatus(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number,
  arrivalMinutes: number,
  durationMin: number
): OpeningStatusResult {
  const periods = openingHours?.periods;
  if (!periods?.length) return { isOpen: true, hasData: false };
  return { isOpen: isPlaceOpenAt(periods, dayOfWeek, arrivalMinutes, durationMin), hasData: true };
}
