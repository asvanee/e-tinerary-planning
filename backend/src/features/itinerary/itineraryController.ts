import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";

import {
  getTripOwnerAndStart,
  getOrCreateTripDays,
  getSelectedPlaces,
  getAutoTripPlaces,
  getAutoTripCategories,
  AutoTripPlace,
  TripDay,
  TripOwnerAndStart,
} from "./itineraryPlaceQueries";

import {
  buildInitialDraft,
  buildItinerary,
  DayAssignment,
  PlaceInput,
} from "./itineraryBuilder";

import { parseVisitDurations } from "./visitDurations";
import { parseAutoTripDurations } from "./autoTripDurations";

import {
  buildAutoTrip,
  AutoPlace,
  TripInfo,
} from "./autoTripBuilder";

import { buildTravelMatrix, TRIP_START_ID } from "../../utils/orsTravelMatrix";
import type { TravelPoint } from "../../utils/orsTravelMatrix";

function toTravelPoint(place: {
  placeId: string;
  latitude: number;
  longitude: number;
}): TravelPoint {
  return { id: place.placeId, latitude: place.latitude, longitude: place.longitude };
}

function toDayAssignment(day: TripDay, orderedPlaceIds: string[]): DayAssignment {
  return {
    tripDayId: day.tripDayId,
    dayNumber: day.dayNumber,
    visitDate: day.visitDate,
    startTime: day.startTime,
    endTime: day.endTime,
    dailyBudget: day.dailyBudget,
    useBudget: day.useBudget,
    orderedPlaceIds,
  };
}

function errorMessage(err: unknown): string | undefined {
  return (err as { message?: string } | null)?.message;
}

function findMissingPlaceIds(
  requestedIds: string[],
  places: { placeId: string }[]
): string[] {
  const foundIds = new Set(places.map((place) => place.placeId.trim()));
  return requestedIds
    .map((id) => String(id).trim())
    .filter((id) => !foundIds.has(id));
}

/**
 * ตรวจว่าทริปมีอยู่และเป็นของ user ที่ login อยู่
 * ไม่ผ่าน -> ตอบ 404/403 ไปแล้วและคืน null (ผู้เรียก return ต่อได้เลย)
 */
async function loadOwnedTrip(
  tripId: string,
  req: AuthRequest,
  res: Response
): Promise<TripOwnerAndStart | null> {
  const tripOwner = await getTripOwnerAndStart(tripId);

  if (!tripOwner) {
    res.status(404).json({ message: "ไม่พบทริปนี้ในระบบ" });
    return null;
  }

  if (tripOwner.userId !== req.user?.id) {
    res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงทริปนี้" });
    return null;
  }

  return tripOwner;
}

/**
 * POST /api/itinerary/trips/:tripId/draft
 * body: { place_ids: string[] }
 *
 * สร้าง trip_days (ถ้ายังไม่มี) แล้วจัดร่างแผน (ยังไม่บันทึก) พร้อม travel matrix ให้ editor
 */
