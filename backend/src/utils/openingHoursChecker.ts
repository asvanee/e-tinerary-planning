/**
 * openingHoursChecker.ts
 *
 * อ้างอิง structure จริงจากตาราง places.opening_hours (jsonb) ที่ตรวจสอบแล้วจากข้อมูลจริงใน Supabase:
 *
 * {
 *   "periods": [
 *     { "open": { "day": 0, "time": "1030" }, "close": { "day": 0, "time": "2200" } },
 *     ...
 *   ],
 *   "open_now": true,
 *   "weekday_text": ["วันจันทร์: 11:00–21:00", ...]
 * }
 *
 * ยืนยันแล้วจากข้อมูลจริง:
 * - day: 0 = อาทิตย์ ... 6 = เสาร์ (ตรงกับ Date.getDay() ของ JS พอดี ไม่ต้องแปลง)
 * - time: string 4 หลัก "HHMM" ไม่มี ':' คั่น เช่น "0900", "2200"
 * - เปิด 24 ชม.: periods มีแค่ 1 entry ที่มี open แต่ไม่มี close เลย (เช่น Ao Pong Resort)
 * - ปิดบางวัน: วันนั้นจะไม่มี entry อยู่ในอาร์เรย์เลย (ไม่ใช่ entry ที่มีค่า null)
 * - periods เป็น [] ว่างเปล่า: ยังไม่เจอในข้อมูลจริง (query แล้วไม่มีผลลัพธ์) แต่ใส่ guard ไว้เผื่ออนาคต
 *
 * ยืนยันแล้วจากข้อมูลจริง (พบทั้งคู่จริง ต้อง handle ให้ถูก):
 * - เปิดข้ามเที่ยงคืน: เช่น "EasyKart Pattaya TPS" เปิด 10:00 ปิดตี 1 (01:00) ของวันถัดไป ทุกวัน
 *   (close.day = open.day + 1 เสมอ) -> ต้องเช็คย้อนไปถึง period ของ "เมื่อวาน" ด้วยตอนเช็คช่วงตี 0-1
 *   ไม่ใช่แค่ยืดเวลาปิดของ period วันเดียวกันเฉยๆ (ดู isPlaceOpenAt: loop dayOffset 0 และ 1)
 * - เปิดหลายช่วงในวันเดียว: เช่น พิพิธภัณฑ์สุริยานุวัตรฯ, สถานเสาวภาฯ มี period ซ้ำวันเดียวกัน 2 ช่วง
 *   (เช่น เปิดเช้า-พักเที่ยง-เปิดบ่าย) -> ฟังก์ชันไล่ทุก period อยู่แล้ว ไม่ return ทันทีที่เจอตัวแรก
 *
 * ✅ นโยบายเมื่อไม่มีข้อมูล (place.opening_hours = null หรือ periods ว่าง) — อัปเดตแล้ว:
 * เดิม "ตีว่าปิด" (hard block ไม่ให้เลือกสถานที่นี้เลย) ตอนนี้เปลี่ยนเป็น
 * "อนุญาตให้เลือกได้ แต่ flag เป็น is_hours_unknown แยกจาก is_closed_conflict"
 * เหตุผล: 147/687 ที่ (21%) ไม่มีข้อมูล opening_hours เลย ถ้า hard block จะไม่มีทางถูกแนะนำได้เลยตลอดกาล
 * ดู hasOpeningHoursData() ด้านล่าง — isPlaceOpenAt() เองยังคง return false ให้กรณีไม่มีข้อมูล
 * เหมือนเดิม (แปลว่า "ยังไม่ยืนยันว่าเปิด" ไม่ใช่ "ปิดจริง") ผู้เรียกต้องเช็ค hasOpeningHoursData()
 * ก่อนเสมอ เพื่อแยกว่าจะ set is_closed_conflict (รู้ว่าปิดจริง) หรือ is_hours_unknown (ไม่รู้เลย)
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
 * (ต้องเปิดครอบคลุมทั้งช่วงเวลาที่จะอยู่ ไม่ใช่แค่ตอนไปถึง)
 *
 * ⚠️ ฟังก์ชันนี้ตอบแค่ "ยืนยันได้ไหมว่าเปิดครอบคลุมทั้งช่วง" เท่านั้น ไม่ได้ตัดสิน policy
 * ว่าจะ block การเลือกหรือไม่ — ถ้าไม่มีข้อมูลเลยจะ return false (=ยังไม่ยืนยันว่าเปิด)
 * แต่นั่น "ไม่ได้แปลว่าปิดจริง" ผู้เรียกต้องเช็ค hasOpeningHoursData() คู่กันเสมอ เพื่อแยก
 * "ปิดจริง" (มีข้อมูล + isPlaceOpenAt=false) ออกจาก "ไม่รู้" (ไม่มีข้อมูลเลย) — ดู checkOpeningStatus()
 * ซึ่งเป็น wrapper ที่รวม 2 ฟังก์ชันนี้ไว้ให้แล้ว แนะนำให้เรียก checkOpeningStatus() แทนตรงๆ
 *
 * @param openingHours   ค่าจาก places.opening_hours (null ได้ถ้าไม่มีข้อมูล)
 * @param dayOfWeek      0=อาทิตย์ ... 6=เสาร์ (คำนวณจากวันที่จริงของ trip_days.visit_date)
 * @param arrivalMinutes นาทีที่คาดว่าจะถึง นับจากเที่ยงคืนของ dayOfWeek นั้น (เช่น 09:30 = 570)
 * @param durationMin    ระยะเวลาที่จะอยู่ที่นั่น (นาที) จาก categories.default_duration_min
 */
