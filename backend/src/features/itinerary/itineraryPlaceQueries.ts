import { supabase } from "../../config/db";
import { OpeningHours } from "../../utils/openingHoursChecker";
import { pickBestCategoryRows } from "../../utils/bestCategoryRow";
import type { PriceNature } from "../poi/poiPlaceQueries";

// ---------- Types ----------

export interface TripDay {
  tripDayId: string;
  dayNumber: number;
  visitDate: string; // "YYYY-MM-DD"
  startTime: string | null; // "HH:MM:SS"
  endTime: string | null; // "HH:MM:SS" — null ถ้า trips.available_time_per_day เป็น null
  dailyBudget: number | null; // copy จาก trips.daily_budget ทุกวัน (frontend คำนวณมาแล้ว)
  // copy จาก trips.use_budget — buildDayItems เช็ค isBudgetConflict จากค่านี้ตรงๆ
  // ไม่เดาจาก dailyBudget !== null (กันกรณี daily_budget ค้างอยู่ทั้งที่ปิดการใช้งบ)
  useBudget: boolean;
}

export interface SelectedPlace {
  placeId: string;
  latitude: number;
  longitude: number;
  // price_level จริงจาก Google (null = ไม่มีข้อมูล) — itineraryBuilder.ts::getPlaceCost ตัดสินต่อเอง
  // (free → 0 บาท, paid → ไม่ทราบราคา ไม่เดา)
  rawPriceLevel: number | null;
  priceNature: PriceNature; // ของหมวดจากป้าย ททท. (places -> category_labels -> categories)
  openingHours: OpeningHours | null;
  // เวลาที่อยู่ไม่ได้มาจาก DB — ผู้ใช้กรอกเอง (D-36) controller ใส่ visitDurationMin ก่อนเรียก itineraryBuilder
}

export interface TripOwnerAndStart {
  userId: string;
  startLat: number;
  startLng: number;
}

export interface AutoTripPlace {
  placeId: string;
  placeName: string;
  categoryName: string;
  poiScore: number;
  latitude: number;
  longitude: number;
  openingHours: OpeningHours | null;
  defaultDurationMin: number;
  rawPriceLevel: number | null;
  priceNature: PriceNature;
}

interface TripDayRow {
  trip_day_id: string;
  day_number: number;
  visit_date: string;
  start_time: string | null;
  end_time: string | null;
  daily_budget: number | null;
}

const TRIP_DAY_COLUMNS = "trip_day_id, day_number, visit_date, start_time, end_time, daily_budget";

// ---------- Helpers ----------

/** "HH:MM" หรือ "HH:MM:SS" -> นาทีนับจากเที่ยงคืน */
function timeStringToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

/**
 * นาทีนับจากเที่ยงคืน -> "HH:MM:SS"
 * ⚠️ 1440 นาทีพอดีผ่าน validateNoMidnightCrossing (เช็คแค่ `> 1440`) จึง cap ไว้ที่ 23:59:00
 * กัน Postgres time type รับค่าประหลาด
 */
