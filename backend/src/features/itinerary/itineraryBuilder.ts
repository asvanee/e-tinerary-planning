import { checkOpeningStatus, OpeningHours } from "../../utils/openingHoursChecker";
import { haversineKm } from "../../utils/haversine";

/**
 * itineraryBuilder.ts
 *
 * Pure function ล้วน — ไม่ query DB เอง (ตามที่ตกลงไว้ใน itineraries_feature_status.md)
 * รับข้อมูลที่ query มาแล้วจาก itineraryPlaceQueries.ts (trip_days + selected places) เข้ามาคำนวณ
 * ทั้งจัดวันครั้งแรก (initial draft) และ re-validate ตอน user ลาก/สลับ/ลบ/เพิ่ม ใช้ฟังก์ชันชุดเดียวกัน
 * ทั้งฝั่ง client (แสดงผลทันที) และฝั่ง backend (re-validate ก่อน save จริง) เพื่อไม่ให้ผลลัพธ์เพี้ยนกัน
 *
 * ✅ อัปเดตมติล่าสุดเรื่อง placement algorithm ตอน build draft ครั้งแรก:
 * เปลี่ยนจากเดิม (ยัดทุกที่ไว้วันแรก + เรียงด้วย Nearest-Neighbor TSP heuristic) เป็น
 * **ไม่ auto-place ที่ไหนเลย** — สถานที่ที่เลือกมาทั้งหมดอยู่ใน "สถานที่ที่ยังไม่จัดลงวัน" (unassigned
 * pool ฝั่ง frontend) ตั้งแต่เริ่ม ให้ user ลากเข้าไปจัดวันเองทุกที่ตั้งแต่แรก ไม่มี default ให้เลย
 * (เหตุผล: ลด surprise ให้ user เห็นชัดว่าตัวเองยังไม่ได้ตัดสินใจอะไรเลย ไม่ใช่ระบบเดาให้ก่อนแล้วต้อง
 * มานั่งย้ายทีหลัง) — `buildNearestNeighborOrder()` ยังคง export ไว้เผื่ออนาคตทำปุ่ม
 * "จัดลำดับอัตโนมัติ" ให้ user กดเลือกใช้เองภายหลัง แต่ไม่ได้เรียกใช้ใน buildInitialDraft() แล้ว
 */

// ---------- Types ----------

export interface PlaceInput {
  placeId: string;
  latitude: number;
  longitude: number;
  priceLevel: number | null;
  openingHours: OpeningHours | null;
  defaultDurationMin: number;
}

export interface DayAssignment {
  tripDayId: number;
  visitDate: string; // "YYYY-MM-DD" — ใช้คำนวณ dayOfWeek ให้ openingHoursChecker
  startTime: string | null; // trip_days.start_time "HH:MM:SS"
  endTime: string | null; // trip_days.end_time "HH:MM:SS" — null ถ้าไม่ได้กรอก available_time_per_day
  dailyBudget: number | null;
  orderedPlaceIds: string[]; // ลำดับ = visit_order (index 0 = visit_order 1, ...)
}

export interface ItineraryItemResult {
  tripDayId: number;
  placeId: string;
  visitOrder: number;
  startTime: string | null;
  endTime: string | null;
  travelTimeFromPrev: number | null;
  distanceFromPrev: number | null;
  placeCost: number;
  isTimeConflict: boolean;
  isClosedConflict: boolean;
  isBudgetConflict: boolean;
  isHoursUnknown: boolean;
}

// ---------- Constants ----------

/** MVP: haversine ÷ ความเร็วเฉลี่ยสมมติ 25 กม./ชม. — ยังไม่เชื่อม transit API จริง (ดูหัวข้อ 5) */
const AVG_SPEED_KMH = 25;

/**
 * price_level (0-4) -> บาท — ตาราง conversion เดียวกับที่ใช้ใน poiScoreCalculator.ts
 * ✅ PROJECT_BRIEF.md ข้อ 4.3 ปิดแล้ว: การ coalesce price_level = null ไปเป็นค่า default ตาม category
 * (places.price_level -> categories.default_price_level -> 0) ทำเสร็จแล้วที่ต้นทางใน
 * itineraryPlaceQueries.ts (getSelectedPlaces) ก่อนส่งเข้ามาให้ไฟล์นี้ — priceLevel ที่รับเข้ามาที่นี่
 * จึงแทบไม่มีทาง null จริงในทางปฏิบัติ การเช็ค null ใน getPlaceCost() ด้านล่างเป็นแค่ safety net เผื่อ
 * edge case เท่านั้น ไม่ใช่จุด fallback หลักอีกต่อไป
 */
