import { Response } from "express";
import { supabase } from "../../config/db";
import { AuthRequest } from "../auth/authMiddleware";
import { errorMessage } from "../../utils/errorMessage";
import { DAY_STRUCTURE_FIELDS, DayStructure, dayStructureChanged } from "./tripDayStructure";
import { diffTripCategories, parseCategoryIds, TripCategoryLink } from "./tripCategories";

const VALID_SCOPES = ["GROUP", "PER_PERSON"];
const VALID_PERIODS = ["TOTAL_TRIP", "PER_DAY"];
const INTERNAL_ERROR = "เกิดข้อผิดพลาดภายในระบบ";

// field ที่ createTrip / updateTrip รับจาก body
interface TripBody {
  province?: string;
  district?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  number_of_people?: unknown;
  use_budget?: boolean;
  total_budget?: number | null;
  budget_scope?: string;
  budget_period?: string;
  daily_budget?: number | null;
  available_time_per_day?: number | null;
  category_ids?: unknown;
  start_lat?: number | null;
  start_lng?: number | null;
  start_address?: string;
}

// คืน user id หรือตอบ 401 แล้วคืน null
function requireUserId(req: AuthRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ message: "ไม่พบผู้ใช้ กรุณาเข้าสู่ระบบใหม่" });
    return null;
  }
  return userId;
}

// คืน user id + trip id จาก path หรือตอบ 401/400 แล้วคืน null
function requireTripParams(req: AuthRequest, res: Response): { userId: string; tripId: string } | null {
  const userId = requireUserId(req, res);
  if (!userId) return null;

  const { tripId } = req.params;
  if (!tripId || Array.isArray(tripId)) {
    res.status(400).json({ message: "ไม่พบรหัสทริป" });
    return null;
  }
  return { userId, tripId };
}

// เวลาเริ่ม + เวลาว่างต่อวันต้องไม่ข้ามเที่ยงคืน เพราะคอลัมน์ time เก็บข้ามวันไม่ได้ — null = ผ่าน
function validateNoMidnightCrossing(
  startTime: string,
  availableTimePerDay: number | null
): string | null {
  if (availableTimePerDay === null || availableTimePerDay === undefined) return null;

  if (
    typeof availableTimePerDay !== "number" ||
    Number.isNaN(availableTimePerDay) ||
    availableTimePerDay <= 0
  ) {
    return "เวลาว่างต่อวันต้องเป็นตัวเลขมากกว่า 0";
  }

  // "HH:MM" หรือ "HH:MM:SS"
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(startTime);
  if (!match) return "รูปแบบเวลาเริ่มต้นไม่ถูกต้อง";

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  if (startHour > 23 || startMinute > 59) return "รูปแบบเวลาเริ่มต้นไม่ถูกต้อง";

  const endMinutes = startHour * 60 + startMinute + availableTimePerDay * 60;
  if (endMinutes > 24 * 60) {
    return "เวลาเริ่มต้นรวมกับเวลาว่างต่อวันข้ามเที่ยงคืน กรุณาปรับเวลาเริ่มต้นให้เร็วขึ้น หรือลดเวลาว่างต่อวันลง";
  }
  return null;
}

// ตรวจ body ของ createTrip / updateTrip — null = ผ่าน, string = ข้อความ error (400)
function validateTripBody(body: TripBody, missingStartMessage: string): string | null {
  const {
    province,
    start_date,
    end_date,
    start_time,
    number_of_people,
    total_budget,
    budget_scope,
    budget_period,
    available_time_per_day,
    start_lat,
    start_lng,
  } = body;

  if (budget_scope && !VALID_SCOPES.includes(budget_scope)) return "ขอบเขตงบประมาณไม่ถูกต้อง";
  if (budget_period && !VALID_PERIODS.includes(budget_period)) return "ช่วงเวลาของงบประมาณไม่ถูกต้อง";
  if (total_budget && (!budget_scope || !budget_period)) {
    return "กรุณาเลือกขอบเขตและช่วงเวลาของงบประมาณให้ครบ";
  }
  if (!start_date || !end_date || !start_time || !number_of_people) return "ข้อมูลไม่ครบถ้วน";

  if (
    typeof number_of_people !== "number" ||
    !Number.isInteger(number_of_people) ||
    number_of_people < 1
  ) {
    return "จำนวนผู้เดินทางต้องเป็นจำนวนเต็มตั้งแต่ 1 คนขึ้นไป";
  }

  // POI กรองสถานที่ด้วยจังหวัด จึงต้องมีเสมอ (อำเภอไม่บังคับ)
  if (!province) return "กรุณาเลือกจังหวัด";

  if (start_lat === null || start_lng === null || start_lat === undefined || start_lng === undefined) {
    return missingStartMessage;
  }
  if (start_lat < -90 || start_lat > 90 || start_lng < -180 || start_lng > 180) {
    return "พิกัดจุดเริ่มต้นไม่ถูกต้อง";
  }

  return validateNoMidnightCrossing(start_time, available_time_per_day ?? null);
}

