import type { OpeningHours } from "../e-tinerary/lib/openingHoursChecker";

// ช่วงเวลาเปิดรายวันจาก places.opening_hours — ใช้แสดงผลเท่านั้น (ไม่กระทบ conflict flag)
// ใช้ periods ชุดเดียวกับ openingHoursChecker.ts (รองรับเปิดข้ามเที่ยงคืน)

function hhmmToMin(t: string): number {
  return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2, 4), 10);
}

// ช่วงเวลาเปิดที่ทับวัน day (หน่วยนาทีนับจากเที่ยงคืนของวันนั้น) รวมช่วงข้ามเที่ยงคืนจากเมื่อวาน
// null = ไม่มีข้อมูล · "24h" = เปิด 24 ชม. · [] = ปิดทั้งวัน
export function openIntervalsForDay(oh: OpeningHours | null | undefined, day: number): { start: number; end: number }[] | "24h" | null {
  const periods = oh?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;
  if (periods.length === 1 && !periods[0]?.close) return "24h";

  const out: { start: number; end: number }[] = [];
  for (const p of periods) {
    if (!p?.close || !p?.open) continue;
    const openMin = hhmmToMin(p.open.time);
    let span = ((p.close.day - p.open.day + 7) % 7) * 1440 + hhmmToMin(p.close.time) - openMin;
    if (span <= 0) span += 7 * 1440;
    for (const off of [0, 1]) {
      if ((p.open.day + off) % 7 !== day) continue;
      const start = openMin - off * 1440;
      if (start + span > 0) out.push({ start, end: start + span });
    }
  }
  return out;
}

// วันที่ "YYYY-MM-DD" ทุกวันของทริป (inclusive) — ใช้ Date.UTC กัน timezone เลื่อนวัน
export function tripDates(startDate: string, endDate: string): string[] {
  const toUtc = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  const start = toUtc(startDate);
  const end = toUtc(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const dates: string[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

// วันของทริปที่สถานที่นี้ "ปิดทั้งวัน" (กติกาเดียวกับป้าย "ปิดทั้งวัน" ในหน้า editor)
// ไม่มีข้อมูลเวลาเปิด-ปิด = [] (ไม่ถือว่าปิด ตาม D-10)
export function closedTripDates(
  oh: OpeningHours | null | undefined,
  startDate: string,
  endDate: string
): string[] {
  return tripDates(startDate, endDate).filter((date) => {
    const intervals = openIntervalsForDay(oh, new Date(date + "T00:00:00Z").getUTCDay());
    return Array.isArray(intervals) && intervals.length === 0;
  });
}
