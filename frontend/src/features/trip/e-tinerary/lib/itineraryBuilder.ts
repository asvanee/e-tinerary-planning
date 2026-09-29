import { checkOpeningStatus } from "./openingHoursChecker";
import type { OpeningHours } from "./openingHoursChecker";
import { haversineKm } from "./haversine";

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
 * ✅ มติล่าสุดเรื่อง placement algorithm ตอน build draft ครั้งแรก (sync กับ backend, ยืนยันแล้ว
 * ว่าเป็น final design ไม่ใช่ทางเลือกชั่วคราว):
 * เปลี่ยนจากเดิม (ยัดทุกที่ไว้วันแรก + เรียงด้วย Nearest-Neighbor TSP heuristic) เป็น
 * **ไม่ auto-place ที่ไหนเลย** — สถานที่ที่เลือกมาทั้งหมดอยู่ใน "สถานที่ที่ยังไม่จัดลงวัน" (unassigned
 * pool ฝั่ง frontend) ตั้งแต่เริ่ม ให้ user ลากเข้าไปจัดวันเองทุกที่ตั้งแต่แรก ไม่มี default ให้เลย
 * หน้า itinerary editor จะไม่มีปุ่ม "จัดลำดับอัตโนมัติ" ด้วย — เป็น manual drag เพียงอย่างเดียว
 * `buildNearestNeighborOrder()` ไม่ได้เรียกใช้ที่ไหนในระบบแล้ว เก็บไว้เผื่อ reuse ใน scope อื่น
 * (ดู comment ที่ตัวฟังก์ชันด้านล่าง)
 *
 * ✅ อัปเดตมติล่าสุด #2 (v2, sync กับ PRICE_SCORE_REDESIGN.md + backend itineraryPlaceQueries.ts::
 * getSelectedPlaces): เลิก coalesce priceLevel กับ categories.default_price_level แล้ว (column
 * กำลังจะถูก drop) — เปลี่ยนเป็นรับ rawPriceLevel + priceNature แยก ไม่เดาราคาเมื่อไม่มีข้อมูลจริง
 * (ยกเว้น free category ที่มั่นใจได้สูงว่าใกล้ 0 บาท) placeCost เป็น null ได้แล้ว (เดิม non-nullable)
 * แยก isCostUnknown ออกจาก isBudgetConflict ชัดเจน — cumulativeCost/isBudgetConflict คำนวณจาก
 * ยอดที่ "รู้จริง" เท่านั้น ไม่รวมของที่ไม่ทราบราคา (มติ B ที่ล็อกไว้ — ดู decision log ใน
 * PRICE_SCORE_REDESIGN.md: ปฏิเสธการเดาแล้ว "ลงโทษผิดๆ" ใช้หลักเดียวกันฝั่ง cost)
 *
 * ✅ อัปเดตมติล่าสุด #3: isBudgetConflict เช็คจาก day.useBudget ตรงๆ ก่อนเสมอ ไม่ใช่เดาจาก
 * dailyBudget !== null เฉยๆ แบบเดิม (เปราะบางถ้ามี daily_budget ค้างอยู่ทั้งที่ useBudget = false)
 */

// ---------- Types ----------

// ✅ ใหม่ — mirror จาก backend (features/poi/poiPlaceQueries.ts::PriceNature) ไฟล์นี้เป็น
// frontend port แยก package จึง import ข้าม package ไม่ได้ ต้อง declare ค่าเดียวกันไว้เองที่นี่
// (เหมือนที่ PRICE_LEVEL_TO_BAHT ด้านล่างทำอยู่แล้ว) — ถ้าแก้ค่าที่เป็นไปได้ฝั่ง backend ต้องแก้
// ที่นี่คู่กันด้วยเสมอ ไม่มี auto-sync ข้าม package
// ✅ ยุบเหลือ 2 หมวดแล้ว (เดิม "free" | "food" | "paid_other") ให้ตรงกับ backend
export type PriceNature = "free" | "paid";

