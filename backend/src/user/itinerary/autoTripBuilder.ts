import type { OpeningHours } from "../../utils/openingHoursChecker";
import { checkOpeningStatus } from "../../utils/openingHoursChecker";
import { TRIP_START_ID, type TravelMatrix } from "../../utils/orsTravelMatrix";
import { minutesToTimeString, timeStringToMinutes } from "../../utils/timeString";
import { nearestNeighborTsp, TspPlace } from "./tspRouteOptimizer";
import { getPlaceCost, resolveTravelMetric } from "./itineraryBuilder";
import { enumerateDates } from "../trip/tripDateRange";
import type { PriceNature } from "../poi/poiPlaceQueries";

// จัดแผนอัตโนมัติ: เลือกสถานที่ทีละที่ตามคะแนน POI แล้วแทรกลงวัน/ตำแหน่งที่เวลาเดินทางรวมน้อยที่สุด
// โดยต้องเปิดตอนไปถึง ไม่เกินเวลาจบวัน และไม่เกินงบต่อวัน · จากนั้นเติมสถานที่แนะนำเพิ่มถ้ายังมีเวลา

// ชื่อ field เป็นรูปแบบเดียวกับ selected_places ที่ส่งกลับหน้าเว็บ
export interface AutoPlace {
  place_id: string;
  place_name: string;
  categoryId: string;
  categoryName: string;
  poiScore: number;
  latitude: number;
  longitude: number;
  opening_hours: OpeningHours | null;
  priceRangeStart?: number | null;
  priceRangeEnd?: number | null;
  priceNature?: PriceNature;
  isRecommendation?: boolean;
}

interface ScheduledAutoPlace extends Omit<
  AutoPlace,
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
  start_lat: number;
  start_lng: number;
  available_time_per_day?: number | null; // ชั่วโมงที่เที่ยวได้ต่อวัน
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
// ค่าที่กำหนด
// [ค่า] หน้าจัดแผนอัตโนมัติ · LAST_DAY_MINUTE — เวลาสิ้นสุดวัน (นาที) เมื่อแผนไม่ระบุเวลาจบ
const LAST_DAY_MINUTE = 24 * 60 - 1; // วันที่ไม่ระบุเวลาจบ ใช้ 23:59
// [ค่า] หน้าจัดแผนอัตโนมัติ · DEFAULT_DAY_END — เวลาจบวัน (HH:MM) เมื่อไม่มีเวลาว่างต่อวัน
const DEFAULT_DAY_END = "18:00"; // แผนการท่องเที่ยวที่ไม่มีเวลาว่างต่อวัน ใช้ 18:00 เป็นเวลาจบ
// [ค่า] หน้าจัดแผนอัตโนมัติ · AUTO_TRIP_VISIT_DURATION_MIN = 60 — เวลาเที่ยวต่อสถานที่ของจัดแผนอัตโนมัติ (นาที)
const AUTO_TRIP_VISIT_DURATION_MIN = 60; // เวลาเที่ยวต่อสถานที่ (1 ชั่วโมง)
const TRIP_START_NAME = "จุดเริ่มต้นการเดินทาง";
const DAY_START_NAME = "เริ่มต้นวัน";

// สร้างจุดเริ่มต้นทริปในรูปสถานที่ (รับพิกัดเริ่มต้น)
function tripStartPoint(startLat: number, startLng: number): TspPlace {
  return {
    place_id: "TRIP_START",
    place_name: TRIP_START_NAME,
    latitude: Number(startLat),
    longitude: Number(startLng),
  };
}

// ตัดสถานที่ให้เหลือเฉพาะ field ที่ใช้เรียงเส้นทาง
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

// ช่วงเดินทางของแต่ละที่ในเส้นทาง เริ่มจากจุดเริ่มต้นทริป รับเส้นทาง พิกัดเริ่มต้น และ matrix
// ระยะ/เวลาใช้ตัวเดียวกับแผนที่จัดเอง (resolveTravelMetric) จึงตรงกับตอนยืนยันแผน
function getRouteLegs(
  route: AutoPlace[],
  startLat: number,
  startLng: number,
  travelMatrix: TravelMatrix | undefined
): RouteLeg[] {
  let previous = { id: TRIP_START_ID, lat: startLat, lng: startLng, name: TRIP_START_NAME };

  return route.map((place) => {
    const metric = resolveTravelMetric(
      travelMatrix ?? {},
      previous.id,
      place.place_id,
      previous.lat,
      previous.lng,
      place.latitude,
      place.longitude
    );
    const leg = {
      distanceKm: metric.distanceKm,
      travelTimeMin: metric.durationMin,
      previousPlaceName: previous.name,
    };
    previous = { id: place.place_id, lat: place.latitude, lng: place.longitude, name: place.place_name };
    return leg;
  });
}

