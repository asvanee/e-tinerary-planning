import type { OpeningHours } from "../../utils/openingHoursChecker";
import { checkOpeningStatus } from "../../utils/openingHoursChecker";
import {
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
  categoryId: string;
  categoryName: string;
  poiScore: number;
  latitude: number;
  longitude: number;
  opening_hours: OpeningHours | null;
  visitDurationMin: number;
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
    const categoryId = place.categoryId;
    if (!categoryId) {
      continue;
    }

    const current = grouped.get(categoryId) ?? [];
    current.push(place);
    grouped.set(categoryId, current);
  }

  return grouped;
}

function getOpeningHoursEligiblePlace(
  categoryPlaces: AutoPlace[],
  date: Date,
  currentTime: number,
  previousPoint: TspPlace,
  dayEnd: number
): { place: AutoPlace; distanceKm: number; travelTimeMin: number } | null {
  for (const place of [...categoryPlaces].sort((a, b) => b.poiScore - a.poiScore)) {
    const currentPlace = toTspPlace(place);
    const distanceKm = calculateDistanceKm(previousPoint, currentPlace);
    const travelTimeMin = calculateTravelTimeMin(distanceKm);
    const arrivalTime = currentTime + travelTimeMin;

    if (arrivalTime + place.visitDurationMin > dayEnd) continue;

    const status = checkOpeningStatus(
      place.opening_hours,
      date.getUTCDay(),
      arrivalTime,
      place.visitDurationMin
    );

    if (!status.hasData || status.isOpen) {
      return { place, distanceKm, travelTimeMin };
    }
  }

  return null;
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

    const durationMin = place.visitDurationMin;
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

// เลือกสถานที่ที่เปิด ณ เวลาไปถึงจริง แล้วคง category ไว้ใช้ได้เพียงครั้งเดียวต่อทริป
function schedulePlacesIntoDays(
  places: AutoPlace[],
  startDate: string,
  endDate: string,
  startTime: string,
  startLat: number,
  startLng: number,
  availableTimePerDay?: number | null
): { days: AutoTripDay[]; selectedPlaces: AutoPlace[] } {
  const days: AutoTripDay[] = [];
  const selectedPlaces: AutoPlace[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const currentDate = new Date(start);
  const categories = groupByCategory(places);
  let dayNumber = 1;

  while (currentDate <= end && categories.size > 0) {
    const dateString = currentDate.toISOString().slice(0, 10);
    const todayPlaces: AutoPlace[] = [];
    let currentTime = timeToMinutes(startTime);
    const dayEnd =
      availableTimePerDay != null
        ? timeToMinutes(startTime) + availableTimePerDay * 60
        : timeToMinutes(DEFAULT_DAY_END);
    let previousPoint = tripStartPoint(startLat, startLng);

    while (categories.size > 0) {
      let next:
        | {
            categoryId: string;
            place: AutoPlace;
            distanceKm: number;
            travelTimeMin: number;
          }
        | null = null;

      for (const [categoryId, categoryPlaces] of categories) {
        const eligible = getOpeningHoursEligiblePlace(
          categoryPlaces,
          currentDate,
          currentTime,
          previousPoint,
          dayEnd
        );
        if (!eligible) continue;

        if (!next || eligible.distanceKm < next.distanceKm) {
          next = {
            categoryId,
            place: eligible.place,
            distanceKm: eligible.distanceKm,
            travelTimeMin: eligible.travelTimeMin,
          };
        }
      }

      if (!next) break;

      todayPlaces.push(next.place);
      selectedPlaces.push(next.place);
      currentTime += next.travelTimeMin + next.place.visitDurationMin;
      previousPoint = toTspPlace(next.place);
      categories.delete(next.categoryId);
    }

    if (todayPlaces.length > 0) {
      days.push(
        buildDayRoute(
          dayNumber,
          dateString,
          todayPlaces,
          startTime,
          startLat,
          startLng
        )
      );
    }

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    dayNumber++;
  }

  return { days, selectedPlaces };
}

/* =========================================================
 * MAIN AUTO TRIP FUNCTION
 * ========================================================= */

export function buildAutoTrip(trip: TripInfo, places: AutoPlace[]): AutoTripResult {
  if (!places.length) {
    throw new Error("ไม่พบสถานที่สำหรับจัดทริป");
  }

  const { days, selectedPlaces } = schedulePlacesIntoDays(
    places,
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
    selected_places: selectedPlaces,
    days,
    total_distance_km: Number(totalDistanceKm.toFixed(2)),
  };
}
