import { checkOpeningStatus } from "./openingHoursChecker";
import type { OpeningHours } from "./openingHoursChecker";
import { haversineKm } from "./haversine";

/**
 * itineraryBuilder.ts (frontend port)
 *
 * สำเนาของ backend/src/features/itinerary/itineraryBuilder.ts (pure function ไม่แตะ DB)
 * ใช้ recompute ทันทีตอน user ลาก/สลับ/ลบ/เพิ่ม/ย้ายวันในหน้า itinerary editor (ไม่รอ network)
 * backend ยัง re-validate ซ้ำด้วยฟังก์ชันเดียวกันก่อน save เสมอ
 *
 * ⚠️ ฟังก์ชันและ type ต้องตรงกับ backend ทุกบรรทัด — แก้ฝั่งหนึ่งต้องแก้อีกฝั่งด้วย
 * (ใช้ skill itinerary-mirror-sync) · ค่าคงที่ที่ backend import จาก utils/ ประกาศซ้ำไว้ในหัวข้อ Constants
 */

// ---------- Types ----------

// ค่าเดียวกับ backend poiPlaceQueries.ts::PriceNature
export type PriceNature = "free" | "paid";

export interface PlaceInput {
  placeId: string;
  latitude: number;
  longitude: number;
  // priceRange ต่อคน (บาท) จาก Places API (New) — D-52 · null = ไม่มีข้อมูล
  priceRangeStart: number | null;
  priceRangeEnd: number | null;
  priceNature: PriceNature; // ของหมวดจากป้าย ททท.
  openingHours: OpeningHours | null;
  // เวลาที่ผู้ใช้กรอกว่าจะอยู่ (นาที — D-36) · null = ยังไม่กรอก: ไม่รู้เวลาจบ
  // จึงเช็คเวลาเปิดแค่ตอนไปถึง และสถานที่ถัดไปในวันนั้นคิดเวลาไม่ได้
  visitDurationMin: number | null;
}

export interface DayAssignment {
  tripDayId: string;
  dayNumber: number; // Day 1 เท่านั้นที่มี leg จุดเริ่มต้นทริป -> สถานที่แรก
  visitDate: string; // "YYYY-MM-DD"
  startTime: string | null; // trip_days.start_time "HH:MM:SS"
  endTime: string | null; // trip_days.end_time "HH:MM:SS"
  dailyBudget: number | null;
  useBudget: boolean; // เช็ค isBudgetConflict จากค่านี้ ไม่เดาจาก dailyBudget !== null
  orderedPlaceIds: string[]; // ลำดับ = visit_order (index 0 = visit_order 1, ...)
}

export interface ItineraryItemResult {
  tripDayId: string;
  placeId: string;
  visitOrder: number;
  startTime: string | null;
  endTime: string | null;
  travelTimeFromPrev: number | null;
  distanceFromPrev: number | null;
  placeCost: number | null; // null = ไม่ทราบราคา — UI ต้องเช็ค isCostUnknown ก่อนแสดง
  isCostUnknown: boolean; // "ไม่ทราบราคา" ≠ "เกินงบ"
  isTimeConflict: boolean;
  isClosedConflict: boolean;
  isBudgetConflict: boolean; // คิดจากยอดที่รู้ราคาจริงเท่านั้น
  isHoursUnknown: boolean;
}

// ---------- Constants (ต้องตรงกับ backend) ----------

/** reserved id ของจุดเริ่มต้นทริปใน TravelMatrix — backend utils/orsTravelMatrix.ts */
export const TRIP_START_ID = "__trip_start__";

/** ใช้เฉพาะคู่ที่หาใน matrix ไม่เจอ (เช่น draft เก่าที่ไม่มี matrix) — backend utils/orsTravelMatrix.ts */
const FALLBACK_AVG_SPEED_KMH = 25;

/** backend utils/orsTravelMatrix.ts (JSON serialize ได้ ไม่ใช้ Map) */
export interface TravelMetric {
  distanceKm: number;
  durationMin: number;
  source: "ors" | "haversine";
}

/** matrix[fromId][toId] — from/to เป็น placeId หรือ TRIP_START_ID */
export type TravelMatrix = Record<string, Record<string, TravelMetric>>;

// ---------- Helpers ----------

// timeStringToMinutes / minutesToTimeString — backend utils/timeString.ts

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

/**
 * 0 = อาทิตย์ ... 6 = เสาร์ ตรงกับ convention ของ places.opening_hours
 * ใช้ Date.UTC กัน timezone เลื่อนวัน
 */