export interface PlaceInput {
  placeId: string;
  latitude: number;
  longitude: number;
  // ✅ v2 (เลิก coalesce กับ default_price_level แล้ว — ดู PRICE_SCORE_REDESIGN.md):
  // rawPriceLevel = null หมายถึง "ไม่มีราคาจริงจาก Google" จริงๆ ไม่ใช่ fallback อีกต่อไป
  rawPriceLevel: number | null;
  priceNature: PriceNature; // ตัดสินจาก category ที่ confidence_score สูงสุด (มาจาก query layer)
  openingHours: OpeningHours | null;
  defaultDurationMin: number;
}

export interface DayAssignment {
  tripDayId: number;
  // ✅ ใหม่ — ใช้ตัดสินว่าเป็น Day 1 หรือไม่ (เฉพาะ Day 1 ที่มี leg trip start -> สถานที่แรก)
  dayNumber: number;
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
  // ✅ v2: null = ไม่ทราบราคาแน่ชัด (เดิม number เสมอ) — UI ต้องเช็ค isCostUnknown ก่อนแสดงผล
  // ไม่ใช่แสดง null/0 ตรงๆ (เช่น `place.isCostUnknown ? "ไม่ทราบราคาแน่ชัด" : `${placeCost} บาท``)
  placeCost: number | null;
  // ✅ ใหม่ — badge ให้ frontend เตือนแยกจาก isBudgetConflict ("ไม่ทราบราคา" ≠ "เกินงบ")
  isCostUnknown: boolean;
  isTimeConflict: boolean;
  isClosedConflict: boolean;
  // ยังคำนวณจากยอดที่ "รู้จริง" เท่านั้น (ดู getPlaceCost) — ที่ไม่ทราบราคาไม่ถูกนับเข้ายอดสะสม
  isBudgetConflict: boolean;
  isHoursUnknown: boolean;
}

// ---------- Constants ----------

/** reserved id ของจุดเริ่มต้นทริปใน TravelMatrix — ต้องตรงกับ backend (utils/orsTravelMatrix.ts) */
export const TRIP_START_ID = "__trip_start__";

/**
 * ใช้เฉพาะตอนหา metric จาก matrix ไม่เจอ (ป้องกันไว้ เช่น draft เก่าที่ไม่มี matrix) — ปกติทุกคู่มีใน
 * matrix อยู่แล้ว (backend fallback รายคู่ให้เอง) ห้ามใช้ถ้า matrix มี duration จริง
 * ต้องตรงกับ backend เป๊ะ
 */
const FALLBACK_AVG_SPEED_KMH = 25;

/** ตรงกับ backend TravelMetric/TravelMatrix (JSON serialize ได้ ไม่ใช้ Map) */
export interface TravelMetric {
  distanceKm: number;
  durationMin: number;
  source: "ors" | "haversine";
}

/** matrix[fromId][toId] — from/to เป็น placeId หรือ TRIP_START_ID */
export type TravelMatrix = Record<string, Record<string, TravelMetric>>;

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

/**
 * ✅ v2 — เลิก coalesce กับ default_price_level แล้ว (ดู PRICE_SCORE_REDESIGN.md decision log)
 * ไม่เดาตัวเลขบาทเมื่อไม่มีข้อมูลจริง (สอดคล้องกับหลักการเดียวกับ backend
 * poiScoreCalculator.ts::calculatePriceScore — "การเดาแล้วลงโทษผิดๆ" ถูกปฏิเสธไปแล้วที่นั่น
 * ใช้หลักเดียวกันที่นี่ฝั่ง cost)
 *
 * free + missing -> ยังคืน 0 บาทตรงๆ (ไม่ถือว่า unknown) เพราะ free category (วัด/สวนสาธารณะ)
 * มั่นใจได้สูงอยู่แล้วว่าราคาจริงเข้าใกล้ 0 — ต่างจาก paid ที่ range กว้างเกินจะเดา
 * paid + missing -> null (ไม่ทราบราคาแน่ชัด) ไม่ใช่ 0 บาท
 */
