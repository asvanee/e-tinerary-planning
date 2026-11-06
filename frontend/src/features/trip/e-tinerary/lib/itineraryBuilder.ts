import { checkOpeningStatus } from "./openingHoursChecker";
import type { OpeningHours } from "./openingHoursChecker";
import { haversineKm } from "./haversine";

// ⚠️ ต้องแก้คู่กับ backend/src/features/itinerary/itineraryBuilder.ts (ใช้ skill itinerary-mirror-sync)
// คำนวณแผนใหม่ทันทีตอนผู้ใช้ลากจัดในหน้า editor — backend ตรวจซ้ำด้วยโค้ดเดียวกันก่อนบันทึก
// ค่าคงที่และฟังก์ชันที่ backend import จาก utils/ ประกาศซ้ำไว้ในไฟล์นี้

export type PriceNature = "free" | "paid";

export interface PlaceInput {
  placeId: string;
  latitude: number;
  longitude: number;
  priceRangeStart: number | null; // ช่วงราคาต่อคน (บาท) · null = ไม่มีข้อมูล
  priceRangeEnd: number | null;
  priceNature: PriceNature;
  openingHours: OpeningHours | null;
  // เวลาที่ผู้ใช้กรอกว่าจะอยู่ (นาที) · null = ยังไม่กรอก: ไม่รู้เวลาจบ
  // จึงเช็คเวลาเปิดแค่ตอนไปถึง และสถานที่ถัดไปในวันนั้นคิดเวลาไม่ได้
  visitDurationMin: number | null;
}

export interface DayAssignment {
  tripDayId: string;
  dayNumber: number; // วันที่ 1 เท่านั้นที่มีช่วงเดินทางจากจุดเริ่มต้นทริป
  visitDate: string; // "YYYY-MM-DD"
  startTime: string | null; // "HH:MM:SS"
  endTime: string | null;
  dailyBudget: number | null;
  useBudget: boolean;
  orderedPlaceIds: string[]; // index 0 = visit_order 1
}

export interface ItineraryItemResult {
  tripDayId: string;
  placeId: string;
  visitOrder: number;
  startTime: string | null;
  endTime: string | null;
  travelTimeFromPrev: number | null;
  distanceFromPrev: number | null;
  placeCost: number | null; // null = ไม่ทราบราคา
  isCostUnknown: boolean; // "ไม่ทราบราคา" ไม่ใช่ "เกินงบ"
  isTimeConflict: boolean;
  isClosedConflict: boolean;
  isBudgetConflict: boolean; // คิดจากยอดที่รู้ราคาเท่านั้น
  isHoursUnknown: boolean;
}

// ---------- ค่าที่ต้องตรงกับ backend utils/ ----------

// id ของจุดเริ่มต้นทริปใน matrix (utils/orsTravelMatrix.ts)
export const TRIP_START_ID = "__trip_start__";

const FALLBACK_AVG_SPEED_KMH = 30;

export interface TravelMetric {
  distanceKm: number;
  durationMin: number;
  source: "ors" | "haversine";
}

// matrix[fromId][toId] — from/to เป็น placeId หรือ TRIP_START_ID
export type TravelMatrix = Record<string, Record<string, TravelMetric>>;

// utils/timeString.ts
function timeStringToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

