import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";

import {
  getTripOwnerAndStart,
  getOrCreateTripDays,
  getSelectedPlaces,
  getAutoTripPlaces,
} from "./itineraryPlaceQueries";

import {
  buildInitialDraft,
  buildItinerary,
  DayAssignment,
} from "./itineraryBuilder";

import {
  buildAutoTrip,
  AutoPlace,
  TripInfo,
} from "./autoTripBuilder";

/**
 * POST /api/itinerary/trips/:tripId/draft
 * body: { place_ids: string[] }
 *
 * สร้าง trip_days (ถ้ายังไม่มี) แล้วคืนสถานที่ที่เลือกไว้ทั้งหมดกลับไปแบบยังไม่จัดลงวันไหนเลย
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
    const tripOwner = await getTripOwnerAndStart(tripId);

    if (!tripOwner) {
      return res.status(404).json({ message: "ไม่พบทริปนี้ในระบบ" });
    }

    if (tripOwner.userId !== req.user?.id) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงทริปนี้" });
    }

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

    if (places.length === 0) {
      return res.status(400).json({ message: "ไม่พบข้อมูลสถานที่ที่เลือกในระบบ" });
    }

    const placesById = new Map(places.map((place) => [place.placeId, place]));

    const dayAssignments: DayAssignment[] = tripDays.map((day) => ({
      tripDayId: day.tripDayId,
      visitDate: day.visitDate,
      startTime: day.startTime,
      endTime: day.endTime,
      dailyBudget: day.dailyBudget,
      useBudget: day.useBudget,
      orderedPlaceIds: [],
    }));

    const draftItems = buildInitialDraft(
      dayAssignments,
      place_ids,
      placesById,
      tripOwner.startLat,
      tripOwner.startLng
    );

    return res.status(200).json({
      message: "จัดร่างเส้นทางสำเร็จ (ยังไม่บันทึก)",
      tripStartLat: tripOwner.startLat,
      tripStartLng: tripOwner.startLng,
      tripDays: tripDays.map((day) => ({
        tripDayId: day.tripDayId,
        dayNumber: day.dayNumber,
        visitDate: day.visitDate,
        startTime: day.startTime,
        endTime: day.endTime,
        dailyBudget: day.dailyBudget,
        useBudget: day.useBudget,
      })),
      items: draftItems,
    });
  } catch (err: any) {
    console.error("Build draft itinerary exception:", err);
    return res.status(500).json({
      message: err.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};

/**
 * PUT /api/itinerary/trips/:tripId
 * body: { days: { trip_day_id: number; place_ids: string[] }[] }
 *
 * ยืนยันแผนเดินทาง — backend re-validate ซ้ำทั้งหมด ด้วย buildItinerary() 
 * แล้ว delete-then-insert ทับของเดิมทั้งทริป
 */