// คอลัมน์ของ trips ที่บันทึกจาก body (user_id ใส่จาก req.user เท่านั้น)
function toTripColumns(body: TripBody) {
  return {
    province: body.province,
    district: body.district || null,
    start_date: body.start_date,
    end_date: body.end_date,
    start_time: body.start_time,
    number_of_people: body.number_of_people,
    use_budget: !!body.use_budget,
    total_budget: body.total_budget,
    budget_scope: body.budget_scope || null,
    budget_period: body.budget_period || null,
    daily_budget: body.daily_budget,
    available_time_per_day: body.available_time_per_day,
    start_lat: body.start_lat,
    start_lng: body.start_lng,
    start_address: body.start_address || null,
  };
}

function toTripCategoryRows(tripId: string, categoryIds: string[]) {
  return categoryIds.map((categoryId) => ({ trip_id: tripId, category_id: categoryId }));
}

export const createTrip = async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const body = req.body as TripBody;
  const validationError = validateTripBody(body, "กรุณาปักหมุดจุดเริ่มต้นก่อนสร้างทริป");
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const { data, error } = await supabase
      .from("trips")
      .insert([{ user_id: userId, ...toTripColumns(body) }])
      .select()
      .single();

    if (error) {
      console.error("Create trip error:", error);
      return res.status(500).json({ message: error.message });
    }

    // บันทึกหมวดไม่สำเร็จไม่ยกเลิกทริป แค่แจ้งผู้ใช้
    let categoryWarning = false;
    const { category_ids } = body;

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const { error: categoryError } = await supabase
        .from("trip_categories")
        .insert(toTripCategoryRows(data.trip_id, category_ids));

      if (categoryError) {
        console.error("Insert trip_categories error:", categoryError.message);
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
  } catch (err) {
    console.error("Create trip exception:", err);
    return res.status(500).json({ message: errorMessage(err) || INTERNAL_ERROR });
  }
};

export const getMyTrips = async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ message: error.message });
  res.json({ trips: data });
};

interface TripCategoryRow {
  category: { category_id: string; category_name: string };
}

// ทริปเดียวพร้อมหมวดที่เลือกไว้ (หน้ารายละเอียดและหน้าแก้ทริป)
export const getTripById = async (req: AuthRequest, res: Response) => {
  const params = requireTripParams(req, res);
  if (!params) return;
  const { userId, tripId } = params;

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
  if (!data) return res.status(404).json({ message: "ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง" });

  // ดึงหมวดไม่สำเร็จ -> ส่ง array ว่าง ไม่ให้ทั้ง endpoint ล้ม
  const { data: categoryData, error: categoryFetchError } = await supabase
    .from("trip_categories")
    .select(`
    category:categories (
      category_id,
      category_name
    )
  `)
    .eq("trip_id", tripId);

  if (categoryFetchError) {
    console.error("Get trip_categories error:", categoryFetchError.message);
  }

  const categoryRows = (categoryData ?? []) as unknown as TripCategoryRow[];

  res.json({
    trip: {
      ...data,
      category_ids: categoryRows.map((row) => row.category.category_id),
      categories: categoryRows.map((row) => row.category),
    },
  });
};

// แก้ทริป — หมวดเดิมลบแล้วบันทึกใหม่ · ถ้าวัน/เวลา/งบต่อวันเปลี่ยน ล้าง trip_days (แผนเดิมถูกลบตาม)
export const updateTrip = async (req: AuthRequest, res: Response) => {
  const params = requireTripParams(req, res);
  if (!params) return;
  const { userId, tripId } = params;

  const body = req.body as TripBody;
  const validationError = validateTripBody(body, "กรุณาปักหมุดจุดเริ่มต้นก่อนบันทึกทริป");
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const { data: before, error: beforeError } = await supabase
      .from("trips")
      .select(DAY_STRUCTURE_FIELDS.join(", "))
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();

    if (beforeError) {
      console.error("Load trip before update error:", beforeError);
      return res.status(500).json({ message: "ไม่สามารถบันทึกการแก้ไขทริปได้" });
    }
    if (!before) return res.status(404).json({ message: "ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์แก้ไข" });

    const { data, error } = await supabase
      .from("trips")
      .update(toTripColumns(body))
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Update trip error:", error);
      return res.status(500).json({ message: error.message });
    }
    if (!data) return res.status(404).json({ message: "ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์แก้ไข" });

    let categoryWarning = false;
    const { category_ids } = body;

    const { error: deleteCategoryError } = await supabase
      .from("trip_categories")
      .delete()
      .eq("trip_id", tripId);

    if (deleteCategoryError) {
      console.error("Delete old trip_categories error:", deleteCategoryError.message);
      categoryWarning = true;
    } else if (Array.isArray(category_ids) && category_ids.length > 0) {
      const { error: insertCategoryError } = await supabase
        .from("trip_categories")
        .insert(toTripCategoryRows(tripId, category_ids));

      if (insertCategoryError) {
        console.error("Insert trip_categories error:", insertCategoryError.message);
        categoryWarning = true;
      }
    }

    // trip_days ไม่ sync ตามทริป จึงล้างทิ้ง แล้วรอบหน้าที่จัดแผนจะสร้างวันใหม่จากข้อมูลล่าสุด
    let planReset = false;
    let planResetWarning = false;

    if (dayStructureChanged(before as unknown as DayStructure, data as DayStructure)) {
      const { error: resetError } = await supabase
        .from("trip_days")
        .delete()
        .eq("trip_id", tripId);

      if (resetError) {
        console.error("Reset trip_days error:", resetError.message);
        planResetWarning = true;
      } else {
        planReset = true;
      }
    }

    return res.status(200).json({
      message: planResetWarning
        ? "บันทึกทริปสำเร็จ แต่ล้างแผนเดิมไม่สำเร็จ วันและเวลาของแผนอาจยังเป็นค่าเก่า กรุณาลองบันทึกอีกครั้ง"
        : categoryWarning
        ? "บันทึกทริปสำเร็จ แต่บันทึกหมวดหมู่ความสนใจไม่สำเร็จ กรุณาลองแก้ไขอีกครั้ง"
        : "บันทึกการแก้ไขทริปสำเร็จ",
      trip: data,
      categoryWarning,
      planReset,
      planResetWarning,
    });
  } catch (err) {
    console.error("Update trip exception:", err);
    return res.status(500).json({ message: errorMessage(err) || INTERNAL_ERROR });
  }
};

