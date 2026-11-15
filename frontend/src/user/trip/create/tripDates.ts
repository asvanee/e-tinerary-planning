// วันที่ของทริปเป็น string "YYYY-MM-DD" คิดแบบ UTC ทั้งหมด จะได้ไม่เพี้ยนตาม timezone ของเครื่อง
// ⚠️ MAX_TRIP_DAYS ต้องตรงกับ backend/src/user/trip/tripDateRange.ts
//    FORECAST_MAX_DAYS_AHEAD ต้องตรงกับ backend/src/utils/weatherForecast.ts
// [ค่า] หน้าสร้างแผน(วันที่) · MAX_TRIP_DAYS = 31 — จำนวนวันสูงสุดของแผน (ต้องตรง backend tripDateRange.ts)
export const MAX_TRIP_DAYS = 31;
// [ค่า] หน้าสร้างแผน(วันที่) · FORECAST_MAX_DAYS_AHEAD = 15 — จำนวนวันล่วงหน้าที่มีพยากรณ์ฝน (ต้องตรง backend weatherForecast.ts)
export const FORECAST_MAX_DAYS_AHEAD = 15; // Open-Meteo พยากรณ์ได้ 16 วันรวมวันนี้

const DAY_MS = 24 * 60 * 60 * 1000;

// วันนี้ตามเวลาไทย "YYYY-MM-DD"
export function todayInBangkok(): string {
    // เวลาไทย = UTC+7 (ไม่มี DST)
    return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// บวกวันให้วันที่ "YYYY-MM-DD"
export function addDays(isoDate: string, days: number): string {
    return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// จำนวนวันนับรวมวันแรกและวันสุดท้าย (วันจบก่อนวันเริ่มได้ค่า ≤ 0)
export function countTripDays(startDate: string, endDate: string): number {
    return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1;
}

// วันสุดท้ายที่ Open-Meteo พยากรณ์ได้ — API นับ "วันนี้" ตามวันที่ UTC (เที่ยงคืน–7 โมงเช้าเวลาไทยจึงได้น้อยกว่า 16 วัน 1 วัน)
// ⚠️ ต้องแก้คู่กับ forecastLastDay ใน backend/src/utils/weatherForecast.ts
export function forecastLastDay(now: number = Date.now()): string {
    return addDays(new Date(now).toISOString().slice(0, 10), FORECAST_MAX_DAYS_AHEAD);
}

// วันนี้มีพยากรณ์ฝนไหม (อยู่ระหว่างวันนี้ถึงวันสุดท้ายที่พยากรณ์ได้)
export function hasForecast(isoDate: string, today: string, lastForecastDay: string): boolean {
    return isoDate >= today && isoDate <= lastForecastDay;
}

// วันที่ "YYYY-MM-DD" มีอยู่จริงในปฏิทินไหม (เช่น 2026-02-30 ไม่มี)
function isRealDate(isoDate: string): boolean {
    const time = Date.parse(`${isoDate}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === isoDate;
}

// ตรวจช่วงวันก่อนส่ง (backend ตรวจซ้ำ) — null = ผ่าน
// ⚠️ กติกาเดียวกับ getTripDateRangeError ใน backend/src/user/trip/tripDateRange.ts
export function getTripDateError(startDate: string, endDate: string): string | null {
    if (!startDate || !endDate) return "กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด";
    if (!isRealDate(startDate) || !isRealDate(endDate)) return "รูปแบบวันที่ไม่ถูกต้อง";
    const days = countTripDays(startDate, endDate);
    if (days < 1) return "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น";
    if (days > MAX_TRIP_DAYS) return `แผนยาวได้ไม่เกิน ${MAX_TRIP_DAYS} วัน`;
    return null;
}
