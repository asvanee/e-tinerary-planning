import type { OpeningHours } from "../../utils/openingHoursChecker";
import {
  nearestNeighborTsp,
  calculateDistanceKm,
  TspPlace,
} from "./tspRouteOptimizer";

/* =========================================================
 * Types
 * ========================================================= */

// ชื่อ field เป็นรูปแบบเดียวกับ selected_places ที่ส่งกลับ frontend
export interface AutoPlace {
  place_id: string;
  place_name: string;
  categoryName: string;
  poiScore: number;
  latitude: number;
  longitude: number;
  opening_hours: OpeningHours | null;
  default_duration_min: number; // เวลาเฉลี่ยที่ใช้เที่ยว (นาที)
}

export interface TripInfo {
  trip_id: string;

  start_date: string;
  end_date: string;

  start_time: string;

  number_of_people?: number;

  // จุดเริ่มต้นจาก LocationPinPicker
  start_lat: number;
  start_lng: number;

  // จำนวนชั่วโมงที่เที่ยวได้ต่อวัน
  available_time_per_day?: number | null;
}

interface AutoTripStop {
  place_id: string;
  place_name: string;

  categoryName: string;

  poiScore: number;

  latitude: number;
  longitude: number;

  start_time: string;
  end_time: string;

  duration_min: number;

  travel_distance_km: number;
  travel_time_min: number;

  previous_place_name: string;
}

interface AutoTripDay {
  day: number;
  date: string;

  stops: AutoTripStop[];

  total_distance_km: number;
  total_travel_time_min: number;
  total_visit_time_min: number;
}

interface AutoTripResult {
  trip_id: string;

  selected_places: AutoPlace[];

  days: AutoTripDay[];

  total_distance_km: number;
}

/* =========================================================
 * Constants
 * ========================================================= */

const DEFAULT_DAY_END = "18:00";
const DEFAULT_TRAVEL_SPEED_KMH = 30;
const TRIP_START_NAME = "จุดเริ่มต้นทริป";

