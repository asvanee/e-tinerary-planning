import {
  nearestNeighborTsp,
  calculateDistanceKm,
  TspPlace,
} from "./tspRouteOptimizer";

/* =========================================================
 * Types
 * ========================================================= */

export interface AutoPlace {
  // รองรับทั้ง camelCase และ snake_case เพื่อไม่ให้ Type ตกหล่น
  place_id?: string;
  placeId?: string;

  place_name?: string;
  placeName?: string;

  categoryName?: string;
  category_name?: string;

  poiScore?: number;
  poi_score?: number;

  latitude: number;
  longitude: number;

  opening_hours?: any;
  openingHours?: any;

  /**
   * เวลาเฉลี่ยที่ใช้เที่ยวสถานที่
   * หน่วย: นาที
   */
  default_duration_min?: number | null;
  defaultDurationMin?: number | null;
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

export interface AutoTripStop {
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
}

export interface AutoTripDay {
  day: number;
  date: string;

  stops: AutoTripStop[];

  total_distance_km: number;
  total_travel_time_min: number;
  total_visit_time_min: number;
}

export interface AutoTripResult {
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

/* =========================================================
 * Category
 * ========================================================= */

function groupByCategory(places: AutoPlace[]): Map<string, AutoPlace[]> {
  const grouped = new Map<string, AutoPlace[]>();

  for (const place of places) {
    const catName = place.categoryName ?? place.category_name;
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
  return [...places].sort((a, b) => {
    const scoreA = a.poiScore ?? a.poi_score ?? 0;
    const scoreB = b.poiScore ?? b.poi_score ?? 0;
    return scoreB - scoreA;
  });
}

/* =========================================================
 * Opening Hours
 * ========================================================= */

function isPlaceOpen(
  place: AutoPlace,
  date: Date,
  visitStartMinute: number,
  durationMin: number
): boolean {
  const openingHours = place.opening_hours ?? place.openingHours;

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

function selectBestPlacePerCategory(
  places: AutoPlace[],
  date: Date,
  startMinute: number
): AutoPlace[] {
  const grouped = groupByCategory(places);
  const selected: AutoPlace[] = [];

  for (const [_category, categoryPlaces] of grouped.entries()) {
    const sorted = sortByPoiScore(categoryPlaces);

    for (const place of sorted) {
      const duration =
        place.default_duration_min ?? place.defaultDurationMin ?? 60;

      const isOpen = isPlaceOpen(place, date, startMinute, duration);

      if (isOpen) {
        selected.push(place);
        break;
      }
    }
  }

  return selected;
}

/* =========================================================
 * Convert to TSP Place
 * ========================================================= */

function convertToTspPlaces(places: AutoPlace[]): TspPlace[] {
  return places.map((place) => ({
    place_id: (place.place_id ?? place.placeId)!,
    place_name: (place.place_name ?? place.placeName)!,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
  }));
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

  let previousPoint: TspPlace = {
    place_id: "TRIP_START",
    place_name: "จุดเริ่มต้นทริป",
    latitude: Number(startLat),
    longitude: Number(startLng),
  };

  for (const place of route) {
    const pId = (place.place_id ?? place.placeId)!;
    const pName = (place.place_name ?? place.placeName)!;

    const to: TspPlace = {
      place_id: pId,
      place_name: pName,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    };

    const distanceKm = calculateDistanceKm(previousPoint, to);
    const travelTimeMin = calculateTravelTimeMin(distanceKm);
    const visitStart = addMinutes(currentTime, travelTimeMin);

    const durationMin =
      place.default_duration_min ?? place.defaultDurationMin ?? 60;

    const visitEnd = addMinutes(visitStart, durationMin);

    stops.push({
      place_id: pId,
      place_name: pName,
      categoryName: place.categoryName ?? place.category_name ?? "",
      poiScore: place.poiScore ?? place.poi_score ?? 0,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      start_time: visitStart,
      end_time: visitEnd,
      duration_min: durationMin,
      travel_distance_km: Number(distanceKm.toFixed(2)),
      travel_time_min: travelTimeMin,
    });

    currentTime = visitEnd;
    totalDistanceKm += distanceKm;
    totalTravelTimeMin += travelTimeMin;
    totalVisitTimeMin += durationMin;

    previousPoint = to;
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

  let currentDate = new Date(start);
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

    let previousPoint: TspPlace = {
      place_id: "TRIP_START",
      place_name: "จุดเริ่มต้นทริป",
      latitude: Number(startLat),
      longitude: Number(startLng),
    };

    while (routeIndex < route.length) {
      const place = route[routeIndex];
      const duration =
        place.default_duration_min ?? place.defaultDurationMin ?? 60;

      const currentPlace: TspPlace = {
        place_id: (place.place_id ?? place.placeId)!,
        place_name: (place.place_name ?? place.placeName)!,
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
      };

      const distanceKm = calculateDistanceKm(previousPoint, currentPlace);
      const travelTime = calculateTravelTimeMin(distanceKm);
      const requiredTime = travelTime + duration;

      if (currentTime + requiredTime > dayEnd) {
        break;
      }

      todayPlaces.push(place);
      currentTime += requiredTime;
      previousPoint = currentPlace;
      routeIndex++;
    }

    if (todayPlaces.length > 0) {
      const dayRoute = buildDayRoute(
        dayNumber,
        dateString,
        todayPlaces,
        startTime,
        startLat,
        startLng
      );

      days.push(dayRoute);
    }

    currentDate.setDate(currentDate.getDate() + 1);
    dayNumber++;
  }

  return days;
}

/* =========================================================
 * MAIN AUTO TRIP FUNCTION
 * ========================================================= */

export function buildAutoTrip(
  trip: TripInfo,
  places: AutoPlace[]
): AutoTripResult {
  if (!places.length) {
    throw new Error("ไม่พบสถานที่สำหรับจัดทริป");
  }

  const startDate = new Date(trip.start_date);
  const startMinute = timeToMinutes(trip.start_time);

  const selectedPlaces = selectBestPlacePerCategory(
    places,
    startDate,
    startMinute
  );

  if (selectedPlaces.length === 0) {
    throw new Error("ไม่พบสถานที่ที่สามารถจัดลงทริปได้");
  }

  const tspPlaces = convertToTspPlaces(selectedPlaces);

  const startPoint: TspPlace = {
    place_id: "TRIP_START",
    place_name: "จุดเริ่มต้นทริป",
    latitude: Number(trip.start_lat),
    longitude: Number(trip.start_lng),
  };

  const tspResult = nearestNeighborTsp(tspPlaces, startPoint);

  const placeMap = new Map<string, AutoPlace>();

  for (const place of selectedPlaces) {
    const key = place.place_id ?? place.placeId;
    if (key) {
      placeMap.set(key, place);
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

  const totalDistanceKm = days.reduce(
    (total, day) => total + day.total_distance_km,
    0
  );

  return {
    trip_id: trip.trip_id,
    selected_places: orderedPlaces,
    days,
    total_distance_km: Number(totalDistanceKm.toFixed(2)),
  };
}