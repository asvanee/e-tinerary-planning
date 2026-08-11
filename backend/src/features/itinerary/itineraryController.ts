import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";
import {
  getOrCreateTripDays,
  getSelectedPlaces,
  getTripOwnerAndStart,
} from "./itineraryPlaceQueries";
import {
  buildInitialDraft,
  buildItinerary,
  DayAssignment,
} from "./itineraryBuilder";

/**
 * POST /api/itinerary/trips/:tripId/draft
 * body: { place_ids: string[] }
 *
 * สร้าง trip_days (ถ้ายังไม่มี) แล้วคืนสถานที่ที่เลือกไว้ทั้งหมดกลับไปแบบยังไม่จัดลงวันไหนเลย
 * (ดู itineraryBuilder.ts::buildInitialDraft — final design แล้ว ไม่ auto-place และไม่รัน
 * Nearest-Neighbor/TSP heuristic ใดๆ ตอน build draft ครั้งแรก ให้ user ลากจัดเองทุกที่ตั้งแต่แรก
 * ในหน้า editor เสมอ ไม่มีแผนเปลี่ยนกลับ)
 * ยังไม่บันทึกลง itineraries (ตามหัวข้อ 4 ใน itineraries_feature_status.md)
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
      // ไม่ควรเกิดจริง (start_date/end_date บังคับกรอกตอนสร้างทริปแล้ว) กันไว้เผื่อข้อมูลผิดปกติ
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
      orderedPlaceIds: [], // buildInitialDraft() จะเติมให้เอง (วันแรกเท่านั้น วันอื่นว่างเปล่า)
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
      // ✅ เพิ่ม — จำเป็นสำหรับหน้า itinerary editor วาดจุดเริ่มต้นบน RouteMap
      // (แค่ใช้แสดงผลบนแผนที่เท่านั้น — buildInitialDraft ไม่ได้คำนวณ TSP หรือใช้พิกัดนี้
      // ในการจัดลำดับใดๆ แล้ว เดิมไม่เคย return ค่านี้ออกมาให้ frontend เลย)
      tripStartLat: tripOwner.startLat,
      tripStartLng: tripOwner.startLng,
      tripDays: tripDays.map((day) => ({
        tripDayId: day.tripDayId,
        dayNumber: day.dayNumber,
        visitDate: day.visitDate,
        startTime: day.startTime,
        endTime: day.endTime,
        dailyBudget: day.dailyBudget,
        // ✅ เพิ่มใหม่ — หน้า editor ต้องใช้ค่านี้ประกอบ DayAssignment ตอน recompute
        // client-side เอง (buildDayItems) ให้ isBudgetConflict ตรงกับที่ backend คำนวณ
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
 * ยืนยันแผนเดินทาง — backend re-validate ซ้ำทั้งหมด (ไม่เชื่อผลคำนวณจาก client ตรงๆ)
 * ด้วย buildItinerary() ตัวเดียวกับที่ client ใช้ตอน recompute แล้ว delete-then-insert
 * ทับของเดิมทั้งทริป (ไม่ใช่แค่วันที่ส่งมาใน body) กันเคสวันที่ user ลบสถานที่ออกจนว่างเปล่า
 * (ไม่ส่งมาใน body เลย) เหลือข้อมูลเก่าค้างอยู่ใน DB
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

    // ดึง trip_days ทั้งหมดของทริปนี้ (ไม่ใช่แค่ที่ส่งมาใน body) ไว้ 2 จุดประสงค์:
    // 1. validate ว่า trip_day_id ที่ส่งมาเป็นของทริปนี้จริง (กัน user ยัด trip_day_id ทริปอื่นมา)
    // 2. ใช้เป็นฐานลบข้อมูลเก่าให้ครบทุกวัน ไม่ใช่แค่วันที่มีใน body
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
      new Set(days.flatMap((day: any) => day.place_ids as string[]))
    );

    const places = await getSelectedPlaces(allPlaceIds);
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
 * ✅ เพิ่มใหม่: ดึงแผนเดินทางที่ "ยืนยันแล้ว" (บันทึกอยู่ในตาราง itineraries จริง) พร้อม join
 * ข้อมูลสถานที่ (ชื่อ/จังหวัด/อำเภอ/พิกัด) จากตาราง places มาด้วยในคำตอบเดียว — ใช้กับหน้า
 * TripDetail.tsx (frontend) ที่ต้องแสดงผลได้แม้ user เข้าหน้านี้ตรงๆ (refresh / จาก MyTrips)
 * โดยไม่มี router state จากหน้า editor ติดมาด้วย
 *
 * ต่างจาก buildDraft/confirmItinerary ตรงที่ตัวนี้ "อ่านอย่างเดียว" ไม่มีการคำนวณใหม่ใดๆ
 * (ข้อมูลที่ query มาคือผลลัพธ์สุดท้ายที่ confirmItinerary คำนวณและบันทึกไว้แล้วเป๊ะ)
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

    // join ตรงกับ places ในคำสั่ง select เดียว (Supabase/PostgREST embed) — ไม่ต้อง query
    // ซ้ำสองรอบเหมือนใน buildDraft/confirmItinerary เพราะที่นี่ไม่ได้เอาไปคำนวณต่อ แค่แสดงผล
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
      // ✅ เพิ่มใหม่ — ให้ shape ตรงกับ buildDraft response เผื่ออนาคตหน้าไหนเอา saved itinerary
      // นี้ไปสร้าง DayAssignment ต่อ (เช่น เปิดแก้ไขแผนที่ยืนยันแล้วซ้ำในหน้า editor)
      useBudget: day.useBudget,
      items: (itemsByDay.get(day.tripDayId) ?? []).map((row: any) => ({
        placeId: row.place_id,
        // ✅ Supabase embed คืนเป็น object เดี่ยวปกติ แต่บาง version คืนเป็น array ถ้า
        // FK ไม่ได้ตั้ง unique — เผื่อไว้ทั้งสองแบบกันพัง
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
        // ✅ แก้บั๊ก: เดิม endpoint นี้ไม่ส่ง isCostUnknown มาเลย ทั้งที่ place_cost เก็บ null
        // ลง DB จริงตอน confirmItinerary (เมื่อ paid ไม่มี price_level จริง — เดิมเรียก
        // food/paid_other) —
        // ไม่ต้องเพิ่ม column ใหม่ใน DB เลย แค่ derive จาก place_cost === null ตรงๆ (เกณฑ์
        // เดียวกับ itineraryBuilder.ts::isCostUnknown) ทำให้ frontend (TripDetail.tsx) แยก
        // "ไม่ทราบราคา" ออกจากตัวเลขจริงได้ ไม่ใช่พัง null.toLocaleString() ตอน render
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