// เรียงสถานที่ของวันใหม่แบบ nearest neighbor จากจุดเริ่มต้นทริป
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

// เวลาเที่ยวที่จัดได้ของสถานที่ (นาที) รับสถานที่ วันในสัปดาห์ เวลาถึง และเวลาจบวัน
// ได้ 1 ชั่วโมงเมื่อเหลือเวลาพอและเปิดตลอดช่วงนั้น ไม่งั้นได้ 0
function getFeasibleVisitDuration(
  place: AutoPlace,
  dayOfWeek: number,
  arrivalTime: number,
  dayEnd: number
): number {
  if (dayEnd - arrivalTime < AUTO_TRIP_VISIT_DURATION_MIN) return 0;

  const status = checkOpeningStatus(
    place.opening_hours,
    dayOfWeek,
    arrivalTime,
    AUTO_TRIP_VISIT_DURATION_MIN
  );
  return !status.hasData || status.isOpen
    ? AUTO_TRIP_VISIT_DURATION_MIN
    : 0;
}

// คิดตารางเวลาของทุกวันจากเส้นทาง รับข้อมูลทริป เส้นทางรายวัน วันที่ และ matrix · ที่ไหนอยู่ไม่ได้หรือเกินงบคืน null
// วันที่ 2 ขึ้นไปที่แรกไม่นับเวลาเดินทาง แต่ยังนับในเวลาเดินทางรวมที่ใช้เลือกเส้นทาง
function evaluateSchedule(
  trip: TripInfo,
  routes: AutoPlace[][],
  dates: Date[],
  travelMatrix?: TravelMatrix
): EvaluatedSchedule | null {
  const selectionRouteLegs = routes.map((route) =>
    getRouteLegs(route, trip.start_lat, trip.start_lng, travelMatrix)
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
        ? timeStringToMinutes(tripDay.endTime)
        : LAST_DAY_MINUTE
      : trip.available_time_per_day != null
        ? timeStringToMinutes(trip.start_time) + trip.available_time_per_day * 60
        : timeStringToMinutes(DEFAULT_DAY_END);
    let currentTime = timeStringToMinutes(dayStartTime);
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
        start_time: minutesToTimeString(arrivalTime).slice(0, 5),
        end_time: minutesToTimeString(departureTime).slice(0, 5),
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

// ลองแทรกสถานที่ลงวันนั้นทุกตำแหน่ง (รวมเรียงใหม่แบบ nearest neighbor) เลือกที่เวลาเดินทางรวมน้อยสุด
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

// เลือกสถานที่ตามคะแนนสูงสุดก่อน ทีละที่จนใส่เพิ่มไม่ได้ แล้วเติมสถานที่แนะนำวันละ 1 ที่
// (สถานที่แนะนำต้องได้เวลาเที่ยวเต็มและไม่ทำให้เวลาของที่เดิมลดลง)
function schedulePlaces(
  trip: TripInfo,
  places: AutoPlace[],
  recommendationPlaces: AutoPlace[],
  travelMatrix?: TravelMatrix
): EvaluatedSchedule {
  const visitDates = trip.trip_days
    ? trip.trip_days.map((day) => day.visitDate)
    : enumerateDates(trip.start_date, trip.end_date);
  const dates = visitDates.map((visitDate) => new Date(`${visitDate}T00:00:00Z`));
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
        insertedRecommendation?.visitDurationMin !== AUTO_TRIP_VISIT_DURATION_MIN
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

// จัดทริปอัตโนมัติ รับข้อมูลทริป สถานที่จากหมวดที่เลือก matrix เวลาเดินทาง และสถานที่แนะนำเพิ่มเติม
// คืนสถานที่ที่จัดได้ ตารางรายวัน และระยะทางรวม
export function buildAutoTrip(
  trip: TripInfo,
  places: AutoPlace[],
  travelMatrix?: TravelMatrix,
  recommendationPlaces: AutoPlace[] = []
): AutoTripResult {
  if (!places.length && !recommendationPlaces.length) {
    throw new Error("ไม่พบสถานที่สำหรับจัดแผน");
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