function getDayOfWeek(visitDate: string): number {
  const [y, m, d] = visitDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * ราคาที่รู้จาก Google: ขอบบนของ priceRange -> ขอบล่าง (ช่วงแบบ "มากกว่า X" ไม่มีขอบบน)
 * null = Google ไม่มีข้อมูลราคา — backend utils/placePrice.ts (D-52)
 */
function getKnownPrice(
  priceRangeStart: number | null,
  priceRangeEnd: number | null
): number | null {
  return priceRangeEnd ?? priceRangeStart;
}

/**
 * ราคาที่ใช้คิดงบ — ไม่มีราคาจาก Google: free -> 0 บาท (วัด/สวนสาธารณะมักฟรีจริง) · paid -> null (ไม่ทราบราคา ไม่เดา)
 * backend utils/placePrice.ts
 */
function getPlaceCost(
  priceRangeStart: number | null,
  priceRangeEnd: number | null,
  priceNature: "free" | "paid"
): number | null {
  const knownPrice = getKnownPrice(priceRangeStart, priceRangeEnd);
  if (knownPrice !== null) return knownPrice;
  if (priceNature === "free") return 0;
  return null; // paid + missing = unknown จริง
}

/**
 * lookup metric ของคู่ from -> to จาก matrix ที่โหลดไว้แล้ว (ไม่ยิง network)
 * ไม่เจอ -> fallback haversine ÷ FALLBACK_AVG_SPEED_KMH เฉพาะคู่นั้น (pure, ไม่ throw)
 */
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
  // ขั้นต่ำ 1 นาทีเสมอ แม้ matrix จะมี 0 (เช่น draft เก่าที่สร้างก่อนแก้ toMinutes ฝั่ง backend)
  if (hit) return hit.durationMin >= 1 ? hit : { ...hit, durationMin: 1 };

  const km = haversineKm(fromLat, fromLng, toLat, toLng);
  return {
    distanceKm: Math.round(km * 100) / 100,
    // ขั้นต่ำ 1 นาที ตรงกับ orsTravelMatrix.ts::toMinutes
    durationMin: Math.max(1, Math.round((km / FALLBACK_AVG_SPEED_KMH) * 60)),
    source: "haversine",
  };
}

/**
 * Nearest-Neighbor ordering — ยังไม่มีที่เรียกใช้ เก็บไว้ตาม D-04 (อาจใช้กับ Auto Trip)
 * หน้า editor จัดลำดับด้วย drag-and-drop อย่างเดียว
 */
export function buildNearestNeighborOrder(
  startLat: number,
  startLng: number,
  placeIds: string[],
  placesById: Map<string, PlaceInput>
): string[] {
  const remaining = new Set(placeIds);
  const order: string[] = [];

  let currentLat = startLat;
  let currentLng = startLng;

  while (remaining.size > 0) {
    let nearestId: string | null = null;
    let nearestDistance = Infinity;

    for (const id of remaining) {
      const place = placesById.get(id);
      if (!place) {
        remaining.delete(id);
        continue;
      }

      const distance = haversineKm(currentLat, currentLng, place.latitude, place.longitude);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }

    if (nearestId === null) break;

    order.push(nearestId);
    remaining.delete(nearestId);

    const chosenPlace = placesById.get(nearestId)!;
    currentLat = chosenPlace.latitude;
    currentLng = chosenPlace.longitude;
  }

  return order;
}

// ---------- Core ----------

/**
 * คำนวณ 1 วัน — ไล่ตาม orderedPlaceIds ทีละจุด สะสมเวลา/งบ/ระยะทางจากจุดก่อนหน้าในวันเดียวกัน
 * เรียกตัวนี้ทุกครั้งที่ user ลาก/สลับ/ลบ/เพิ่มในวันนั้น (recalculate ใหม่ตั้งแต่ต้นวันเสมอ
 * ไม่ patch เฉพาะจุดที่ขยับ)
 */
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
      // เฉพาะ Day 1: trip start -> สถานที่แรก (Day 2+ ยังไม่มีนิยามจุดเริ่มต้นของวัน จึงเป็น null)
      const startMetric = travelMatrix[TRIP_START_ID]?.[place.placeId];
      if (startMetric) {
        distanceFromPrev = startMetric.distanceKm;
        travelTimeFromPrev = Math.max(1, startMetric.durationMin);
      }
    }

    let startMinutes: number | null;
    if (isFirstOfDay) {
      // Day 1 มี leg จากจุดเริ่มต้นทริป -> เริ่มเที่ยวหลังเดินทางถึง (Day 2+ travelTimeFromPrev = null -> เวลาเริ่มของวัน)
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
    // ไม่ทราบราคาไม่กระทบยอดสะสม (ไม่เดาว่าฟรีหรือแพง)
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

/**
 * รวมหลายวันเข้าด้วยกัน — ใช้ตอนต้อง recompute ทุกวันพร้อมกัน
 */
export function buildItinerary(
  dayAssignments: DayAssignment[],
  placesById: Map<string, PlaceInput>,
  travelMatrix: TravelMatrix
): ItineraryItemResult[] {
  return dayAssignments.flatMap((day) => buildDayItems(day, placesById, travelMatrix));
}

/**
 * Draft ครั้งแรกตอน user กด "จัดเส้นทาง" จากหน้า POI list — ไม่จัดสถานที่ลงวันไหนเลย (คืน [] เสมอ)
 * ItineraryEditor.tsx ใส่สถานที่ที่ไม่อยู่ใน items ลง "ยังไม่จัดลงวัน" ให้เอง
 * คง signature เดิมไว้ (พารามิเตอร์ที่ไม่ใช้ขึ้นต้นด้วย `_`)
 */
export function buildInitialDraft(
  _tripDays: DayAssignment[],
  _placeIds: string[],
  _placesById: Map<string, PlaceInput>,
  _startLat: number,
  _startLng: number
): ItineraryItemResult[] {
  return [];
}
