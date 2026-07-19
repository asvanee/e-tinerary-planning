import { supabase } from "../../config/db";
import { OpeningHours } from "../../utils/openingHoursChecker";

// ---------- Types ----------

export interface TripDay {
  tripDayId: number;
  dayNumber: number;
  visitDate: string; // "YYYY-MM-DD"
  startTime: string | null; // "HH:MM:SS" — null ถ้า trips.start_time ไม่มี (ไม่ควรเกิดจริงเพราะ createTrip บังคับกรอก)
  endTime: string | null; // "HH:MM:SS" — null ถ้า trips.available_time_per_day เป็น null
  dailyBudget: number | null; // copy จาก trips.daily_budget ตรงๆ ทุกวัน (คำนวณเสร็จจาก frontend แล้ว)
  // ✅ เพิ่มใหม่ — copy จาก trips.use_budget ตรงๆ ทุกวันเหมือน dailyBudget เพื่อให้
  // itineraryBuilder.ts::buildDayItems เช็ค isBudgetConflict จาก "ทริปนี้เลือกใช้งบไหม" ตรงๆ
  // ไม่ใช่เดาจาก dailyBudget !== null เฉยๆ (เปราะบางถ้าในอนาคตมี daily_budget ค้างอยู่ทั้งที่
  // useBudget = false — เช่น bug ฝั่งไหนไม่เคลียร์ค่าตอน toggle ปิด)
  useBudget: boolean;
}

export interface SelectedPlace {
  placeId: string;
  latitude: number;
  longitude: number;
  // ✅ coalesce กับ categories.default_price_level เสมอแล้ว (ดู getSelectedPlaces ด้านล่าง)
  // ไม่ nullable อีกต่อไป — ตรงกับ poiPlaceQueries.ts::PlaceWithScore.priceLevel
  priceLevel: number;
  // เก็บไว้เผื่อ UI อยากแยกแสดง "ราคาโดยประมาณ" vs "ราคาจริง" — ไม่ได้ใช้ตัดสินใจเรื่อง
  // cumulativeCost/isBudgetConflict แล้ว (นับ cost เสมอทั้งสองกรณี ดูคอมเมนต์ getSelectedPlaces)
  hasPriceLevel: boolean;
  openingHours: OpeningHours | null;
  defaultDurationMin: number; // จาก categories.default_duration_min ผ่าน place_categories
}

// ---------- Helpers ----------

/**
 * แปลง "HH:MM" หรือ "HH:MM:SS" -> นาทีนับจากเที่ยงคืน
 */
function timeStringToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * แปลงนาทีนับจากเที่ยงคืน -> "HH:MM:SS"
 * ⚠️ กรณีพอดี 1440 นาที (เที่ยงคืนพอดี, ผ่าน validateNoMidnightCrossing ที่ tripController.ts เพราะเช็คแค่ `> 1440`)
 * cap ไว้ที่ 23:59:59 กัน Postgres time type รับค่าประหลาด — ถือเป็น edge case ที่ไม่ควรเกิดบ่อยในทางปฏิบัติ
 */
function minutesToTimeString(totalMinutes: number): string {
  const capped = Math.min(totalMinutes, 24 * 60 - 1);
  const hh = Math.floor(capped / 60);
  const mm = capped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

/**
 * สร้าง array ของวันที่ "YYYY-MM-DD" ระหว่าง startDate ถึง endDate (inclusive)
 * ใช้ Date.UTC ล้วนกันปัญหา timezone เลื่อนวันตอน format กลับ
 */
function enumerateDates(startDate: string, endDate: string): string[] {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);

  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);

  const dates: string[] = [];
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

export interface TripOwnerAndStart {
  userId: string;
  startLat: number;
  startLng: number;
}

/**
 * ดึง user_id (เช็คสิทธิ์เจ้าของทริป) + start_lat/start_lng (ใช้เป็นจุดเริ่มต้นของ
 * Nearest-Neighbor TSP ordering ใน itineraryBuilder.ts) — ใช้ตอนเข้า endpoint build-draft/confirm
 */
export async function getTripOwnerAndStart(tripId: string): Promise<TripOwnerAndStart | null> {
  const { data, error } = await supabase
    .from("trips")
    .select("user_id, start_lat, start_lng")
    .eq("trip_id", tripId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    userId: data.user_id,
    startLat: data.start_lat,
    startLng: data.start_lng,
  };
}

// ---------- Queries ----------

/**
 * ดึง trip_days ของ trip นี้ ถ้ายังไม่มี (ยังไม่เคยกด "จัดเส้นทาง" มาก่อน) จะสร้างให้ครบทุกวัน
 * ตาม trips.start_date -> trips.end_date แล้ว insert รอบเดียว
 *
 * เจตนา: lazy-create ตอนกด build-draft ครั้งแรก ไม่สร้างตั้งแต่ตอน createTrip
 * (ตาม PROJECT_BRIEF.md: คำนวณ business logic ที่ frontend จุดเดียว — daily_budget ที่ trips
 * เป็นค่าสำเร็จรูปแล้ว จึง copy ตรงๆ ทุกวัน ไม่มีสูตรหารเพิ่มฝั่ง backend)
 *
 * Unique constraint (trip_id, day_number) ที่มีอยู่แล้วช่วยกัน insert ซ้ำถ้ามี race condition
 * แต่ในทางปฏิบัติเช็ค existing ก่อนแล้วจึงไม่ควรชนบ่อย
 */
