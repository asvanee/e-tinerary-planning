import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";

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

  if (!province && !district) {
    return res
      .status(400)
      .json({ message: "กรุณาเลือกจังหวัดหรืออำเภออย่างน้อย 1 อย่าง" });
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

  try {
    const { data, error } = await supabase
      .from("trips")
      .insert([
        {
          user_id: userId,
          province: province || null,
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