export const confirmItinerary = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  const { days } = req.body;

  if (!Array.isArray(days)) {
    return res.status(400).json({ message: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }

  try {
    const tripOwner = await getTripOwnerAndStart(tripId);

    if (!tripOwner) {
      return res.status(404).json({ message: "ไม่พบทริปนี้ในระบบ" });
    }

    if (tripOwner.userId !== req.user?.id) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงทริปนี้" });
    }

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
        days.flatMap((day: any) =>
          Array.isArray(day?.place_ids) ? day.place_ids : []
        )
      )
    );

    const places = await getSelectedPlaces(allPlaceIds);

    // ✅ เพิ่มการตรวจว่าสถานที่ที่ส่งมาจาก frontend มีจริงในระบบครบทุกตัวหรือไม่
    if (allPlaceIds.length > 0 && places.length !== allPlaceIds.length) {
      return res.status(400).json({
        message: "พบสถานที่บางแห่งไม่มีอยู่ในระบบ",
      });
    }

    const placesById = new Map(places.map((place) => [place.placeId, place]));

    const dayAssignments: DayAssignment[] = days.map((dayInput: any) => {
      const day = tripDaysById.get(dayInput.trip_day_id)!;
      return {
        tripDayId: day.tripDayId,
        visitDate: day.visitDate,
        startTime: day.startTime,
        endTime: day.endTime,
        dailyBudget: day.dailyBudget,
        useBudget: day.useBudget,
        orderedPlaceIds: dayInput.place_ids,
      };
    });

    const finalItems = buildItinerary(dayAssignments, placesById);

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
  } catch (err: any) {
    console.error("Confirm itinerary exception:", err);
    return res.status(500).json({
      message: err.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};

/**
 * GET /api/itinerary/trips/:tripId
 *
 * ดึงแผนเดินทางที่ "ยืนยันแล้ว" พร้อม join ข้อมูลสถานที่จากตาราง places
 */
export const getSavedItinerary = async (req: AuthRequest, res: Response) => {
  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  try {
    const tripOwner = await getTripOwnerAndStart(tripId);

    if (!tripOwner) {
      return res.status(404).json({ message: "ไม่พบทริปนี้ในระบบ" });
    }

    if (tripOwner.userId !== req.user?.id) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงทริปนี้" });
    }

    const tripDays = await getOrCreateTripDays(tripId);
    const tripDayIds = tripDays.map((day) => day.tripDayId);

    const { data: itineraryRows, error } = await supabase
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

    const itemsByDay = new Map<number, any[]>();
    for (const row of itineraryRows ?? []) {
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
      items: (itemsByDay.get(day.tripDayId) ?? []).map((row: any) => ({
        placeId: row.place_id,
        placeName: row.places?.place_name ?? row.places?.[0]?.place_name ?? null,
        province: row.places?.province ?? row.places?.[0]?.province ?? null,
        district: row.places?.district ?? row.places?.[0]?.district ?? null,
        latitude: row.places?.latitude ?? row.places?.[0]?.latitude ?? null,
        longitude: row.places?.longitude ?? row.places?.[0]?.longitude ?? null,
        visitOrder: row.visit_order,
        startTime: row.start_time,
        endTime: row.end_time,
        travelTimeFromPrev: row.travel_time_from_prev,
        distanceFromPrev: row.distance_from_prev,
        placeCost: row.place_cost,
        isTimeConflict: row.is_time_conflict,
        isClosedConflict: row.is_closed_conflict,
        isBudgetConflict: row.is_budget_conflict,
        isHoursUnknown: row.is_hours_unknown,
        isCostUnknown: row.place_cost === null,
      })),
    }));

    return res.status(200).json({
      tripStartLat: tripOwner.startLat,
      tripStartLng: tripOwner.startLng,
      tripDays: responseDays,
    });
  } catch (err: any) {
    console.error("Get saved itinerary exception:", err);
    return res.status(500).json({
      message: err.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};

/**
 * GET /api/itinerary/trips/:tripId/auto-test
 */
export async function getAutoTripPlacesTest(req: AuthRequest, res: Response) {
  try {
    const { tripId } = req.params;

    if (!tripId || Array.isArray(tripId)) {
      return res.status(400).json({ message: "tripId is required" });
    }

    const places = await getAutoTripPlaces(tripId);

    return res.status(200).json({
      success: true,
      count: places.length,
      places,
    });
  } catch (error: any) {
    console.error("getAutoTripPlacesTest error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
}

/**
 * Helper: แปลงข้อความ HH:mm เป็นจำนวนนาทีนับจาก 00:00
 */
function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

/**
 * Helper: เช็กว่าช่วงเวลาเข้าชมสถานที่ (visitStart - visitEnd) เปิดบริการอยู่ใน opening_hours หรือไม่
 */
function isOpenAt(openingHours: any, visitStartMin: number, visitEndMin: number): boolean {
  if (!openingHours) return true; // ถ้าไม่มีข้อมูลถือว่าเปิดตลอด
  
  // ในกรณีที่ opening_hours เป็น string รูปแบบ "08:00 - 17:00"
  if (typeof openingHours === "string") {
    const times = openingHours.split("-").map((t) => t.trim());
    if (times.length === 2) {
      const openMin = parseTimeToMinutes(times[0]);
      const closeMin = parseTimeToMinutes(times[1]);
      if (openMin !== null && closeMin !== null) {
        return visitStartMin >= openMin && visitEndMin <= closeMin;
      }
    }
    return true;
  }

  // กรณีที่เป็น JSON Object (เช่น { open: "08:00", close: "17:00" })
  if (typeof openingHours === "object") {
    const openMin = parseTimeToMinutes(openingHours.open || openingHours.start);
    const closeMin = parseTimeToMinutes(openingHours.close || openingHours.end);
    if (openMin !== null && closeMin !== null) {
      return visitStartMin >= openMin && visitEndMin <= closeMin;
    }
  }

  return true;
}

/**
 * POST /api/itinerary/trips/:tripId/auto
 */
export async function buildAutoTripController(req: AuthRequest, res: Response) {
  try {
    const { tripId } = req.params;

    if (!tripId || Array.isArray(tripId)) {
      return res.status(400).json({ message: "ไม่พบรหัสทริป" });
    }

    // 1. ตรวจสอบเจ้าของทริป
    const tripOwner = await getTripOwnerAndStart(tripId);

    if (!tripOwner) {
      return res.status(404).json({ message: "ไม่พบทริปนี้ในระบบ" });
    }

    if (tripOwner.userId !== req.user?.id) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงทริปนี้" });
    }

    // 2. ดึงข้อมูล trip
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

    // 3. ตรวจสอบจุดเริ่มต้น
    if (trip.start_lat === null || trip.start_lng === null) {
      return res.status(400).json({
        message: "กรุณากำหนดจุดเริ่มต้นทริปก่อนจัดทริปอัตโนมัติ",
      });
    }

    // 4. ดึงสถานที่ทั้งหมดสำหรับ Auto Trip
    const rawPlaces = await getAutoTripPlaces(tripId);

    if (!rawPlaces || rawPlaces.length === 0) {
      return res.status(400).json({
        message: "ไม่พบสถานที่ที่สามารถนำมาจัดทริปอัตโนมัติได้",
      });
    }

    // 5. คัดเลือกสถานที่ที่มี POI Score สูงสุดของแต่ละหมวดหมู่ (Select Top POI Per Category)
    const categoryMap = new Map<string, any>();

    for (const place of rawPlaces as any[]) {
  const catKey = String(place.categoryName ?? place.category_name ?? place.category_id ?? "unknown");
  const currentScore = Number(place.poiScore ?? place.poi_score ?? 0);

  if (!categoryMap.has(catKey)) {
    categoryMap.set(catKey, place);
  } else {
    const existingPlace = categoryMap.get(catKey);
    const existingScore = Number(existingPlace.poiScore ?? existingPlace.poi_score ?? 0);

    if (currentScore > existingScore) {
      categoryMap.set(catKey, place);
    }
  }
}

    // แปลงผลลัพธ์คัดเลือกกลับมาเป็น Array
    const topPlacesPerCategory = Array.from(categoryMap.values());

    // 6. แปลงข้อมูลสถานที่ให้ตรงกับโครงสร้าง AutoPlace และกรองตามเวลาเปิด-ปิด (Opening Hours Check)
    const tripStartTimeMin = parseTimeToMinutes(trip.start_time) ?? 540; // 09:00 (540 นาที)
    const filteredPlaces: AutoPlace[] = [];

    for (const p of topPlacesPerCategory) {
      const duration = p.default_duration_min ?? p.defaultDurationMin ?? 60; // default 60 mins
      const openingHours = p.opening_hours ?? p.openingHours;

      // ตรวจสอบว่าสถานที่นี้เปิดในช่วงเวลาเที่ยวตั้งต้นหรือไม่
      const isAvailable = isOpenAt(openingHours, tripStartTimeMin, tripStartTimeMin + duration);

      if (isAvailable) {
        filteredPlaces.push({
          place_id: String(p.place_id ?? p.placeId),
          place_name: String(p.place_name ?? p.placeName),
          categoryName: p.categoryName ?? p.category_name ?? "",
          poiScore: Number(p.poiScore ?? p.poi_score ?? 0),
          latitude: Number(p.latitude ?? p.lat),
          longitude: Number(p.longitude ?? p.lng),
          opening_hours: openingHours,
          default_duration_min: duration,
        });
      }
    }

    // หากกรองแล้วไม่เหลือสถานที่เลย ให้ดึงทั้งหมดกลับมาเป็น Fallback
    const finalPlacesToUse: AutoPlace[] = filteredPlaces.length > 0 
      ? filteredPlaces 
      : topPlacesPerCategory.map((p: any) => ({
          place_id: String(p.place_id ?? p.placeId),
          place_name: String(p.place_name ?? p.placeName),
          categoryName: p.categoryName ?? p.category_name ?? "",
          poiScore: Number(p.poiScore ?? p.poi_score ?? 0),
          latitude: Number(p.latitude ?? p.lat),
          longitude: Number(p.longitude ?? p.lng),
          opening_hours: p.opening_hours ?? p.openingHours,
          default_duration_min: p.default_duration_min ?? p.defaultDurationMin ?? 60,
        }));

    // 7. แปลงข้อมูลทริปให้ตรงกับ TripInfo
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

    // 8. Run Auto Trip Algorithm
    const result = buildAutoTrip(tripInfo, finalPlacesToUse);

    // 9. ส่งผลลัพธ์กลับ Frontend
    return res.status(200).json({
      success: true,
      message: "จัดทริปอัตโนมัติสำเร็จ",
      trip_id: result.trip_id,
      selected_places: result.selected_places,
      days: result.days,
      total_distance_km: result.total_distance_km,
    });
  } catch (error: any) {
    console.error("buildAutoTripController error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "เกิดข้อผิดพลาดในการจัดทริปอัตโนมัติ",
    });
  }
}