import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";

/**
 * ✅ เพิ่มใหม่: กันไม่ให้ end_time (= start_time + available_time_per_day) ข้ามเที่ยงคืน
 * ตามมติในเอกสาร itineraries_feature_status.md ข้อ "trip_days ข้ามเที่ยงคืน" —
 * เลือกทาง (ก) validate ตอนสร้างทริปเลย ไม่รองรับ logic ข้ามวัน (MVP)
 *
 * เหตุผล: Postgres `time` type เก็บแค่เวลานาฬิกา ไม่รู้ว่าข้ามวัน ถ้าเริ่ม 20:00 + 8 ชม.
 * จะกลายเป็นแค่ 04:00 เฉยๆ แล้ว trip_days.end_time (= start_time + available_time_per_day)
 * ที่จะคำนวณตอนสร้าง itineraryBuilder.ts จะผิดพลาด (04:00 < 20:00 ทำให้ตรรกะเทียบเวลาในวันพัง)
 *
 * คืนค่า null = ผ่าน, string = ข้อความ error ที่จะส่งกลับ user
 */
function validateNoMidnightCrossing(
  startTime: string,
  availableTimePerDay: number | null
): string | null {
  // ไม่ได้กรอกเวลาว่างต่อวันมา -> ยังไม่มี end_time ให้เช็ค (ข้ามได้ ณ ตอนสร้างทริป)
  if (availableTimePerDay === null || availableTimePerDay === undefined) {
    return null;
  }

  if (
    typeof availableTimePerDay !== "number" ||
    Number.isNaN(availableTimePerDay) ||
    availableTimePerDay <= 0
  ) {
    return "เวลาว่างต่อวันต้องเป็นตัวเลขมากกว่า 0";
  }

  // รองรับ format "HH:MM" หรือ "HH:MM:SS" จาก <input type="time"> / DB
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(startTime);
  if (!match) {
    return "รูปแบบเวลาเริ่มต้นไม่ถูกต้อง";
  }

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);

  if (startHour > 23 || startMinute > 59) {
    return "รูปแบบเวลาเริ่มต้นไม่ถูกต้อง";
  }

  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = startMinutes + availableTimePerDay * 60;

  // > 24:00 (1440 นาที) แปลว่า end_time หลุดข้ามเที่ยงคืนไปวันถัดไปแน่นอน
  if (endMinutes > 24 * 60) {
    return "เวลาเริ่มต้นรวมกับเวลาว่างต่อวันข้ามเที่ยงคืน กรุณาปรับเวลาเริ่มต้นให้เร็วขึ้น หรือลดเวลาว่างต่อวันลง";
  }

  return null;
}

