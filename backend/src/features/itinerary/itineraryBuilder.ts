import { checkOpeningStatus } from "../../utils/openingHoursChecker";
import type { OpeningHours } from "../../utils/openingHoursChecker";
import { haversineKm } from "../../utils/haversine";

/**
 * itineraryBuilder.ts (frontend port)
 *
 * Port จาก backend/src/features/itinerary/itineraryBuilder.ts — logic เดิม 100%
 * (pure function ล้วน ไม่แตะ DB) ใช้ตอน user ลาก/สลับ/ลบ/เพิ่ม/ย้ายวันในหน้า itinerary editor
 * เพื่อ recompute ให้เห็นผลทันที (ไม่รอ network) — backend ยัง re-validate ซ้ำด้วยฟังก์ชัน
 * เดิมฝั่ง server ก่อน save จริงเสมอ (ดูมติใน itineraries_feature_status.md)
 *
 * ⚠️ ถ้าแก้ logic ไฟล์นี้ฝั่ง backend ต้องแก้ไฟล์นี้คู่กันเสมอ ไม่งั้นผลลัพธ์ที่ user เห็นตอนลากปรับ
 * (client) จะเพี้ยนจากที่ backend ยืนยันตอนกด "ยืนยันแผน" (re-validate)
 *
 * ✅ อัปเดตมติล่าสุดเรื่อง placement algorithm ตอน build draft ครั้งแรก (sync กับ backend):
 * เปลี่ยนจากเดิม (ยัดทุกที่ไว้วันแรก + เรียงด้วย Nearest-Neighbor TSP heuristic) เป็น
 * **ไม่ auto-place ที่ไหนเลย** — สถานที่ที่เลือกมาทั้งหมดอยู่ใน "สถานที่ที่ยังไม่จัดลงวัน" (unassigned
 * pool ฝั่ง frontend) ตั้งแต่เริ่ม ให้ user ลากเข้าไปจัดวันเองทุกที่ตั้งแต่แรก ไม่มี default ให้เลย
 * `buildNearestNeighborOrder()` ยังคง export ไว้เผื่ออนาคตทำปุ่ม "จัดลำดับอัตโนมัติ" ให้ user
 * กดเลือกใช้เองภายหลัง แต่ไม่ได้เรียกใช้ใน buildInitialDraft() แล้ว
 *
 * ✅ อัปเดตมติล่าสุด #2 (sync กับ backend itineraryPlaceQueries.ts::getSelectedPlaces):
 * priceLevel coalesce กับ categories.default_price_level เสมอแล้ว เหมือน POI stage — ไม่ nullable
 * ในทางปฏิบัติอีกต่อไป (เดิมเคยตัดสินใจไม่ coalesce แล้วคิดเป็น 0 บาท มติเปลี่ยนแล้ว)
 *
 * ✅ อัปเดตมติล่าสุด #3: isBudgetConflict เช็คจาก day.useBudget ตรงๆ ก่อนเสมอ ไม่ใช่เดาจาก
 * dailyBudget !== null เฉยๆ แบบเดิม (เปราะบางถ้ามี daily_budget ค้างอยู่ทั้งที่ useBudget = false)
 */

// ---------- Types ----------

export interface PlaceInput {
  placeId: string;
  latitude: number;
  longitude: number;
  // ✅ มติล่าสุด (sync กับ backend itineraryPlaceQueries.ts::getSelectedPlaces): coalesce กับ
  // categories.default_price_level เสมอแล้ว เหมือน POI stage — ไม่ nullable ในทางปฏิบัติอีกต่อไป
  priceLevel: number;
  // ✅ เก็บ hasPriceLevel ไว้เผื่ออนาคตอยากแสดง badge "ราคาโดยประมาณ" แยกจาก isBudgetConflict
  // แต่ getPlaceCost() ด้านล่างไม่ได้ใช้ hasPriceLevel ตัดสินใจอะไรแล้ว นับ cost เสมอทั้งสองกรณี
  hasPriceLevel: boolean;
  openingHours: OpeningHours | null;
  defaultDurationMin: number;
}

