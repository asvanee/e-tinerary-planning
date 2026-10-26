import type { OpeningHours } from "../../utils/openingHoursChecker";
import { checkOpeningStatus } from "../../utils/openingHoursChecker";
import { TRIP_START_ID, type TravelMatrix } from "../../utils/orsTravelMatrix";
import {
  calculateDistanceKm,
  nearestNeighborTsp,
  TspPlace,
} from "./tspRouteOptimizer";
import { getPlaceCost } from "./itineraryBuilder";
import type { PriceNature } from "../poi/poiPlaceQueries";

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
  requestedVisitDurationMin: number;
  priceRangeStart?: number | null;
  priceRangeEnd?: number | null;
  priceNature?: PriceNature;
  isRecommendation?: boolean;
}

interface ScheduledAutoPlace extends Omit<
  AutoPlace,
  | "requestedVisitDurationMin"
  | "priceRangeStart"
  | "priceRangeEnd"
  | "priceNature"
> {
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

  use_budget?: boolean;
  daily_budget?: number | null;
  trip_days?: AutoTripDaySchedule[];
}

export interface AutoTripDaySchedule {
  dayNumber: number;
  visitDate: string;
  startTime: string | null;
  endTime: string | null;
  dailyBudget: number | null;
  useBudget: boolean;
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
  is_recommendation: boolean;
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

  selected_places: ScheduledAutoPlace[];

  days: AutoTripDay[];

  total_distance_km: number;
}

/* =========================================================
 * Constants
 * ========================================================= */

const LAST_DAY_MINUTE = 24 * 60 - 1;
const DEFAULT_DAY_END = "18:00";
const DEFAULT_TRAVEL_SPEED_KMH = 30;
const TRIP_START_NAME = "จุดเริ่มต้นทริป";
const DAY_START_NAME = "เริ่มต้นวัน";

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

interface RouteLeg {
  distanceKm: number;
  travelTimeMin: number;
  previousPlaceName: string;
}

interface EvaluatedSchedule {
  days: AutoTripDay[];
  selectedPlaces: ScheduledAutoPlace[];
  totalTravelTimeMin: number;
}