export function isPlaceOpenAt(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number,
  arrivalMinutes: number,
  durationMin: number
): boolean {
  // ไม่มีข้อมูลเลย -> return false ("ยังไม่ยืนยันว่าเปิด") — การตัดสินใจว่าจะ block หรือแค่เตือน
  // เป็นหน้าที่ของผู้เรียก (ดู checkOpeningStatus() / hasOpeningHoursData() ด้านล่าง)
  if (!openingHours || !openingHours.periods || openingHours.periods.length === 0) {
    return false;
  }

  const periods = openingHours.periods;

  // เคสเปิด 24 ชม.: มี period เดียวในทั้งอาร์เรย์ และไม่มี close เลย
  if (periods.length === 1 && periods[0].close === undefined) {
    return true;
  }

  // ไล่ทุก period (อาจมีหลายช่วงในวันเดียว เช่น เปิดเช้า-พักเที่ยง-เปิดบ่าย)
  // สำหรับแต่ละ period ต้องเช็ค 2 กรณี:
  //   dayOffset=0 -> วันที่กำลังเช็ค คือวันที่ period นี้ "เริ่มเปิด" พอดี
  //   dayOffset=1 -> วันที่กำลังเช็ค คือวันถัดจากที่ period นี้เริ่มเปิด 1 วัน
  //                  (ครอบคลุมกรณีเปิดข้ามเที่ยงคืน เช่น EasyKart Pattaya TPS ที่เปิด 10:00
  //                   ปิดตี 1 ของวันถัดไปทุกวัน -> ต้องมองเห็น period ของ "เมื่อวาน" ด้วยตอนเช็คตี 0-1)
  for (const period of periods) {
    if (!period.close) continue; // period ประหลาดที่ไม่มี close แต่ไม่ใช่เคส 24 ชม. -> ข้าม กันพัง

    const openDay = period.open.day;
    const openMinutes = timeStringToMinutes(period.open.time);
    const closeDay = period.close.day;
    const closeMinutes = timeStringToMinutes(period.close.time);

    // ความยาวของช่วงเปิด (นาที) นับจากจุดเปิดถึงจุดปิด รองรับข้ามเที่ยงคืน
    let spanMinutes = ((closeDay - openDay + 7) % 7) * 1440 + closeMinutes - openMinutes;
    if (spanMinutes <= 0) spanMinutes += 7 * 1440; // กันเคสประหลาดที่ไม่ควรเกิดในทางปฏิบัติ

    for (const dayOffset of [0, 1]) {
      if ((openDay + dayOffset) % 7 !== dayOfWeek) continue;

      // แปลง arrival ของวันที่เช็ค ให้อยู่ใน timeline เดียวกับวันที่ period เริ่มเปิด (openDay)
      const relativeArrival = dayOffset * 1440 + arrivalMinutes;
      const relativeDeparture = relativeArrival + durationMin;

      if (relativeArrival >= openMinutes && relativeDeparture <= openMinutes + spanMinutes) {
        return true;
      }
    }
  }

  // ไม่มี period ไหนครอบคลุมช่วงเวลาที่จะไปเลย
  // (รวมถึงกรณีวันนั้นไม่มี entry อยู่ในอาร์เรย์เลย = ปิดทั้งวัน)
  return false;
}