// บันทึกหมวดของทริปเป็นชุดที่ส่งมา (popup ของ Auto Trip) — เพิ่มที่ขาดก่อนแล้วค่อยลบที่เกิน
// ถ้าล้มกลางทางหมวดเดิมจะไม่หาย
export const updateTripCategories = async (req: AuthRequest, res: Response) => {
  const params = requireTripParams(req, res);
  if (!params) return;
  const { userId, tripId } = params;

  const parsed = parseCategoryIds((req.body as { category_ids?: unknown } | undefined)?.category_ids);
  if ("error" in parsed) return res.status(400).json({ message: parsed.error });
  const { ids } = parsed;
  const failMessage = "บันทึกหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";

  try {
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .select("trip_id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();

    if (tripError) {
      console.error("Load trip for categories error:", tripError);
      return res.status(500).json({ message: failMessage });
    }
    if (!trip) return res.status(404).json({ message: "ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์แก้ไข" });

    const { data: found, error: categoriesError } = await supabase
      .from("categories")
      .select("category_id")
      .in("category_id", ids);

    if (categoriesError) {
      console.error("Load categories error:", categoriesError);
      return res.status(500).json({ message: failMessage });
    }
    if ((found ?? []).length !== ids.length) {
      return res.status(400).json({ message: "มีหมวดหมู่ที่ไม่มีอยู่ในระบบ" });
    }

    const { data: existing, error: existingError } = await supabase
      .from("trip_categories")
      .select("trip_category_id, category_id")
      .eq("trip_id", tripId);

    if (existingError) {
      console.error("Load trip_categories error:", existingError);
      return res.status(500).json({ message: failMessage });
    }

    const { toAdd, toRemoveRowIds } = diffTripCategories((existing ?? []) as TripCategoryLink[], ids);

    if (toAdd.length > 0) {
      const { error: insertError } = await supabase
        .from("trip_categories")
        .insert(toTripCategoryRows(tripId, toAdd));

      if (insertError) {
        console.error("Insert trip_categories error:", insertError);
        return res.status(500).json({ message: failMessage });
      }
    }

    if (toRemoveRowIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("trip_categories")
        .delete()
        .eq("trip_id", tripId)
        .in("trip_category_id", toRemoveRowIds);

      if (deleteError) {
        console.error("Delete trip_categories error:", deleteError);
        return res.status(500).json({ message: failMessage });
      }
    }

    return res.json({ message: "บันทึกหมวดหมู่สำเร็จ", category_ids: ids });
  } catch (err) {
    console.error("Update trip categories exception:", err);
    return res.status(500).json({ message: failMessage });
  }
};

// ลบทริปของผู้ใช้เอง — trip_days / trip_categories / poi_scores ลบตามด้วย FK CASCADE
export const deleteTrip = async (req: AuthRequest, res: Response) => {
  const params = requireTripParams(req, res);
  if (!params) return;
  const { userId, tripId } = params;

  const { error, count } = await supabase
    .from("trips")
    .delete({ count: "exact" })
    .eq("trip_id", tripId)
    .eq("user_id", userId);

  if (error) {
    console.error("Delete trip error:", error.message);
    return res.status(500).json({ message: error.message });
  }
  if (!count) return res.status(404).json({ message: "ไม่พบทริปนี้ หรือคุณไม่มีสิทธิ์ลบ" });

  res.json({ message: "ลบทริปสำเร็จ" });
};