function getPlaceCost(
  rawPriceLevel: number | null,
  priceNature: PriceNature
): number | null {
  if (rawPriceLevel !== null) {
    return PRICE_LEVEL_TO_BAHT[rawPriceLevel] ?? 0;
  }
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
 * Nearest-Neighbor Heuristic — **เลิกใช้ในหน้า itinerary editor แล้วถาวร** (ไม่ใช่แค่ปิดชั่วคราว)
 * หน้า editor ใช้ manual drag-and-drop ล้วนๆ เป็น final design ไม่มีแผนจะเพิ่มปุ่ม
 * "จัดลำดับอัตโนมัติ" ในหน้านั้นอีก
 *
 * เก็บฟังก์ชันนี้ไว้ (ไม่ลบ) เพราะอาจนำ logic ไปใช้กับฟีเจอร์ "จัดทริปอัตโนมัติ" ในอนาคต
 * (ปุ่มแยกต่างหากที่ TripRecommendations.tsx — ปัจจุบัน disabled, ยังไม่เริ่มพัฒนา) ซึ่งเป็นคนละ
 * scope กับหน้า editor นี้ — ให้ logic ตรงกับ backend เป๊ะถ้ายังเก็บไว้
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
  // ✅ ระยะทาง/เวลาเดินทางตามถนน (ORS + fallback รายคู่) โหลดไว้ล่วงหน้าแล้ว — ฟังก์ชันนี้ยังเป็น
  // pure function แค่ lookup ไม่เรียก network เอง (ลากสลับลำดับแล้ว recompute ได้ทันที)
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
      // เฉพาะ Day 1: trip start -> สถานที่แรก (Day 2+ ยังไม่มีนิยามจุดเริ่มต้นของวัน คง null เหมือนเดิม)
      const startMetric = travelMatrix[TRIP_START_ID]?.[place.placeId];
      if (startMetric) {
        distanceFromPrev = startMetric.distanceKm;
        travelTimeFromPrev = Math.max(1, startMetric.durationMin);
      }
    }

    let startMinutes: number | null;
    if (isFirstOfDay) {
      // Day 1 มี leg จากจุดเริ่มต้นทริป -> เริ่มเที่ยวหลังเดินทางถึง (Day 2+ travelTimeFromPrev = null -> เวลาเดิม)
      startMinutes =
        dayStartMinutes !== null ? dayStartMinutes + (travelTimeFromPrev ?? 0) : null;
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

    // ✅ v2: rawPriceLevel + priceNature แทน priceLevel เดี่ยวๆ — คืน null ได้เมื่อไม่ทราบราคาจริง
    const placeCost = getPlaceCost(place.rawPriceLevel, place.priceNature);
    const isCostUnknown = placeCost === null;
    // ✅ unknown ไม่กระทบยอดสะสม (ไม่เดาว่าฟรี ไม่เดาว่าแพง) — ต่างจากเดิมที่ coalesce เป็น 0 บาทเสมอ
    cumulativeCost += placeCost ?? 0;

    // ✅ เช็ค day.useBudget ตรงๆ ก่อนเสมอ — ไม่พึ่งแค่ dailyBudget !== null (เดิม) เพราะเปราะบาง
    // ถ้าในอนาคตมี daily_budget ค้างอยู่ทั้งที่ useBudget = false (เช่น bug จุดอื่นไม่เคลียร์ค่า)
    // จะทำให้ conflict โผล่มาทั้งที่ user เลือกไม่ใช้งบไว้ตั้งแต่แรก — cumulativeCost เองก็เปลี่ยน
    // ความหมายแล้ว (ไม่รวมของที่ไม่รู้ราคา) จึง isBudgetConflict ยังคำนวณแบบเดิมได้ตรงๆ
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
 * Build draft ครั้งแรกตอน user กด "จัดเส้นทาง" จากหน้า POI list
 *
 * ✅ final design (ดู comment หัวไฟล์, sync กับ backend): ไม่ auto-place สถานที่ที่เลือกมาไว้วัน
 * ไหนเลย (เดิม: ยัดวันแรกทั้งหมด + เรียงด้วย Nearest-Neighbor TSP heuristic — ตัดสินใจเลิกใช้แล้ว
 * ถาวร) — คืน items ว่างเปล่าเสมอ ทำให้ทุกที่ที่เลือกมาไปอยู่ใน "สถานที่ที่ยังไม่จัดลงวัน" ฝั่ง frontend
 * โดยอัตโนมัติ (ItineraryEditor.tsx คำนวณ unassigned pool จากสถานที่ที่ไม่ปรากฏใน items อยู่แล้ว)
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