/**
 * ✅ เพิ่มใหม่: เช็คว่า place นี้มีข้อมูล opening_hours อยู่จริงไหม (ไม่ว่าจะเปิด/ปิดตอนนี้)
 * ใช้แยก "ไม่รู้เลย" (ไม่มีข้อมูล) ออกจาก "รู้ว่าปิด" (มีข้อมูลแต่ isPlaceOpenAt = false)
 * — 2 เคสนี้ควร flag คนละตัวกัน ไม่ควรปนกันเป็น is_closed_conflict ตัวเดียว
 */
export function hasOpeningHoursData(
  openingHours: OpeningHours | null | undefined
): boolean {
  return !!(openingHours && openingHours.periods && openingHours.periods.length > 0);
}

export interface OpeningStatusResult {
  /** true = ยืนยันว่าเปิดครอบคลุมทั้งช่วงที่จะอยู่ (มีความหมายเฉพาะตอน hasData = true) */
  isOpen: boolean;
  /** false = ไม่มีข้อมูล opening_hours เลย ("ไม่รู้") — ต้องแยกจากกรณีปิดจริง */
  hasData: boolean;
}

/**
 * ✅ เพิ่มใหม่: wrapper รวม isPlaceOpenAt() + hasOpeningHoursData() ไว้ในที่เดียว
 * แนะนำให้ itineraryBuilder.ts เรียกฟังก์ชันนี้แทนการเรียก isPlaceOpenAt() ตรงๆ
 * เพื่อไม่ให้ต้องเช็ค "มีข้อมูลไหม" ซ้ำเองทุกจุดที่ใช้
 *
 * วิธีนำไปใช้ตั้งค่า flag ทั้ง 2 ตัวใน itineraries:
 *   const { isOpen, hasData } = checkOpeningStatus(...)
 *   is_closed_conflict = hasData ? !isOpen : false   // ไม่มีข้อมูล = ไม่ถือว่า "ปิด conflict"
 *   is_hours_unknown   = !hasData                    // ไม่มีข้อมูล = unknown ตรงๆ
 */
export function checkOpeningStatus(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number,
  arrivalMinutes: number,
  durationMin: number
): OpeningStatusResult {
  const hasData = hasOpeningHoursData(openingHours);

  if (!hasData) {
    // ไม่มีข้อมูลเลย -> อนุญาตให้เลือกได้ (isOpen: true เชิง policy) แต่ hasData: false
    // ให้ผู้เรียกไป set is_hours_unknown เตือน user แทนการ block แบบเดิม
    return { isOpen: true, hasData: false };
  }

  return {
    isOpen: isPlaceOpenAt(openingHours, dayOfWeek, arrivalMinutes, durationMin),
    hasData: true,
  };
}

/**
 * Helper เสริม: ดึงข้อความเวลาเปิด-ปิดของวันนั้นมาแสดงให้ user เห็นตรงๆ (ใช้ตอนแสดง badge "ปิดแล้วช่วงนี้")
 * ใช้ weekday_text ที่ Google เตรียมมาให้แล้ว แทนที่จะ format เอง
 */
export function getWeekdayText(
  openingHours: OpeningHours | null | undefined,
  dayOfWeek: number
): string | null {
  if (!openingHours?.weekday_text || openingHours.weekday_text.length !== 7) {
    return null;
  }
  // weekday_text เรียงเริ่มจากวันจันทร์ (index 0) แต่ dayOfWeek ของเราเริ่มที่อาทิตย์ (0)
  // แปลง: dayOfWeek=0(อาทิตย์) -> index 6, dayOfWeek=1(จันทร์) -> index 0, ...
  const index = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return openingHours.weekday_text[index] ?? null;
}