export const buildDraft = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  const { place_ids } = req.body;

  if (!Array.isArray(place_ids) || place_ids.length === 0) {
    return res.status(400).json({ message: "กรุณาเลือกสถานที่อย่างน้อย 1 แห่ง" });
  }

  try {
    const tripOwner = await loadOwnedTrip(tripId, req, res);
    if (!tripOwner) return;

    if (tripOwner.startLat === null || tripOwner.startLng === null) {
      return res.status(400).json({
        message: "ทริปนี้ยังไม่มีพิกัดจุดเริ่มต้น ไม่สามารถจัดเส้นทางได้",
      });
    }

    const tripDays = await getOrCreateTripDays(tripId);

    if (tripDays.length === 0) {
      return res.status(400).json({ message: "ทริปนี้ไม่มีวันเดินทางเลย" });
    }

    const places = await getSelectedPlaces(place_ids);
    const missingPlaceIds = findMissingPlaceIds(place_ids, places);

    if (missingPlaceIds.length > 0) {
      return res.status(400).json({
        message: "พบสถานที่บางแห่งไม่มีอยู่ในระบบ",
        missing_place_ids: missingPlaceIds,
      });
    }

    // ร่างแผนยังไม่มีเวลาที่ผู้ใช้กรอก (D-36) — editor ให้กรอกเอง
    const placesById = new Map<string, PlaceInput>(
      places.map((place) => [place.placeId, { ...place, visitDurationMin: null }])
    );

    const draftItems = buildInitialDraft(
      tripDays.map((day) => toDayAssignment(day, [])),
      place_ids,
      placesById,
      tripOwner.startLat,
      tripOwner.startLng
    );

    // ORS Matrix many-to-many: trip start + สถานที่ที่เลือกทั้งหมด — frontend ใช้ recompute ตอนลาก
    // (ไม่ throw: ORS พลาดจะ fallback รายคู่เป็น haversine ให้เอง)
    const travelMatrix = await buildTravelMatrix([
      {
        id: TRIP_START_ID,
        latitude: tripOwner.startLat,
        longitude: tripOwner.startLng,
      },
      ...places.map(toTravelPoint),
    ]);

    return res.status(200).json({
      message: "จัดร่างเส้นทางสำเร็จ (ยังไม่บันทึก)",
      tripStartLat: tripOwner.startLat,
      tripStartLng: tripOwner.startLng,
      tripDays,
      items: draftItems,
      travelMatrix,
    });
  } catch (err) {
    console.error("Build draft itinerary exception:", err);
    return res.status(500).json({
      message: errorMessage(err) || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};

interface ConfirmDayInput {
  trip_day_id: string;
  place_ids: string[];
}

/**
 * PUT /api/itinerary/trips/:tripId
 * body: { days: { trip_day_id: string; place_ids: string[] }[]; visit_durations: { [place_id]: นาที } }
 *
 * ยืนยันแผน — backend คำนวณซ้ำทั้งหมดด้วย buildItinerary() (ไม่เชื่อระยะ/เวลา/ราคาจาก frontend)
 * เวลาที่อยู่เป็น input ของผู้ใช้ (D-36) รับจาก body แต่ต้องกรอกครบและอยู่ในช่วง
 * แล้ว delete-then-insert ทับแผนเดิมทั้งทริป
 */
export const confirmItinerary = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  const { days, visit_durations } = req.body as {
    days: ConfirmDayInput[];
    visit_durations?: unknown;
  };

  if (!Array.isArray(days)) {
    return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }

  try {
    const tripOwner = await loadOwnedTrip(tripId, req, res);
    if (!tripOwner) return;

    const tripDays = await getOrCreateTripDays(tripId);
    const tripDaysById = new Map(tripDays.map((day) => [day.tripDayId, day]));

    for (const dayInput of days) {
      if (!tripDaysById.has(dayInput.trip_day_id)) {
        return res.status(400).json({
          message: `trip_day_id ${dayInput.trip_day_id} ไม่ใช่ของทริปนี้`,
        });
      }
      if (!Array.isArray(dayInput.place_ids)) {
        return res.status(400).json({
          message: `place_ids ของ trip_day_id ${dayInput.trip_day_id} รูปแบบไม่ถูกต้อง`,
        });
      }
    }

const allPlaceIds = Array.from(
  new Set(
    days.flatMap((day) =>
      day.place_ids.map((id) => String(id).trim())
    )
  )
);

// ตรวจสอบรหัสสถานที่เบื้องต้น
if (allPlaceIds.some((id) => !id)) {
  return res.status(400).json({
    message: "พบรหัสสถานที่ว่าง กรุณาตรวจสอบข้อมูลที่ส่งมา",
  });
}

const parsedDurations = parseVisitDurations(
  visit_durations,
  allPlaceIds
);

if ("error" in parsedDurations) {
  return res.status(400).json({
    message: parsedDurations.error,
  });
}

const { durations } = parsedDurations;

const places = await getSelectedPlaces(allPlaceIds);
const missingPlaceIds = findMissingPlaceIds(allPlaceIds, places);

if (missingPlaceIds.length > 0) {
  return res.status(400).json({
    message: "พบสถานที่บางแห่งไม่มีอยู่ในระบบ",
    missing_place_ids: missingPlaceIds,
  });
}



    const placesById = new Map<string, PlaceInput>(
      places.map((place) => [
        place.placeId,
        { ...place, visitDurationMin: durations.get(place.placeId) ?? null },
      ])
    );

    const dayAssignments = days.map((dayInput) =>
      toDayAssignment(tripDaysById.get(dayInput.trip_day_id)!, dayInput.place_ids)
    );

    // สร้าง travel matrix ใหม่ฝั่ง backend เสมอ — ถ้าไม่มีพิกัดจุดเริ่มต้น จะไม่ใส่ TRIP_START_ID
    // วันแรกจึงเริ่มตามเวลาเดิมโดยไม่มี leg แรก
    const hasStart =
      Number.isFinite(tripOwner.startLat) && Number.isFinite(tripOwner.startLng);
    const travelMatrix = await buildTravelMatrix([
      ...(hasStart
        ? [
            {
              id: TRIP_START_ID,
              latitude: tripOwner.startLat,
              longitude: tripOwner.startLng,
            },
          ]
        : []),
      ...places.map(toTravelPoint),
    ]);

    const finalItems = buildItinerary(dayAssignments, placesById, travelMatrix);

    // ---- กันแผนที่ยังมีจุดขัดแย้ง (ปิด / เวลาไม่พอ / งบเกิน) ----
    // ต้องเช็คก่อนลบแผนเดิมด้านล่าง ไม่งั้นถ้าปฏิเสธหลังลบ แผนเก่าของผู้ใช้จะหายไป
    // ตรงกับกฎที่หน้า ItineraryEditor ปิดปุ่มยืนยันไว้ ("ไม่ทราบเวลา/ราคา" ไม่นับเป็นปัญหา)
    const conflicts = finalItems.filter(
      (item) => item.isClosedConflict || item.isTimeConflict || item.isBudgetConflict
    );

    if (conflicts.length > 0) {
      return res.status(400).json({
        message: `แผนเดินทางยังมี ${conflicts.length} จุดที่มีปัญหา (ปิด / เวลาไม่พอ / งบเกิน) กรุณาแก้ไขก่อนยืนยัน`,
        conflicts: conflicts.map((item) => ({
          placeId: item.placeId,
          tripDayId: item.tripDayId,
          isClosedConflict: item.isClosedConflict,
          isTimeConflict: item.isTimeConflict,
          isBudgetConflict: item.isBudgetConflict,
        })),
      });
    }

    // ---- delete-then-insert ทับของเดิมทั้งทริป ----
    const allTripDayIds = tripDays.map((day) => day.tripDayId);

    const { error: deleteError } = await supabase
      .from("itineraries")
      .delete()
      .in("trip_day_id", allTripDayIds);

    if (deleteError) {
      console.error("Delete old itineraries error:", deleteError.message);
      return res.status(500).json({ message: "ลบแผนเดินทางเดิมไม่สำเร็จ" });
    }

    if (finalItems.length === 0) {
      return res.status(200).json({
        message: "บันทึกแผนเดินทางสำเร็จ (ไม่มีสถานที่)",
        items: [],
      });
    }

    const rowsToInsert = finalItems.map((item) => ({
      trip_day_id: item.tripDayId,
      place_id: item.placeId,
      visit_order: item.visitOrder,
      start_time: item.startTime,
      end_time: item.endTime,
      travel_time_from_prev: item.travelTimeFromPrev,
      distance_from_prev: item.distanceFromPrev,
      place_cost: item.placeCost,
      visit_duration_min: durations.get(item.placeId) ?? null,
      is_time_conflict: item.isTimeConflict,
      is_closed_conflict: item.isClosedConflict,
      is_budget_conflict: item.isBudgetConflict,
      is_hours_unknown: item.isHoursUnknown,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from("itineraries")
      .insert(rowsToInsert)
      .select();

    if (insertError) {
      console.error("Insert itineraries error:", insertError.message);
      return res.status(500).json({
        message: "re-validate สำเร็จ แต่บันทึกแผนเดินทางไม่สำเร็จ",
      });
    }

    return res.status(200).json({
      message: "บันทึกแผนเดินทางสำเร็จ",
      items: insertedRows,
    });
  } catch (err) {
    console.error("Confirm itinerary exception:", err);
    return res.status(500).json({
      message: errorMessage(err) || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};

interface SavedPlaceSummary {
  place_name: string | null;
  province: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface SavedItineraryRow {
  trip_day_id: string;
  place_id: string;
  visit_order: number;
  start_time: string | null;
  end_time: string | null;
  travel_time_from_prev: number | null;
  distance_from_prev: number | null;
  place_cost: number | null;
  visit_duration_min: number | null; // null = แผนที่บันทึกก่อน P5f (D-36)
  is_time_conflict: boolean;
  is_closed_conflict: boolean;
  is_budget_conflict: boolean;
  is_hours_unknown: boolean;
  places: SavedPlaceSummary | SavedPlaceSummary[] | null;
}

/**
 * GET /api/itinerary/trips/:tripId
 *
 * แผนเดินทางที่ "ยืนยันแล้ว" พร้อมข้อมูลสถานที่จากตาราง places (หน้า TripDetail)
 */
export const getSavedItinerary = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  try {
    const tripOwner = await loadOwnedTrip(tripId, req, res);
    if (!tripOwner) return;

    const tripDays = await getOrCreateTripDays(tripId);
    const tripDayIds = tripDays.map((day) => day.tripDayId);

    const { data, error } = await supabase
      .from("itineraries")
      .select(
        `
        trip_day_id,
        place_id,
        visit_order,
        start_time,
        end_time,
        travel_time_from_prev,
        distance_from_prev,
        place_cost,
        visit_duration_min,
        is_time_conflict,
        is_closed_conflict,
        is_budget_conflict,
        is_hours_unknown,
        places ( place_name, province, district, latitude, longitude )
      `
      )
      .in("trip_day_id", tripDayIds)
      .order("visit_order", { ascending: true });

    if (error) {
      console.error("Get saved itinerary error:", error.message);
      return res.status(500).json({ message: "ดึงข้อมูลแผนเดินทางไม่สำเร็จ" });
    }

    const itemsByDay = new Map<string, SavedItineraryRow[]>();
    for (const row of (data ?? []) as unknown as SavedItineraryRow[]) {
      const list = itemsByDay.get(row.trip_day_id) ?? [];
      list.push(row);
      itemsByDay.set(row.trip_day_id, list);
    }

    const responseDays = tripDays.map((day) => ({
      tripDayId: day.tripDayId,
      dayNumber: day.dayNumber,
      visitDate: day.visitDate,
      dailyBudget: day.dailyBudget,
      useBudget: day.useBudget,
      items: (itemsByDay.get(day.tripDayId) ?? []).map((row) => {
        // embed ได้ทั้ง object และ array ตามที่ Supabase คืนมา
        const place = Array.isArray(row.places) ? row.places[0] : row.places;
        return {
          placeId: row.place_id,
          placeName: place?.place_name ?? null,
          province: place?.province ?? null,
          district: place?.district ?? null,
          latitude: place?.latitude ?? null,
          longitude: place?.longitude ?? null,
          visitOrder: row.visit_order,
          startTime: row.start_time,
          endTime: row.end_time,
          travelTimeFromPrev: row.travel_time_from_prev,
          distanceFromPrev: row.distance_from_prev,
          placeCost: row.place_cost,
          visitDurationMin: row.visit_duration_min,
          isTimeConflict: row.is_time_conflict,
          isClosedConflict: row.is_closed_conflict,
          isBudgetConflict: row.is_budget_conflict,
          isHoursUnknown: row.is_hours_unknown,
          isCostUnknown: row.place_cost === null,
        };
      }),
    }));

    return res.status(200).json({
      tripStartLat: tripOwner.startLat,
      tripStartLng: tripOwner.startLng,
      tripDays: responseDays,
    });
  } catch (err) {
    console.error("Get saved itinerary exception:", err);
    return res.status(500).json({
      message: errorMessage(err) || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};

/**
 * GET /api/itinerary/trips/:tripId/auto-places
 * สถานที่ที่ Auto Trip จะใช้ — หน้า TripRecommendations เรียกเช็คก่อนเปิดหน้า Auto Trip
 */
export async function getAutoTripPlacesTest(req: AuthRequest, res: Response) {
  try {
    const { tripId } = req.params;

    if (!tripId || Array.isArray(tripId)) {
      return res.status(400).json({ message: "tripId is required" });
    }

    const tripOwner = await loadOwnedTrip(tripId, req, res);
    if (!tripOwner) return;

    const places = await getAutoTripPlaces(tripId);

    return res.status(200).json({
      success: true,
      count: places.length,
      places,
    });
  } catch (error) {
    console.error("getAutoTripPlacesTest error:", error);
    return res.status(500).json({
      success: false,
      message: errorMessage(error) || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
}

function toAutoPlace(
  p: AutoTripPlace,
  requestedVisitDurationMin: number
): AutoPlace {
  return {
    place_id: String(p.placeId),
    place_name: String(p.placeName),
    categoryId: String(p.categoryId),
    categoryName: p.categoryName ?? "",
    poiScore: Number(p.poiScore ?? 0),
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    opening_hours: p.openingHours,
    requestedVisitDurationMin,
  };
}

export async function getAutoTripCategoriesController(
  req: AuthRequest,
  res: Response
) {
  try {
    const { tripId } = req.params;

    if (!tripId || Array.isArray(tripId)) {
      return res.status(400).json({ message: "ไม่พบรหัสทริป" });
    }

    const tripOwner = await loadOwnedTrip(tripId, req, res);
    if (!tripOwner) return;

    const categories = await getAutoTripCategories(tripId);

    return res.status(200).json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error("getAutoTripCategoriesController error:", error);
    return res.status(500).json({
      success: false,
      message: "ไม่สามารถดึงประเภทสถานที่ได้",
    });
  }
}

/**
 * POST /api/itinerary/trips/:tripId/auto
 * body: { visitDurationByCategory: { [categoryId]: เวลาเที่ยวต่อสถานที่เป็นนาที } }
 * จัดทริปอัตโนมัติจาก POI ของหมวดที่ผู้ใช้เลือก
 */
export async function buildAutoTripController(req: AuthRequest, res: Response) {
  try {
    const { tripId } = req.params;

    if (!tripId || Array.isArray(tripId)) {
      return res.status(400).json({ message: "ไม่พบรหัสทริป" });
    }

    const tripOwner = await loadOwnedTrip(tripId, req, res);
    if (!tripOwner) return;

    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select(`
        trip_id,
        start_date,
        end_date,
        start_time,
        number_of_people,
        start_lat,
        start_lng,
        available_time_per_day
      `)
      .eq("trip_id", tripId)
      .single();

    if (tripError || !trip) {
      console.error("Get trip error:", tripError);
      return res.status(404).json({ message: "ไม่พบข้อมูลทริป" });
    }

    if (trip.start_lat === null || trip.start_lng === null) {
      return res.status(400).json({
        message: "กรุณากำหนดจุดเริ่มต้นทริปก่อนจัดทริปอัตโนมัติ",
      });
    }

    const categories = await getAutoTripCategories(tripId);
    const categoryIds = categories.map((category) => category.categoryId);
    const selectedCategoryIds = new Set(categoryIds);
    const rawPlaces = (await getAutoTripPlaces(tripId)).filter((place) =>
      selectedCategoryIds.has(place.categoryId)
    );

    if (rawPlaces.length === 0) {
      return res.status(400).json({
        message: "ไม่พบสถานที่ที่สามารถนำมาจัดทริปอัตโนมัติได้",
      });
    }

    const requestBody = req.body as
      | { visitDurationByCategory?: unknown }
      | undefined;
    const parsedDurations = parseAutoTripDurations(
      requestBody?.visitDurationByCategory,
      categoryIds
    );

    if ("error" in parsedDurations) {
      return res.status(400).json({ message: parsedDurations.error });
    }

    const placesWithDurations = rawPlaces.map((place) => {
      const requestedVisitDurationMin = parsedDurations.durations.get(place.categoryId);

      if (requestedVisitDurationMin === undefined) {
        throw new Error("ไม่พบเวลาเที่ยวของประเภทสถานที่");
      }

      return toAutoPlace(place, requestedVisitDurationMin);
    });

    const tripInfo: TripInfo = {
      trip_id: String(trip.trip_id),
      start_date: String(trip.start_date),
      end_date: String(trip.end_date),
      start_time: String(trip.start_time),
      number_of_people: trip.number_of_people ?? undefined,
      start_lat: Number(trip.start_lat),
      start_lng: Number(trip.start_lng),
      available_time_per_day:
        trip.available_time_per_day != null
          ? Number(trip.available_time_per_day)
          : null,
    };

    const travelMatrix = await buildTravelMatrix([
      {
        id: TRIP_START_ID,
        latitude: tripInfo.start_lat,
        longitude: tripInfo.start_lng,
      },
      ...placesWithDurations.map((place) => ({
        id: place.place_id,
        latitude: place.latitude,
        longitude: place.longitude,
      })),
    ]);

    const result = buildAutoTrip(tripInfo, placesWithDurations, travelMatrix);

    if (result.selected_places.length === 0) {
      return res.status(400).json({
        message: "ไม่พบสถานที่ที่เปิดตามเวลาที่กำหนดในช่วงวันเดินทาง",
      });
    }

    return res.status(200).json({
      success: true,
      message: "จัดทริปอัตโนมัติสำเร็จ",
      trip_id: result.trip_id,
      start_lat: tripInfo.start_lat,
      start_lng: tripInfo.start_lng,
      selected_places: result.selected_places,
      days: result.days,
      total_distance_km: result.total_distance_km,
    });
  } catch (error) {
    console.error("buildAutoTripController error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการจัดทริปอัตโนมัติ",
    });
  }
}