function minutesToTimeString(totalMinutes: number): string {
  const capped = Math.min(totalMinutes, 24 * 60 - 1);
  const hh = Math.floor(capped / 60);
  const mm = capped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

/**
 * วันที่ "YYYY-MM-DD" ทุกวันตั้งแต่ startDate ถึง endDate (inclusive)
 * ใช้ Date.UTC ล้วนกัน timezone เลื่อนวันตอน format กลับ
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

function mapTripDayRow(row: TripDayRow, useBudget: boolean): TripDay {
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

// ---------- Queries ----------

/**
 * user_id (ใช้เช็คเจ้าของทริป) + start_lat/start_lng (จุดเริ่มต้นของการจัดเส้นทาง)
 * null = ไม่พบทริป
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

/**
 * ดึง trip_days ของทริป ถ้ายังไม่มีจะสร้างให้ครบทุกวันตาม start_date -> end_date (insert รอบเดียว)
 * สร้างตอนจัดแผนครั้งแรก ไม่ใช่ตอน createTrip · updateTrip ลบทิ้งเมื่อวัน/เวลา/งบเปลี่ยน (D-29)
 * daily_budget ของ trips เป็นค่าสำเร็จรูปแล้ว จึง copy ตรงๆ ทุกวัน
 * unique (trip_id, day_number) กัน insert ซ้ำถ้ามี race condition
 */
export async function getOrCreateTripDays(tripId: string): Promise<TripDay[]> {
  // use_budget ต้องแนบไปกับทุก TripDay ไม่ว่าจะเพิ่งสร้างหรือมีอยู่แล้ว
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

  const { data: existingRows, error: existingError } = await supabase
    .from("trip_days")
    .select(TRIP_DAY_COLUMNS)
    .eq("trip_id", tripId)
    .order("day_number", { ascending: true });

  if (existingError) {
    throw new Error(`ดึง trip_days ไม่สำเร็จ: ${existingError.message}`);
  }

  if (existingRows && existingRows.length > 0) {
    return existingRows.map((row) => mapTripDayRow(row, useBudget));
  }

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
    .select(TRIP_DAY_COLUMNS);

  if (insertError) {
    throw new Error(`สร้าง trip_days ไม่สำเร็จ: ${insertError.message}`);
  }

  return (insertedRows ?? [])
    .map((row) => mapTripDayRow(row, useBudget))
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

interface SelectedPlaceRow {
  place_id: string;
  latitude: number;
  longitude: number;
  price_level: number | null;
  opening_hours: OpeningHours | null;
  category_labels: {
    categories: { price_nature: PriceNature };
  };
}

/**
 * ข้อมูลสถานที่ที่ user เลือก (place_ids[]) สำหรับคำนวณ itinerary
 * หมวดมาจากป้าย ททท.: places -> category_labels -> categories (เกณฑ์เดียวกับ poiPlaceQueries.ts)
 * `!inner` ตัดสถานที่ที่ไม่มีหมวดออก — confirmItinerary จะตอบ 400 "พบสถานที่บางแห่งไม่มีอยู่ในระบบ"
 */
export async function getSelectedPlaces(placeIds: string[]): Promise<SelectedPlace[]> {
  if (placeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("places")
    .select(
      "place_id, latitude, longitude, price_level, opening_hours, category_labels!inner(categories!inner(price_nature))"
    )
    .in("place_id", placeIds);

  if (error) {
    throw new Error(`ดึงข้อมูลสถานที่ที่เลือกไม่สำเร็จ: ${error.message}`);
  }

  // Supabase infer embed เป็น array แต่ relation นี้คืน object เดี่ยวจริง
  const rows = (data ?? []) as unknown as SelectedPlaceRow[];

  return rows.map((row) => ({
    placeId: row.place_id,
    latitude: row.latitude,
    longitude: row.longitude,
    rawPriceLevel: row.price_level,
    priceNature: row.category_labels.categories.price_nature,
    openingHours: row.opening_hours,
  }));
}

interface AutoTripRow {
  poi_score: number | null;
  places: {
    place_id: string;
    place_name: string;
    latitude: number;
    longitude: number;
    opening_hours: OpeningHours | null;
    price_level?: number | null;
    place_categories: AutoTripCategoryRow | AutoTripCategoryRow[];
  } | null;
}

interface AutoTripCategoryRow {
  confidence_score: number | null;
  categories: {
    category_id: string;
    category_name: string;
    default_duration_min: number | null;
    price_nature: PriceNature;
  } | null;
}

/** สถานที่จาก poi_scores ของทริป (ผลคำนวณ POI ล่าสุด) สำหรับ Auto Trip — ใช้ category ที่ confidence_score สูงสุด */
export async function getAutoTripPlaces(tripId: string): Promise<AutoTripPlace[]> {
  const { data, error } = await supabase
    .from("poi_scores")
    .select(`
      poi_score,
      places!inner(
        place_id,
        place_name,
        latitude,
        longitude,
        opening_hours,
        place_categories!inner(
          confidence_score,
          categories!inner(
            category_id,
            category_name,
            default_duration_min,
            price_nature
          )
        )
      )
    `)
    .eq("trip_id", tripId);

  if (error) {
    throw new Error(`ดึงข้อมูล Auto Trip ไม่สำเร็จ: ${error.message}`);
  }

  const result: AutoTripPlace[] = [];

  for (const row of (data ?? []) as unknown as AutoTripRow[]) {
    const place = row.places;
    if (!place) continue;

    const categories = (
      Array.isArray(place.place_categories) ? place.place_categories : [place.place_categories]
    ).filter(Boolean);

    const category = pickBestCategoryRows(categories, () => place.place_id)[0]?.categories;
    if (!category) continue;

    result.push({
      placeId: place.place_id,
      placeName: place.place_name,
      categoryName: category.category_name,
      poiScore: Number(row.poi_score ?? 0),
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      openingHours: place.opening_hours ?? null,
      defaultDurationMin: Number(category.default_duration_min ?? 60),
      // ⚠️ query ไม่ได้ select price_level จึงเป็น null เสมอ (ยังไม่มีใครใช้ค่านี้)
      rawPriceLevel: place.price_level ?? null,
      priceNature: category.price_nature,
    });
  }

  return result;
}