/* =========================================================
 * Time Utilities
 * ========================================================= */

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(minutes: number): string {
  const normalized = Math.max(0, minutes);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/* =========================================================
 * Distance / Travel Time
 * ========================================================= */

function calculateTravelTimeMin(distanceKm: number): number {
  return Math.ceil((distanceKm / DEFAULT_TRAVEL_SPEED_KMH) * 60);
}

function tripStartPoint(startLat: number, startLng: number): TspPlace {
  return {
    place_id: "TRIP_START",
    place_name: TRIP_START_NAME,
    latitude: Number(startLat),
    longitude: Number(startLng),
  };
}

function toTspPlace(place: AutoPlace): TspPlace {
  return {
    place_id: place.place_id,
    place_name: place.place_name,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  };
}

/* =========================================================
 * Category
 * ========================================================= */

function groupByCategory(places: AutoPlace[]): Map<string, AutoPlace[]> {
  const grouped = new Map<string, AutoPlace[]>();

  for (const place of places) {
    const catName = place.categoryName;
    if (!catName) {
      continue;
    }

    const current = grouped.get(catName) ?? [];
    current.push(place);
    grouped.set(catName, current);
  }

  return grouped;
}

function sortByPoiScore(places: AutoPlace[]): AutoPlace[] {
  return [...places].sort((a, b) => b.poiScore - a.poiScore);
}

/* =========================================================
 * Opening Hours
 * ========================================================= */

// ⚠️ เช็คแค่คำว่า "closed" ใน weekday_text ของวันนั้น (ข้อมูลจริงเป็นภาษาไทย จึงแทบไม่เคยตรง)
function isPlaceOpen(place: AutoPlace, date: Date): boolean {
  const openingHours = place.opening_hours;

  if (!openingHours) {
    return true;
  }

  if (openingHours.weekday_text && Array.isArray(openingHours.weekday_text)) {
    const weekday = date.getDay();
    const googleIndex = weekday === 0 ? 6 : weekday - 1;
    const text = openingHours.weekday_text[googleIndex];

    if (!text) {
      return true;
    }

    if (text.toLowerCase().includes("closed")) {
      return false;
    }
  }

  return true;
}

/* =========================================================
 * Select Best Place Per Category
 * ========================================================= */

function selectBestPlacePerCategory(places: AutoPlace[], date: Date): AutoPlace[] {
  const selected: AutoPlace[] = [];

  for (const categoryPlaces of groupByCategory(places).values()) {
    const best = sortByPoiScore(categoryPlaces).find((place) => isPlaceOpen(place, date));
    if (best) selected.push(best);
  }

  return selected;
}

/* =========================================================
 * Build One Day
 * ========================================================= */

function buildDayRoute(
  dayNumber: number,
  date: string,
  route: AutoPlace[],
  startTime: string,
  startLat: number,
  startLng: number
): AutoTripDay {
  let currentTime = startTime;
  const stops: AutoTripStop[] = [];

  let totalDistanceKm = 0;
  let totalTravelTimeMin = 0;
  let totalVisitTimeMin = 0;

  let previousPoint = tripStartPoint(startLat, startLng);
  let previousPlaceName = TRIP_START_NAME;

  for (const place of route) {
    const to = toTspPlace(place);

    const distanceKm = calculateDistanceKm(previousPoint, to);
    const travelTimeMin = calculateTravelTimeMin(distanceKm);
    const visitStart = addMinutes(currentTime, travelTimeMin);

    const durationMin = place.default_duration_min;
    const visitEnd = addMinutes(visitStart, durationMin);

    stops.push({
      place_id: place.place_id,
      place_name: place.place_name,
      categoryName: place.categoryName,
      poiScore: place.poiScore,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      start_time: visitStart,
      end_time: visitEnd,
      duration_min: durationMin,
      travel_distance_km: Number(distanceKm.toFixed(2)),
      travel_time_min: travelTimeMin,
      previous_place_name: previousPlaceName,
    });

    currentTime = visitEnd;
    totalDistanceKm += distanceKm;
    totalTravelTimeMin += travelTimeMin;
    totalVisitTimeMin += durationMin;

    previousPoint = to;
    previousPlaceName = place.place_name;
  }

  return {
    day: dayNumber,
    date,
    stops,
    total_distance_km: Number(totalDistanceKm.toFixed(2)),
    total_travel_time_min: totalTravelTimeMin,
    total_visit_time_min: totalVisitTimeMin,
  };
}

/* =========================================================
 * Split Route Into Days
 * ========================================================= */

// วันไหนใส่สถานที่ไม่ได้เลยจะไม่อยู่ในผลลัพธ์ (แต่ยังนับเลขวันต่อ)
function splitRouteIntoDays(
  route: AutoPlace[],
  startDate: string,
  endDate: string,
  startTime: string,
  startLat: number,
  startLng: number,
  availableTimePerDay?: number | null
): AutoTripDay[] {
  const days: AutoTripDay[] = [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  const currentDate = new Date(start);
  let dayNumber = 1;
  let routeIndex = 0;

  while (currentDate <= end && routeIndex < route.length) {
    const dateString = currentDate.toISOString().split("T")[0];
    const todayPlaces: AutoPlace[] = [];

    let currentTime = timeToMinutes(startTime);

    const dayEnd =
      availableTimePerDay != null
        ? timeToMinutes(startTime) + availableTimePerDay * 60
        : timeToMinutes(DEFAULT_DAY_END);

    let previousPoint = tripStartPoint(startLat, startLng);

    while (routeIndex < route.length) {
      const place = route[routeIndex];
      const currentPlace = toTspPlace(place);

      const distanceKm = calculateDistanceKm(previousPoint, currentPlace);
      const travelTime = calculateTravelTimeMin(distanceKm);
      const requiredTime = travelTime + place.default_duration_min;

      if (currentTime + requiredTime > dayEnd) {
        break;
      }

      todayPlaces.push(place);
      currentTime += requiredTime;
      previousPoint = currentPlace;
      routeIndex++;
    }

    if (todayPlaces.length > 0) {
      days.push(
        buildDayRoute(dayNumber, dateString, todayPlaces, startTime, startLat, startLng)
      );
    }

    currentDate.setDate(currentDate.getDate() + 1);
    dayNumber++;
  }

  return days;
}

/* =========================================================
 * MAIN AUTO TRIP FUNCTION
 * ========================================================= */

export function buildAutoTrip(trip: TripInfo, places: AutoPlace[]): AutoTripResult {
  if (!places.length) {
    throw new Error("ไม่พบสถานที่สำหรับจัดทริป");
  }

  const selectedPlaces = selectBestPlacePerCategory(places, new Date(trip.start_date));

  if (selectedPlaces.length === 0) {
    throw new Error("ไม่พบสถานที่ที่สามารถจัดลงทริปได้");
  }

  const tspResult = nearestNeighborTsp(
    selectedPlaces.map(toTspPlace),
    tripStartPoint(trip.start_lat, trip.start_lng)
  );

  const placeMap = new Map<string, AutoPlace>();

  for (const place of selectedPlaces) {
    if (place.place_id) {
      placeMap.set(place.place_id, place);
    }
  }

  const orderedPlaces = tspResult.places
    .map((place) => placeMap.get(place.place_id))
    .filter((place): place is AutoPlace => Boolean(place));

  const days = splitRouteIntoDays(
    orderedPlaces,
    trip.start_date,
    trip.end_date,
    trip.start_time,
    trip.start_lat,
    trip.start_lng,
    trip.available_time_per_day
  );

  const totalDistanceKm = days.reduce((total, day) => total + day.total_distance_km, 0);

  return {
    trip_id: trip.trip_id,
    selected_places: orderedPlaces,
    days,
    total_distance_km: Number(totalDistanceKm.toFixed(2)),
  };
}