const PRICE_LEVEL_TO_BAHT: Record<number, number> = {
  0: 0,
  1: 200,
  2: 450,
  3: 900,
  4: 1500,
};

// ---------- Helpers ----------

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
 * 0 = อาทิตย์ ... 6 = เสาร์ ตรงกับ convention ของ places.opening_hours (Date.getDay() ของ JS พอดี)
 * ใช้ Date.UTC กัน timezone เลื่อนวัน
 */
function getDayOfWeek(visitDate: string): number {
  const [y, m, d] = visitDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// priceLevel ถูก coalesce มาจาก itineraryPlaceQueries.ts แล้ว (ดู comment เหนือ PRICE_LEVEL_TO_BAHT)
// เช็ค null ตรงนี้เป็นแค่ safety net เผื่อ edge case ไม่ใช่จุด fallback หลัก
function getPlaceCost(priceLevel: number | null): number {
  if (priceLevel === null) return 0;
  return PRICE_LEVEL_TO_BAHT[priceLevel] ?? 0;
}

/**
 * จัดลำดับสถานที่ด้วย Nearest-Neighbor Heuristic — **ไม่ได้ถูกเรียกใช้ใน buildInitialDraft()
 * อีกต่อไป** (ดูมติใหม่ด้านบนหัวไฟล์) เก็บไว้ export เผื่ออนาคตทำปุ่ม "จัดลำดับอัตโนมัติ" ให้ user
 * เลือกกดใช้เองในหน้า editor แทนการ auto-run ตอน build draft ครั้งแรก
 *
 * Complexity O(n²) — ไม่ต้องกังวลเรื่อง performance เพราะ n เล็กมากในทางปฏิบัติ
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
        // placeId ไม่มีข้อมูลจริง (ไม่ควรเกิด) -> ตัดทิ้งกันวน loop ไม่จบ
        remaining.delete(id);
        continue;
      }

      const distance = haversineKm(currentLat, currentLng, place.latitude, place.longitude);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }

    if (nearestId === null) break; // เหลือแต่ placeId ที่ไม่มีข้อมูลจริงทั้งหมด

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
 * ใช้ทั้งตอน build draft ครั้งแรก และตอน re-validate ซ้ำหลัง user ลาก/สลับ/ลบ/เพิ่ม (เรียกด้วย
 * orderedPlaceIds ชุดใหม่ของวันที่ถูกแก้ทุกครั้ง ตามมติ "recalculate ใหม่ตั้งแต่ต้นวันนั้นทุกครั้ง")
 */
export function buildDayItems(
  day: DayAssignment,
  placesById: Map<string, PlaceInput>
): ItineraryItemResult[] {
  const results: ItineraryItemResult[] = [];

  const dayOfWeek = getDayOfWeek(day.visitDate);
  const dayEndMinutes = day.endTime ? timeStringToMinutes(day.endTime) : null;
  const dayStartMinutes = day.startTime ? timeStringToMinutes(day.startTime) : null;

  let prevLat: number | null = null;
  let prevLng: number | null = null;
  let prevEndMinutes: number | null = dayStartMinutes;
  let cumulativeCost = 0;

  day.orderedPlaceIds.forEach((placeId, index) => {
    const place = placesById.get(placeId);
    if (!place) {
      // ไม่ควรเกิดถ้า itineraryPlaceQueries.ts ดึงข้อมูลมาครบตาม place_ids ที่ user เลือก
      // ข้ามไปเงียบๆ ไม่ทำให้ทั้ง request พังเพราะ 1 place หลุดหาย
      return;
    }

    const isFirstOfDay = index === 0;

    // ---- ระยะทาง/เวลาเดินทาง ----
    let distanceFromPrev: number | null = null;
    let travelTimeFromPrev: number | null = null;

    if (!isFirstOfDay && prevLat !== null && prevLng !== null) {
      distanceFromPrev = haversineKm(prevLat, prevLng, place.latitude, place.longitude);
      travelTimeFromPrev = Math.round((distanceFromPrev / AVG_SPEED_KMH) * 60);
    }

    // ---- เวลาเข้า/ออก ----
    let startMinutes: number | null;
    if (isFirstOfDay) {
      startMinutes = dayStartMinutes; // จุดแรกของวัน = trip_days.start_time ตรงๆ
    } else if (prevEndMinutes !== null && travelTimeFromPrev !== null) {
      startMinutes = prevEndMinutes + travelTimeFromPrev;
    } else {
      startMinutes = null; // ไม่มี trip_days.start_time ให้เริ่มนับ (เคสไม่ควรเกิดจริง)
    }

    const endMinutes = startMinutes !== null ? startMinutes + place.defaultDurationMin : null;

    // ---- conflict: เวลา ----
    const isTimeConflict =
      dayEndMinutes !== null && endMinutes !== null ? endMinutes > dayEndMinutes : false;

    // ---- conflict: เวลาเปิด-ปิด ----
    const { isOpen, hasData } =
      startMinutes !== null
        ? checkOpeningStatus(place.openingHours, dayOfWeek, startMinutes, place.defaultDurationMin)
        : { isOpen: true, hasData: false };
    const isClosedConflict = hasData ? !isOpen : false;
    const isHoursUnknown = !hasData;

    // ---- conflict: งบ ----
    const placeCost = getPlaceCost(place.priceLevel);
    cumulativeCost += placeCost;
    const isBudgetConflict = day.dailyBudget !== null ? cumulativeCost > day.dailyBudget : false;

    results.push({
      tripDayId: day.tripDayId,
      placeId: place.placeId,
      visitOrder: index + 1,
      startTime: startMinutes !== null ? minutesToTimeString(startMinutes) : null,
      endTime: endMinutes !== null ? minutesToTimeString(endMinutes) : null,
      travelTimeFromPrev,
      distanceFromPrev,
      placeCost,
      isTimeConflict,
      isClosedConflict,
      isBudgetConflict,
      isHoursUnknown,
    });

    prevLat = place.latitude;
    prevLng = place.longitude;
    prevEndMinutes = endMinutes;
  });

  return results;
}

/**
 * รวมหลายวันเข้าด้วยกัน — ใช้ตอนต้องคำนวณทุกวันพร้อมกัน (เช่น confirm ก่อน save)
 */
export function buildItinerary(
  dayAssignments: DayAssignment[],
  placesById: Map<string, PlaceInput>
): ItineraryItemResult[] {
  return dayAssignments.flatMap((day) => buildDayItems(day, placesById));
}

/**
 * Build draft ครั้งแรกตอน user กด "จัดเส้นทาง" จากหน้า POI list
 *
 * ✅ เปลี่ยนมติแล้ว (ดู comment หัวไฟล์): ไม่ auto-place สถานที่ที่เลือกมาไว้วันไหนเลยอีกต่อไป
 * (เดิม: ยัดวันแรกทั้งหมด + เรียงด้วย Nearest-Neighbor TSP heuristic) — คืน items ว่างเปล่าเสมอ
 * ทำให้ทุกที่ที่เลือกมาไปอยู่ใน "สถานที่ที่ยังไม่จัดลงวัน" ฝั่ง frontend โดยอัตโนมัติ (editor คำนวณ
 * unassigned pool จากสถานที่ที่ไม่ปรากฏใน items อยู่แล้ว ไม่ต้องแก้ฝั่ง frontend เพิ่ม)
 *
 * เก็บ signature เดิมไว้ทั้งหมด (แม้พารามิเตอร์ส่วนใหญ่จะไม่ได้ใช้แล้ว) กัน breaking change กับ
 * itineraryController.ts ที่เรียกใช้อยู่ — พารามิเตอร์ที่ไม่ใช้แล้วขึ้นต้นด้วย `_` ตาม convention
 */
export function buildInitialDraft(
  tripDays: DayAssignment[],
  _placeIds: string[],
  _placesById: Map<string, PlaceInput>,
  _startLat: number,
  _startLng: number
): ItineraryItemResult[] {
  if (tripDays.length === 0) return [];
  return [];
}