export async function getOrCreateTripDays(tripId: string): Promise<TripDay[]> {
  // ✅ ดึง use_budget ของทริปนี้ไว้ก่อนเลย ต้องแนบไปกับทุก TripDay เสมอ (ทั้ง 2 branch ด้านล่าง —
  // ไม่ว่า trip_days จะเคยถูกสร้างไว้แล้วหรือเพิ่งสร้างรอบนี้) ดูเหตุผลที่ TripDay.useBudget ด้านบน
  const { data: tripMeta, error: tripMetaError } = await supabase
    .from("trips")
    .select("use_budget")
    .eq("trip_id", tripId)
    .single();

  if (tripMetaError || !tripMeta) {
    throw new Error(
      `ดึงข้อมูลทริปไม่สำเร็จ: ${tripMetaError?.message ?? "ไม่พบทริป"}`
    );
  }

  const useBudget = tripMeta.use_budget ?? false;

  // 1. เช็คว่ามี trip_days อยู่แล้วหรือยัง
  const { data: existingRows, error: existingError } = await supabase
    .from("trip_days")
    .select("trip_day_id, day_number, visit_date, start_time, end_time, daily_budget")
    .eq("trip_id", tripId)
    .order("day_number", { ascending: true });

  if (existingError) {
    throw new Error(`ดึง trip_days ไม่สำเร็จ: ${existingError.message}`);
  }

  if (existingRows && existingRows.length > 0) {
    return existingRows.map((row) => mapTripDayRow(row, useBudget));
  }

  // 2. ยังไม่มี -> ดึงข้อมูล trips มาคำนวณแล้วสร้างให้ครบทุกวัน
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("start_date, end_date, start_time, available_time_per_day, daily_budget")
    .eq("trip_id", tripId)
    .single();

  if (tripError || !trip) {
    throw new Error(
      `ดึงข้อมูลทริปเพื่อสร้าง trip_days ไม่สำเร็จ: ${tripError?.message ?? "ไม่พบทริป"}`
    );
  }

  const dates = enumerateDates(trip.start_date, trip.end_date);

  const startMinutes = timeStringToMinutes(trip.start_time);
  const endTime: string | null =
    trip.available_time_per_day === null || trip.available_time_per_day === undefined
      ? null
      : minutesToTimeString(startMinutes + trip.available_time_per_day * 60);

  const rowsToInsert = dates.map((visitDate, index) => ({
    trip_id: tripId,
    day_number: index + 1,
    visit_date: visitDate,
    start_time: trip.start_time,
    end_time: endTime,
    daily_budget: trip.daily_budget,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("trip_days")
    .insert(rowsToInsert)
    .select("trip_day_id, day_number, visit_date, start_time, end_time, daily_budget");

  if (insertError) {
    throw new Error(`สร้าง trip_days ไม่สำเร็จ: ${insertError.message}`);
  }

  return (insertedRows ?? [])
    .map((row) => mapTripDayRow(row, useBudget))
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

function mapTripDayRow(row: any, useBudget: boolean): TripDay {
  return {
    tripDayId: row.trip_day_id,
    dayNumber: row.day_number,
    visitDate: row.visit_date,
    startTime: row.start_time,
    endTime: row.end_time,
    dailyBudget: row.daily_budget,
    useBudget,
  };
}

/**
 * ดึงข้อมูลสถานที่ที่ user เลือกจากหน้า POI list (place_ids[])
 * join place_categories <- categories เอา default_duration_min มาด้วย (เหมือน pattern ใน poiPlaceQueries.ts)
 *
 * ✅ เช็คแล้วด้วย SQL จริง (689/689 places มี category ครบ 100%, "places_without_category" = 0)
 * pipeline คำนวณ place_categories จาก att_type_label เสร็จสมบูรณ์แล้ว — ไม่มีเคส place ที่เลือกมา
 * แล้วไม่มี category เลยในทางปฏิบัติ จึงไม่ต้องมี fallback/throw พิเศษสำหรับเคสนี้
 * (`!inner` join จึงปลอดภัย ไม่ต้องกังวลว่าจะดรอปสถานที่ที่ user เลือกไว้แบบเงียบๆ)
 * — หมายเหตุ: 689/689 พูดถึงแค่ "มี category อย่างน้อย 1 อัน" คนละเรื่องกับ "มีมากกว่า 1
 * category" ที่แก้ด้านล่าง (ดู multi-category dedupe)
 *
 * ✅ แก้บั๊ก (sync กับ poiPlaceQueries.ts::queryPlacesWithCategoryInfo): เดิม query นี้ไม่ group
 * by place_id เลย — เชียงใหม่ผ่าน Stage 3 แล้ว (DATA_PREPARATION_4.md หัวข้อ 8.2) place หนึ่ง
 * มีได้หลาย category จริง ทำให้ query คืนหลายแถวซ้ำ place_id เดียวกัน (แถวละ
 * default_duration_min ต่างกันไปตาม category) แล้ว `new Map(places.map(p => [p.placeId, p]))`
 * ที่ itineraryController.ts (ทั้ง buildDraft และ confirmItinerary) จะเก็บแค่แถวสุดท้ายที่ query
 * คืนมาแบบสุ่ม (ลำดับจาก Supabase ไม่การันตี) ทำให้ duration ที่ใช้คำนวณตารางเวลาจริงเพี้ยน
 * ไม่คงที่ — และไม่ตรงกับ duration ที่ user เห็นตอนอยู่หน้า POI list ด้วย (ฝั่งนั้นใช้ MAX
 * confidence_score เลือก category ตัวแทนแล้ว) ตอนนี้ group by place_id แล้วเลือกแถวที่
 * confidence_score สูงสุดเป็นตัวแทน — เกณฑ์เดียวกับ poiPlaceQueries.ts เป๊ะ เพื่อให้
 * duration/ราคาที่เห็นตอน POI list กับตอนจัด itinerary เป็นตัวเลขเดียวกันเสมอ
 *
 * ✅ มติล่าสุด (sync กับ poiPlaceQueries.ts): coalesce price_level กับ categories.default_price_level
 * เสมอ เหมือนฝั่ง POI stage — เหตุผล: สถานที่กลุ่มที่ไม่มีราคาจริงถูกกรอง/คิดคะแนนด้วยราคา default
 * ของหมวดหมู่มาตั้งแต่ตอนแนะนำในหน้า POI list แล้ว (เมื่อ trip.useBudget = true) พอมาถึงขั้นจัด
 * itinerary ก็ต้องคิดราคาต่อเนื่องด้วยตัวเลขเดียวกัน ไม่ใช่จู่ๆ กลายเป็น 0 บาท (ฟรี) เพราะจะทำให้
 * isBudgetConflict ที่คำนวณตอน confirm ไม่ตรงกับที่ user เห็นตอนเลือกสถานที่มาจากหน้า POI list
 * (เดิมเคยตัดสินใจไม่ coalesce ที่นี่ — มติเปลี่ยนแล้ว ให้ตรงกับ poiPlaceQueries.ts เป๊ะ)
 * hasPriceLevel ยังคงส่งกลับไว้ (เผื่อ UI อยากแสดง badge "ราคาโดยประมาณ" แยกจากราคาจริง)
 * แต่ไม่ได้ใช้ตัดสินใจว่าจะนับ cost เข้า cumulativeCost หรือไม่แล้ว — นับเสมอทั้งสองกรณี
 */
export async function getSelectedPlaces(placeIds: string[]): Promise<SelectedPlace[]> {
  if (placeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("place_categories")
    .select(
      "confidence_score, categories!inner(default_duration_min, default_price_level), places!inner(place_id, latitude, longitude, price_level, opening_hours)"
    )
    .in("place_id", placeIds);

  if (error) {
    throw new Error(`ดึงข้อมูลสถานที่ที่เลือกไม่สำเร็จ: ${error.message}`);
  }

  // ✅ Multi-category dedupe — group by place_id แล้วเลือกแถวที่ confidence_score สูงสุด
  // (เกณฑ์เดียวกับ poiPlaceQueries.ts::queryPlacesWithCategoryInfo) กัน place เดียวกันโผล่ซ้ำ
  // และกัน defaultDurationMin/priceLevel สุ่มมาจากคนละ category ทุกครั้งที่ query
  const bestRowByPlaceId = new Map<string, any>();

  // ✅ แก้ TS2339: (data ?? []) ที่ไม่ cast จะโดน Supabase infer ว่า row.places เป็น array
  // (relation ไม่ได้ตั้ง one-to-one ชัดเจน) ทั้งที่รันจริงเป็น object เดี่ยว — cast เป็น any[]
  // ตรงนี้เหมือนกับที่ .map((row: any) => ...) ด้านล่างทำอยู่แล้ว ให้ทั้งไฟล์สม่ำเสมอกัน
  for (const row of (data ?? []) as any[]) {
    const placeId = row.places.place_id;
    const existing = bestRowByPlaceId.get(placeId);

    if (
      !existing ||
      (row.confidence_score ?? 0) > (existing.confidence_score ?? 0)
    ) {
      bestRowByPlaceId.set(placeId, row);
    }
  }

  return Array.from(bestRowByPlaceId.values()).map((row: any) => {
    const rawPriceLevel: number | null = row.places.price_level;
    const effectivePriceLevel: number =
      rawPriceLevel ?? row.categories.default_price_level ?? 0;
    return {
      placeId: row.places.place_id,
      latitude: row.places.latitude,
      longitude: row.places.longitude,
      priceLevel: effectivePriceLevel,
      hasPriceLevel: rawPriceLevel !== null,
      openingHours: row.places.opening_hours,
      defaultDurationMin: row.categories.default_duration_min ?? 60,
    };
  });
}