function getTripDates(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const date = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  while (date <= end) {
    dates.push(new Date(date));
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return dates;
}

function getRouteLegs(
  route: AutoPlace[],
  startLat: number,
  startLng: number,
  travelMatrix: TravelMatrix | undefined,
  includeTripStartLeg: boolean
): RouteLeg[] {
  let previousPoint = tripStartPoint(startLat, startLng);
  let previousPlaceName = TRIP_START_NAME;

  return route.map((place, index) => {
    const point = toTspPlace(place);
    if (index === 0 && !includeTripStartLeg) {
      previousPoint = point;
      previousPlaceName = DAY_START_NAME;
      return {
        distanceKm: 0,
        travelTimeMin: 0,
        previousPlaceName,
      };
    }

    const prevId = previousPoint.place_id === "TRIP_START" ? TRIP_START_ID : previousPoint.place_id;
    const hit = travelMatrix?.[prevId]?.[place.place_id];

    const distanceKm = hit
      ? Number(hit.distanceKm.toFixed(2))
      : calculateDistanceKm(previousPoint, point);
    const travelTimeMin = hit ? hit.durationMin : calculateTravelTimeMin(distanceKm);

    const leg = {
      distanceKm,
      travelTimeMin,
      previousPlaceName,
    };

    previousPoint = point;
    previousPlaceName = place.place_name;
    return leg;
  });
}

function getNearestNeighborRoute(
  route: AutoPlace[],
  startLat: number,
  startLng: number
): AutoPlace[] {
  const byId = new Map(route.map((place) => [place.place_id, place]));
  const nearestRoute = nearestNeighborTsp(
    route.map(toTspPlace),
    tripStartPoint(startLat, startLng)
  );

  return nearestRoute.places.slice(1).flatMap((place) => {
    const match = byId.get(place.place_id);
    return match ? [match] : [];
  });
}

function getFeasibleVisitDuration(
  place: AutoPlace,
  dayOfWeek: number,
  arrivalTime: number,
  requestedDuration: number,
  dayEnd: number
): number {
  const maxDuration = Math.min(requestedDuration, dayEnd - arrivalTime);
  if (maxDuration < 1) return 0;

  const initialStatus = checkOpeningStatus(
    place.opening_hours,
    dayOfWeek,
    arrivalTime,
    0
  );
  if (!initialStatus.hasData) return maxDuration;

  let minDuration = 1;
  let maxFeasibleDuration = 0;
  let upperBound = maxDuration;

  while (minDuration <= upperBound) {
    const duration = Math.floor((minDuration + upperBound) / 2);
    const status = checkOpeningStatus(
      place.opening_hours,
      dayOfWeek,
      arrivalTime,
      duration
    );

    if (status.isOpen) {
      maxFeasibleDuration = duration;
      minDuration = duration + 1;
    } else {
      upperBound = duration - 1;
    }
  }

  return maxFeasibleDuration;
}

function evaluateSchedule(
  trip: TripInfo,
  routes: AutoPlace[][],
  dates: Date[],
  travelMatrix?: TravelMatrix
): EvaluatedSchedule | null {
  const selectionRouteLegs = routes.map((route) =>
    getRouteLegs(
      route,
      trip.start_lat,
      trip.start_lng,
      travelMatrix,
      true
    )
  );
  const routeLegs = selectionRouteLegs.map((legs, dayIndex) =>
    dayIndex === 0
      ? legs
      : legs.map((leg, index) =>
          index === 0
            ? {
                ...leg,
                distanceKm: 0,
                travelTimeMin: 0,
                previousPlaceName: DAY_START_NAME,
              }
            : leg
        )
  );

  const days: AutoTripDay[] = [];
  const selectedPlaces: ScheduledAutoPlace[] = [];
  const totalTravelTimeMin = selectionRouteLegs
    .flat()
    .reduce((total, leg) => total + leg.travelTimeMin, 0);

  if (!routes.some((route) => route.length > 0)) {
    return { days: [], selectedPlaces, totalTravelTimeMin };
  }

  for (let dayIndex = 0; dayIndex < routes.length; dayIndex++) {
    const route = routes[dayIndex];
    const date = dates[dayIndex];
    const dateString = date.toISOString().slice(0, 10);
    const tripDay = trip.trip_days?.[dayIndex];
    const dayStartTime = tripDay?.startTime ?? trip.start_time;
    const dayEnd = tripDay
      ? tripDay.endTime
        ? timeToMinutes(tripDay.endTime)
        : LAST_DAY_MINUTE
      : trip.available_time_per_day != null
        ? timeToMinutes(trip.start_time) + trip.available_time_per_day * 60
        : timeToMinutes(DEFAULT_DAY_END);
    let currentTime = timeToMinutes(dayStartTime);
    let totalDistanceKm = 0;
    let totalVisitTimeMin = 0;
    let dailyCost = 0;
    const useBudget = tripDay?.useBudget ?? trip.use_budget === true;
    const dailyBudget = tripDay ? tripDay.dailyBudget : trip.daily_budget;
    const stops: AutoTripStop[] = [];

    for (let stopIndex = 0; stopIndex < route.length; stopIndex++) {
      const place = route[stopIndex];
      const leg = routeLegs[dayIndex][stopIndex];

      const arrivalTime = currentTime + leg.travelTimeMin;
      const durationMin = getFeasibleVisitDuration(
        place,
        date.getUTCDay(),
        arrivalTime,
        place.requestedVisitDurationMin,
        dayEnd
      );
      if (durationMin < 1) return null;

      const placeCost = getPlaceCost(
        place.priceRangeStart ?? null,
        place.priceRangeEnd ?? null,
        place.priceNature ?? "paid"
      );
      if (placeCost !== null) dailyCost += placeCost;
      if (
        useBudget &&
        dailyBudget !== null &&
        dailyBudget !== undefined &&
        dailyCost > dailyBudget
      ) {
        return null;
      }

      const departureTime = arrivalTime + durationMin;

      const scheduledPlace: ScheduledAutoPlace = {
        place_id: place.place_id,
        place_name: place.place_name,
        categoryId: place.categoryId,
        categoryName: place.categoryName,
        poiScore: place.poiScore,
        latitude: place.latitude,
        longitude: place.longitude,
        opening_hours: place.opening_hours,
        visitDurationMin: durationMin,
        isRecommendation: place.isRecommendation ?? false,
      };
      selectedPlaces.push(scheduledPlace);
      stops.push({
        place_id: place.place_id,
        place_name: place.place_name,
        categoryName: place.categoryName,
        poiScore: place.poiScore,
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
        start_time: minutesToTime(arrivalTime),
        end_time: minutesToTime(departureTime),
        duration_min: durationMin,
        travel_distance_km: Number(leg.distanceKm.toFixed(2)),
        travel_time_min: leg.travelTimeMin,
        previous_place_name: leg.previousPlaceName,
        is_recommendation: place.isRecommendation ?? false,
      });

      currentTime = departureTime;
      totalDistanceKm += leg.distanceKm;
      totalVisitTimeMin += durationMin;
    }

    days.push({
      day: tripDay?.dayNumber ?? dayIndex + 1,
      date: dateString,
      stops,
      total_distance_km: Number(totalDistanceKm.toFixed(2)),
      total_travel_time_min: stops.reduce(
        (total, stop) => total + stop.travel_time_min,
        0
      ),
      total_visit_time_min: totalVisitTimeMin,
    });
  }

  return { days, selectedPlaces, totalTravelTimeMin };
}

interface PlaceInsertion {
  routes: AutoPlace[][];
  schedule: EvaluatedSchedule;
}

function findBestPlaceInsertion(
  trip: TripInfo,
  routes: AutoPlace[][],
  dates: Date[],
  dayIndex: number,
  place: AutoPlace,
  travelMatrix?: TravelMatrix
): PlaceInsertion | null {
  let bestInsertion: PlaceInsertion | null = null;

  const nearestRoutes = routes.map((route) => [...route]);
  nearestRoutes[dayIndex] = getNearestNeighborRoute(
    [...routes[dayIndex], place],
    trip.start_lat,
    trip.start_lng
  );
  const nearestSchedule = evaluateSchedule(trip, nearestRoutes, dates, travelMatrix);

  if (nearestSchedule) {
    bestInsertion = { routes: nearestRoutes, schedule: nearestSchedule };
  }

  for (
    let insertionIndex = routes[dayIndex].length;
    insertionIndex >= 0;
    insertionIndex--
  ) {
    const trialRoutes = routes.map((route) => [...route]);
    trialRoutes[dayIndex].splice(insertionIndex, 0, place);
    const trialSchedule = evaluateSchedule(trip, trialRoutes, dates, travelMatrix);

    if (
      trialSchedule &&
      (!bestInsertion ||
        trialSchedule.totalTravelTimeMin <
          bestInsertion.schedule.totalTravelTimeMin)
    ) {
      bestInsertion = { routes: trialRoutes, schedule: trialSchedule };
    }
  }

  return bestInsertion;
}

function schedulePlaces(
  trip: TripInfo,
  places: AutoPlace[],
  recommendationPlaces: AutoPlace[],
  travelMatrix?: TravelMatrix
): EvaluatedSchedule {
  const dates = trip.trip_days
    ? trip.trip_days.map((day) => new Date(`${day.visitDate}T00:00:00Z`))
    : getTripDates(trip.start_date, trip.end_date);
  const routes = dates.map((): AutoPlace[] => []);
  const candidates = [...places].sort((a, b) => b.poiScore - a.poiScore);
  const selectedPlaceIds = new Set<string>();
  let currentSchedule = evaluateSchedule(trip, routes, dates, travelMatrix);

  while (currentSchedule) {
    let nextCandidate: AutoPlace | null = null;
    let nextRoutes: AutoPlace[][] | null = null;
    let nextSchedule: EvaluatedSchedule | null = null;

    for (const place of candidates) {
      if (selectedPlaceIds.has(place.place_id)) continue;

      let placeRoutes: AutoPlace[][] | null = null;
      let placeSchedule: EvaluatedSchedule | null = null;

      for (let dayIndex = 0; dayIndex < routes.length; dayIndex++) {
        const insertion = findBestPlaceInsertion(
          trip,
          routes,
          dates,
          dayIndex,
          place,
          travelMatrix
        );

        if (
          insertion &&
          (!placeSchedule ||
            insertion.schedule.totalTravelTimeMin <
              placeSchedule.totalTravelTimeMin)
        ) {
          placeRoutes = insertion.routes;
          placeSchedule = insertion.schedule;
        }
      }

      if (placeRoutes && placeSchedule) {
        nextCandidate = place;
        nextRoutes = placeRoutes;
        nextSchedule = placeSchedule;
        break;
      }
    }

    if (!nextCandidate || !nextRoutes || !nextSchedule) break;

    selectedPlaceIds.add(nextCandidate.place_id);
    routes.splice(0, routes.length, ...nextRoutes);
    currentSchedule = nextSchedule;
  }

  if (!currentSchedule) {
    throw new Error("ไม่สามารถคำนวณตาราง Auto Trip ได้");
  }

  const sortedRecommendations = [...recommendationPlaces].sort(
    (a, b) => b.poiScore - a.poiScore
  );

  for (let dayIndex = 0; dayIndex < routes.length; dayIndex++) {
    for (const place of sortedRecommendations) {
      if (selectedPlaceIds.has(place.place_id)) continue;

      const recommendationRoutes = routes.map((route) => [...route]);
      recommendationRoutes[dayIndex].push({
        ...place,
        isRecommendation: true,
      });
      const recommendationSchedule = evaluateSchedule(
        trip,
        recommendationRoutes,
        dates,
        travelMatrix
      );
      if (!recommendationSchedule) continue;

      const existingDurations = new Map(
        currentSchedule.selectedPlaces.map((selectedPlace) => [
          selectedPlace.place_id,
          selectedPlace.visitDurationMin,
        ])
      );
      const preservesExistingDurations =
        recommendationSchedule.selectedPlaces.every(
          (selectedPlace) =>
            !existingDurations.has(selectedPlace.place_id) ||
            existingDurations.get(selectedPlace.place_id) ===
              selectedPlace.visitDurationMin
        );
      const insertedRecommendation = recommendationSchedule.selectedPlaces.find(
        (selectedPlace) => selectedPlace.place_id === place.place_id
      );
      if (
        !preservesExistingDurations ||
        insertedRecommendation?.visitDurationMin !== place.requestedVisitDurationMin
      ) {
        continue;
      }

      selectedPlaceIds.add(place.place_id);
      routes.splice(0, routes.length, ...recommendationRoutes);
      currentSchedule = recommendationSchedule;
      break;
    }
  }

  return currentSchedule;
}

/* =========================================================
 * MAIN AUTO TRIP FUNCTION
 * ========================================================= */

export function buildAutoTrip(
  trip: TripInfo,
  places: AutoPlace[],
  travelMatrix?: TravelMatrix,
  recommendationPlaces: AutoPlace[] = []
): AutoTripResult {
  if (!places.length && !recommendationPlaces.length) {
    throw new Error("ไม่พบสถานที่สำหรับจัดทริป");
  }

  const result = schedulePlaces(
    trip,
    places,
    recommendationPlaces,
    travelMatrix
  );
  const { days, selectedPlaces } = result;

  const totalDistanceKm = days.reduce((total, day) => total + day.total_distance_km, 0);

  return {
    trip_id: trip.trip_id,
    selected_places: selectedPlaces,
    days,
    total_distance_km: Number(totalDistanceKm.toFixed(2)),
  };
}