function minutesToTimeString(totalMinutes: number): string {
  const capped = Math.min(Math.max(totalMinutes, 0), 24 * 60 - 1);
  const hh = Math.floor(capped / 60);
  const mm = capped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

// utils/placePrice.ts — ใช้ขอบบนของช่วงราคาก่อน · ไม่มีราคา: หมวดฟรี 0 บาท, หมวดเสียเงิน null
function getKnownPrice(
  priceRangeStart: number | null,
  priceRangeEnd: number | null
): number | null {
  return priceRangeEnd ?? priceRangeStart;
}

function getPlaceCost(
  priceRangeStart: number | null,
  priceRangeEnd: number | null,
  priceNature: "free" | "paid"
): number | null {
  const knownPrice = getKnownPrice(priceRangeStart, priceRangeEnd);
  if (knownPrice !== null) return knownPrice;
  if (priceNature === "free") return 0;
  return null;
}

// ---------- logic เดียวกับ backend ----------

// 0 = อาทิตย์ .. 6 = เสาร์ (ใช้ UTC กัน timezone เลื่อนวัน)
function getDayOfWeek(visitDate: string): number {
  const [y, m, d] = visitDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ระยะ/เวลาเดินทางของคู่จาก matrix · ไม่มีในนั้นใช้ haversine ÷ ความเร็วเฉลี่ย (ขั้นต่ำ 1 นาที)
function resolveTravelMetric(
  matrix: TravelMatrix,
  fromId: string,
  toId: string,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): TravelMetric {
  const hit = matrix[fromId]?.[toId];
  if (hit) return hit.durationMin >= 1 ? hit : { ...hit, durationMin: 1 };

  const km = haversineKm(fromLat, fromLng, toLat, toLng);
  return {
    distanceKm: Math.round(km * 100) / 100,
    durationMin: Math.max(1, Math.round((km / FALLBACK_AVG_SPEED_KMH) * 60)),
    source: "haversine",
  };
}

// คำนวณ 1 วันใหม่ตั้งแต่ต้นวันทุกครั้ง: เวลาถึง/ออก ระยะทาง ยอดเงินสะสม และ conflict ของแต่ละที่
export function buildDayItems(
  day: DayAssignment,
  placesById: Map<string, PlaceInput>,
  travelMatrix: TravelMatrix
): ItineraryItemResult[] {
  const results: ItineraryItemResult[] = [];

  const dayOfWeek = getDayOfWeek(day.visitDate);
  const dayEndMinutes = day.endTime ? timeStringToMinutes(day.endTime) : null;
  const dayStartMinutes = day.startTime ? timeStringToMinutes(day.startTime) : null;

  let prevPlace: PlaceInput | null = null;
  let prevEndMinutes: number | null = dayStartMinutes;
  let cumulativeCost = 0;

  day.orderedPlaceIds.forEach((placeId, index) => {
    const place = placesById.get(placeId);
    if (!place) {
      return;
    }

    const isFirstOfDay = index === 0;

    let distanceFromPrev: number | null = null;
    let travelTimeFromPrev: number | null = null;

    if (!isFirstOfDay && prevPlace !== null) {
      const metric = resolveTravelMetric(
        travelMatrix,
        prevPlace.placeId,
        place.placeId,
        prevPlace.latitude,
        prevPlace.longitude,
        place.latitude,
        place.longitude
      );
      distanceFromPrev = metric.distanceKm;
      travelTimeFromPrev = metric.durationMin;
    } else if (isFirstOfDay && day.dayNumber === 1) {
      // วันที่ 1 เดินทางจากจุดเริ่มต้นทริป · วันอื่นที่แรกไม่มีช่วงเดินทาง
      const startMetric = travelMatrix[TRIP_START_ID]?.[place.placeId];
      if (startMetric) {
        distanceFromPrev = startMetric.distanceKm;
        travelTimeFromPrev = Math.max(1, startMetric.durationMin);
      }
    }

    let startMinutes: number | null;
    if (isFirstOfDay) {
      startMinutes =
        dayStartMinutes !== null ? dayStartMinutes + (travelTimeFromPrev ?? 0) : null;
    } else if (prevEndMinutes !== null && travelTimeFromPrev !== null) {
      startMinutes = prevEndMinutes + travelTimeFromPrev;
    } else {
      startMinutes = null;
    }

    const endMinutes =
      startMinutes !== null && place.visitDurationMin !== null
        ? startMinutes + place.visitDurationMin
        : null;

    const isTimeConflict =
      dayEndMinutes !== null && endMinutes !== null ? endMinutes > dayEndMinutes : false;

    const { isOpen, hasData } =
      startMinutes !== null
        ? checkOpeningStatus(place.openingHours, dayOfWeek, startMinutes, place.visitDurationMin ?? 0)
        : { isOpen: true, hasData: false };
    const isClosedConflict = hasData ? !isOpen : false;
    const isHoursUnknown = !hasData;

    const placeCost = getPlaceCost(
      place.priceRangeStart,
      place.priceRangeEnd,
      place.priceNature
    );
    const isCostUnknown = placeCost === null;
    // ไม่ทราบราคาไม่นับเข้ายอดสะสม (ไม่เดาว่าฟรีหรือแพง)
    cumulativeCost += placeCost ?? 0;

    const isBudgetConflict =
      day.useBudget && day.dailyBudget !== null ? cumulativeCost > day.dailyBudget : false;

    results.push({
      tripDayId: day.tripDayId,
      placeId: place.placeId,
      visitOrder: index + 1,
      startTime: startMinutes !== null ? minutesToTimeString(startMinutes) : null,
      endTime: endMinutes !== null ? minutesToTimeString(endMinutes) : null,
      travelTimeFromPrev,
      distanceFromPrev,
      placeCost,
      isCostUnknown,
      isTimeConflict,
      isClosedConflict,
      isBudgetConflict,
      isHoursUnknown,
    });

    prevPlace = place;
    prevEndMinutes = endMinutes;
  });

  return results;
}