export interface DayAssignment {
  tripDayId: number;
  visitDate: string; // "YYYY-MM-DD"
  startTime: string | null; // trip_days.start_time "HH:MM:SS"
  endTime: string | null; // trip_days.end_time "HH:MM:SS"
  dailyBudget: number | null;
  // ✅ เพิ่มใหม่ — เช็ค isBudgetConflict จากค่านี้ตรงๆ แทนการเดาจาก dailyBudget !== null เฉยๆ
  useBudget: boolean;
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

/** MVP: haversine ÷ ความเร็วเฉลี่ยสมมติ 25 กม./ชม. — ต้องตรงกับ backend เป๊ะ */
const AVG_SPEED_KMH = 25;

/**
 * price_level (0-4) -> บาท — ต้องตรงกับ backend เป๊ะ
 * (backend extract ไปเป็น shared constant ที่ backend/src/utils/priceLevel.ts แล้ว
 * ไฟล์นี้เป็น frontend port แยก package จึงต้อง declare ค่าเดียวกันไว้เองที่นี่ — ถ้าแก้ราคา
 * ฝั่ง backend ต้องแก้ที่นี่คู่กันด้วยเสมอ ไม่มี auto-sync ข้าม package)
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
 * 0 = อาทิตย์ ... 6 = เสาร์ ตรงกับ convention ของ places.opening_hours
 * ใช้ Date.UTC กัน timezone เลื่อนวัน
 */
function getDayOfWeek(visitDate: string): number {
  const [y, m, d] = visitDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ✅ priceLevel coalesce กับ default_price_level ของหมวดหมู่มาจาก backend เสมอแล้ว
// (ดู itineraryPlaceQueries.ts::getSelectedPlaces) เหมือน POI stage — ไม่ nullable ในทางปฏิบัติ
// พารามิเตอร์ยังรับ `| null` ไว้เป็น defensive fallback เผื่อข้อมูลผิดปกติหลุดเข้ามา
// (เช่น หน้า editor ส่ง object ที่ยังไม่ผ่าน backend มา) ไม่ได้แปลว่า "ฟรี" จริง แค่กันพัง
function getPlaceCost(priceLevel: number | null): number {
  if (priceLevel === null) return 0;
  return PRICE_LEVEL_TO_BAHT[priceLevel] ?? 0;
}

/**
 * Nearest-Neighbor Heuristic — **ไม่ได้ถูกเรียกใช้ใน buildInitialDraft() อีกต่อไป** (ดูมติใหม่
 * หัวไฟล์) เก็บไว้ export เผื่ออนาคตทำปุ่ม "จัดลำดับอัตโนมัติ" ให้ user เลือกกดใช้เองในหน้า editor
 * แทนการ auto-run ตอน build draft ครั้งแรก — ให้ logic ตรงกับ backend เป๊ะ
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
      return;
    }

    const isFirstOfDay = index === 0;

    let distanceFromPrev: number | null = null;
    let travelTimeFromPrev: number | null = null;

    if (!isFirstOfDay && prevLat !== null && prevLng !== null) {
      distanceFromPrev = haversineKm(prevLat, prevLng, place.latitude, place.longitude);
      travelTimeFromPrev = Math.round((distanceFromPrev / AVG_SPEED_KMH) * 60);
    }

    let startMinutes: number | null;
    if (isFirstOfDay) {
      startMinutes = dayStartMinutes;
    } else if (prevEndMinutes !== null && travelTimeFromPrev !== null) {
      startMinutes = prevEndMinutes + travelTimeFromPrev;
    } else {
      startMinutes = null;
    }

    const endMinutes = startMinutes !== null ? startMinutes + place.defaultDurationMin : null;

    const isTimeConflict =
      dayEndMinutes !== null && endMinutes !== null ? endMinutes > dayEndMinutes : false;

    const { isOpen, hasData } =
      startMinutes !== null
        ? checkOpeningStatus(place.openingHours, dayOfWeek, startMinutes, place.defaultDurationMin)
        : { isOpen: true, hasData: false };
    const isClosedConflict = hasData ? !isOpen : false;
    const isHoursUnknown = !hasData;

    const placeCost = getPlaceCost(place.priceLevel);
    cumulativeCost += placeCost;
    // ✅ เช็ค day.useBudget ตรงๆ ก่อนเสมอ — ไม่พึ่งแค่ dailyBudget !== null (เดิม) เพราะเปราะบาง
    // ถ้าในอนาคตมี daily_budget ค้างอยู่ทั้งที่ useBudget = false (เช่น bug จุดอื่นไม่เคลียร์ค่า)
    // จะทำให้ conflict โผล่มาทั้งที่ user เลือกไม่ใช้งบไว้ตั้งแต่แรก
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
 * รวมหลายวันเข้าด้วยกัน — ใช้ตอนต้อง recompute ทุกวันพร้อมกัน
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
 * ✅ เปลี่ยนมติแล้ว (ดู comment หัวไฟล์, sync กับ backend): ไม่ auto-place สถานที่ที่เลือกมาไว้วัน
 * ไหนเลยอีกต่อไป (เดิม: ยัดวันแรกทั้งหมด + เรียงด้วย Nearest-Neighbor TSP heuristic) — คืน items
 * ว่างเปล่าเสมอ ทำให้ทุกที่ที่เลือกมาไปอยู่ใน "สถานที่ที่ยังไม่จัดลงวัน" ฝั่ง frontend โดยอัตโนมัติ
 * (ItineraryEditor.tsx คำนวณ unassigned pool จากสถานที่ที่ไม่ปรากฏใน items อยู่แล้ว)
 *
 * เก็บ signature เดิมไว้ทั้งหมด (แม้พารามิเตอร์ส่วนใหญ่จะไม่ได้ใช้แล้ว) กัน breaking change กับ
 * จุดที่เรียกใช้ฝั่ง frontend — พารามิเตอร์ที่ไม่ใช้แล้วขึ้นต้นด้วย `_` ตาม convention
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