export const createTrip = async (req: AuthRequest, res: Response) => {

  const userId = req.user?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ message: "ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
  }

  const {
    province,
    // ✅ เปลี่ยนชื่อ field จาก city เป็น district แล้ว (rename ทั้งระบบ กันความสับสน
    // เพราะค่านี้คืออำเภอ/เขต ไม่ใช่เมือง — คอลัมน์ DB เปลี่ยนชื่อจาก trips.city
    // เป็น trips.district ด้วย ต้องรัน SQL migration ก่อน deploy โค้ดนี้)
    district,
    start_date,
    end_date,
    start_time,
    number_of_people,
    total_budget,
    budget_scope,
    budget_period,
    daily_budget,
    available_time_per_day,
    category_ids,

    // ✅ เพิ่ม field ใหม่
    start_lat,
    start_lng,
    start_address,
  } = req.body;

  // ✅ validate budget_scope / budget_period (แยกจาก budget_type เดิม)
  const VALID_SCOPES = ["GROUP", "PER_PERSON"];
  const VALID_PERIODS = ["TOTAL_TRIP", "PER_DAY"];

  if (budget_scope && !VALID_SCOPES.includes(budget_scope)) {
    return res.status(400).json({ message: "ขอบเขตงบประมาณไม่ถูกต้อง" });
  }

  if (budget_period && !VALID_PERIODS.includes(budget_period)) {
    return res.status(400).json({ message: "ช่วงเวลาของงบประมาณไม่ถูกต้อง" });
  }

  // ✅ ถ้ามี total_budget ต้องเลือก scope + period ให้ครบทั้งคู่
  if (total_budget && (!budget_scope || !budget_period)) {
    return res
      .status(400)
      .json({ message: "กรุณาเลือกขอบเขตและช่วงเวลาของงบประมาณให้ครบ" });
  }

  // validate ขั้นต่ำ
  if (!start_date || !end_date || !start_time || !number_of_people) {
    return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
  }

  // ✅ ป้องกันค่าติดลบ/0 หลุดเข้ามา (จะกระทบตอนคำนวณ per_person_daily_budget ในขั้น POI score)
  if (
    typeof number_of_people !== "number" ||
    !Number.isInteger(number_of_people) ||
    number_of_people < 1
  ) {
    return res
      .status(400)
      .json({ message: "จำนวนผู้เดินทางต้องเป็นจำนวนเต็มตั้งแต่ 1 คนขึ้นไป" });
  }

  // ✅ แก้แล้ว: province บังคับกรอกเสมอ ส่วน district เลือกกรอกเพิ่มหรือไม่ก็ได้
  // (เดิมบังคับแค่ "province หรือ district อย่างน้อย 1 อย่าง" เปลี่ยนเป็น province บังคับตรงๆ
  // เพื่อให้ poiPlaceQueries.ts กรอง location ได้แน่นอนเสมอ ไม่ต้องรองรับกรณี district-only)
  if (!province) {
    return res.status(400).json({ message: "กรุณาเลือกจังหวัด" });
  }

  // ✅ บังคับให้มีพิกัดจาก LocationPinPicker
  if (
    start_lat === null ||
    start_lng === null ||
    start_lat === undefined ||
    start_lng === undefined
  ) {
    return res.status(400).json({
      message: "กรุณาปักหมุดจุดเริ่มต้นก่อนสร้างทริป",
    });
  }

  // ✅ ตรวจสอบช่วงพิกัด
  if (
    start_lat < -90 ||
    start_lat > 90 ||
    start_lng < -180 ||
    start_lng > 180
  ) {
    return res.status(400).json({
      message: "พิกัดจุดเริ่มต้นไม่ถูกต้อง",
    });
  }

  // ✅ เพิ่มใหม่: กัน end_time (start_time + available_time_per_day) ข้ามเที่ยงคืน
  // (ทาง (ก) ตามที่ตัดสินใจไว้ใน itineraries_feature_status.md — ดู validateNoMidnightCrossing ด้านบน)
  const midnightCrossingError = validateNoMidnightCrossing(
    start_time,
    available_time_per_day ?? null
  );

  if (midnightCrossingError) {
    return res.status(400).json({ message: midnightCrossingError });
  }

  try {
    const { data, error } = await supabase
      .from("trips")
      .insert([
        {
          user_id: userId,
          province, // บังคับกรอกแล้ว การันตีไม่ว่างจาก validation ด้านบน
          district: district || null,
          start_date,
          end_date,
          start_time,
          number_of_people,
          total_budget,
          budget_scope: budget_scope || null,
          budget_period: budget_period || null,
          daily_budget,
          available_time_per_day,

          // ✅ บันทึกพิกัด
          start_lat,
          start_lng,
          start_address: start_address || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Create trip error:", error);

      return res.status(500).json({
        message: error.message,
      });
    }

    // ✅ insert trip_categories (best-effort — ไม่ rollback trip หลักถ้า fail)
    // เหตุผล: รักษาความง่ายของระบบ ตรงกับแนวทาง "ไม่ทำ fallback ซับซ้อน"
    // ที่เลือกไว้แล้วตอนออกแบบ distance score — trip หลักยังคงถูกต้องและใช้งานได้
    // แม้ category จะไม่ติดไปด้วย แค่แจ้งเตือนกลับไปให้ user รู้แทนการเงียบไว้
    let categoryWarning = false;

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const tripCategoryRows = category_ids.map(
        (categoryId: number) => ({
          trip_id: data.trip_id,
          category_id: categoryId,
        })
      );

      const { error: categoryError } = await supabase
        .from("trip_categories")
        .insert(tripCategoryRows);

      if (categoryError) {
        console.error(
          "Insert trip_categories error:",
          categoryError.message
        );
        categoryWarning = true;
      }
    }

    return res.status(201).json({
      message: categoryWarning
        ? "สร้างทริปสำเร็จ แต่บันทึกหมวดหมู่ความสนใจไม่สำเร็จ กรุณาลองแก้ไขทริปภายหลัง"
        : "สร้างทริปสำเร็จ",
      trip: data,
      categoryWarning,
    });
  } catch (err: any) {
    console.error("Create trip exception:", err);

    return res.status(500).json({
      message: err.message || "เกิดข้อผิดพลาดภายในระบบ",
    });
  }
};

export const getMyTrips = async (
  req: AuthRequest,
  res: Response
) => {
  const userId = req.user?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ message: "ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
  }

  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({
      message: error.message,
    });
  }

  res.json({ trips: data });
};

/**
 * GET /api/trips/:tripId
 *
 * ✅ เพิ่มใหม่: ดึงข้อมูลทริปเดี่ยว — ใช้กับหน้า TripDetail (แสดงแผนที่ยืนยันแล้ว) เพราะ
 * getMyTrips เดิมคืนมาทีเดียวทั้งหมด ไม่เหมาะกับหน้า detail ที่รู้ tripId จาก URL แล้ว
 * ตรวจสิทธิ์ด้วย eq("user_id", userId) คู่กับ eq("trip_id", tripId) เสมอ (ห้ามเชื่อ tripId
 * จาก URL อย่างเดียว กัน user ดูทริปคนอื่น)
 */
export const getTripById = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ message: "ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
  }

  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Get trip by id error:", error.message);
    return res.status(500).json({ message: error.message });
  }

  if (!data) {
    return res
      .status(404)
      .json({ message: "ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง" });
  }

  res.json({ trip: data });
};
/**
 * DELETE /api/trips/:tripId
 * ลบทริปของ user เอง — ตรวจสิทธิ์ด้วย eq("user_id", userId) เสมอ กัน user ลบทริปคนอื่น
 * หมายเหตุ: ต้องเช็คว่า trip_days / trip_categories มี FK "on delete CASCADE" กลับมาที่ trips
 * ถ้าไม่มี การลบจะ error ด้วย FK constraint แทน (ต้องรัน ALTER TABLE เพิ่ม CASCADE ก่อน)
 */
export const deleteTrip = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res
      .status(401)
      .json({ message: "ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
  }

  const { tripId } = req.params;

  if (!tripId || Array.isArray(tripId)) {
    return res.status(400).json({ message: "ไม่พบรหัสทริป" });
  }

  const { error, count } = await supabase
    .from("trips")
    .delete({ count: "exact" })
    .eq("trip_id", tripId)
    .eq("user_id", userId);

  if (error) {
    console.error("Delete trip error:", error.message);
    return res.status(500).json({ message: error.message });
  }

  if (!count) {
    return res
      .status(404)
      .json({ message: "ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์ลบ" });
  }

  res.json({ message: "ลบทริปสำเร็จ" });
};