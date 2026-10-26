import { supabase } from "../../config/db";
import { getPlaceCost } from "../../utils/placePrice";

// ค่าของ categories.price_nature
export type PriceNature = "free" | "paid";

// ค่าของ categories.environment_type — poiScoreCalculator.ts แปลงเป็นสัดส่วนที่โดนฝน
export type EnvironmentType = "INDOOR" | "OUTDOOR" | "MIXED";

export interface TripInfo {
  userId: string;
  // tripController.ts บังคับกรอก province · district ไม่บังคับ (null = ไม่กรองอำเภอ)
  province: string | null;
  district: string | null;
  startLat: number;
  startLng: number;
  dailyBudget: number | null; // งบต่อคนต่อวัน (D-51)
  availableTimePerDay: number | null; // ชั่วโมง ตาม schema ของ trips
  useBudget: boolean;
  // ช่วงวันเดินทาง "YYYY-MM-DD" — ใช้ดึงโอกาสฝนเฉลี่ย (utils/weatherForecast.ts)
  startDate: string;
  endDate: string;
}

export interface PlaceWithScore {
  placeId: string;
  latitude: number;
  longitude: number;
  rating: number | null;

  // priceRange ต่อคน (บาท) จาก Places API (New) — D-52 · ใช้คิดราคาผ่าน utils/placePrice.ts
  priceRangeStart: number | null;
  priceRangeEnd: number | null;

  // ค่าของหมวดที่ได้จากป้าย ททท. ของสถานที่ (1 สถานที่ = 1 หมวด — D-35)
  priceNature: PriceNature;
  categoryId: string;
  // true = อยู่ในหมวดที่ผู้ใช้เลือก · false = หมวดอื่นที่เติมเข้ามา · null = ผู้ใช้ไม่ได้เลือกหมวด (D-48)
  categoryMatch: boolean | null;
  categoryName: string;
  environmentType: EnvironmentType; // ใช้คำนวณ weather_score
}

// จำนวนสถานที่แนะนำที่แสดง และเกณฑ์ว่าหมวดที่เลือกมี "พอ" หรือไม่ (D-48)
export const POI_RESULT_LIMIT = 50;

interface FilteredPlacesResult {
  places: PlaceWithScore[];
  // จำนวนสถานที่ที่ตรงหมวดที่เลือก (หลังกรองงบ) · null = ผู้ใช้ไม่ได้เลือกหมวด
  categoryMatchCount: number | null;
  // true = ตรงหมวดไม่ถึง POI_RESULT_LIMIT จึงเติมสถานที่หมวดอื่นในพื้นที่เข้ามาคิดคะแนนด้วย
  categoryFilled: boolean;
}

/**
 * ข้อมูลทริปที่ใช้คำนวณ POI score และ hard filter งบ/เวลา
 */
export async function getTripInfo(tripId: string): Promise<TripInfo | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "user_id, province, district, start_lat, start_lng, daily_budget, available_time_per_day, use_budget, start_date, end_date"
    )
    .eq("trip_id", tripId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    userId: data.user_id,
    province: data.province,
    district: data.district,
    startLat: data.start_lat,
    startLng: data.start_lng,
    dailyBudget: data.daily_budget,
    availableTimePerDay: data.available_time_per_day,
    useBudget: data.use_budget ?? false,
    startDate: data.start_date,
    endDate: data.end_date,
  };
}

/**
 * Pipeline กรองสถานที่ ทำตามลำดับ ห้ามสลับ:
 * 1. province (บังคับเสมอ) + AND district ถ้า user ระบุมา
 * 2. งบ (hard filter): ตัดสถานที่ที่ place_cost > daily_budget
 *    (ข้ามถ้าไม่ได้ใช้งบ หรือเป็น paid ที่ไม่มีราคาจริง — ไม่เดาราคาแทน user)
 * 3. category (ถ้า user เลือกไว้ — D-48): นับสถานที่ที่ตรงหมวด (หลังกรองงบ)
 *    - ตรง ≥ POI_RESULT_LIMIT → เหลือเฉพาะที่ตรงหมวด
 *    - ตรง < POI_RESULT_LIMIT (รวม 0) → เก็บทุกที่ในพื้นที่ ที่ไม่ตรงหมวดได้ category_score 0
 * (ขั้นกรองเวลาเดิมตัดออกแล้ว — D-38: เวลาที่อยู่ผู้ใช้กรอกเอง ตรวจใน ItineraryEditor)
 * ผลลัพธ์เหมือนกรองหมวดก่อนงบ เพราะงบตัดรายสถานที่ไม่ขึ้นกับหมวด — แต่ต้องนับหมวดหลังงบ
 */
export async function getFilteredPlaces(
  tripId: string,
  trip: TripInfo
): Promise<FilteredPlacesResult> {
  // กันข้อมูลเก่าที่ไม่มี province (ปัจจุบันบังคับกรอกเสมอ)
  if (!trip.province) {
    return { places: [], categoryMatchCount: null, categoryFilled: false };
  }

  const locationFilter: LocationFilter = {
    province: trip.province,
    district: trip.district, // null = กรองแค่ province
  };

  const { data: tripCategories, error: tripCategoriesError } = await supabase
    .from("trip_categories")
    .select("category_id")
    .eq("trip_id", tripId);

  if (tripCategoriesError) {
    throw new Error(
      `ดึง trip_categories ไม่สำเร็จ: ${tripCategoriesError.message}`
    );
  }

  const categoryIds = new Set(
    (tripCategories ?? []).map((row) => row.category_id as string)
  );

  // ---- ขั้น 1: province (+district ถ้ามี) ----
  let places = await queryPlacesWithCategoryInfo(locationFilter);

  // ---- ขั้น 2: กรองงบ (hard filter) ----
  // trips.daily_budget เป็นงบต่อคนต่อวันที่ frontend คำนวณตาม budget_scope/budget_period มาแล้ว (D-01, D-51)
  // เทียบกับราคาต่อคนตรงๆ ให้ตรงกับ itineraryBuilder.ts (เทียบ cumulativeCost กับ day.dailyBudget)
  // ไม่งั้นผลตอนเลือก POI กับตอนจัดแผนจะขัดกัน
  if (trip.useBudget && trip.dailyBudget !== null) {
    const dailyBudget = trip.dailyBudget;

    places = places.filter((place) => {
      const placeCost = getPlaceCost(
        place.priceRangeStart,
        place.priceRangeEnd,
        place.priceNature
      );
      if (placeCost === null) return true; // paid + ไม่รู้ราคาจริง — ปล่อยผ่าน ไม่เดา

      return placeCost <= dailyBudget;
    });
  }

  // ---- ขั้น 3: หมวด (D-48) ----
  if (categoryIds.size === 0) {
    return { places, categoryMatchCount: null, categoryFilled: false };
  }

  places = places.map((place) => ({
    ...place,
    categoryMatch: categoryIds.has(place.categoryId),
  }));

  const matched = places.filter((place) => place.categoryMatch);

  if (matched.length >= POI_RESULT_LIMIT) {
    return { places: matched, categoryMatchCount: matched.length, categoryFilled: false };
  }

  return { places, categoryMatchCount: matched.length, categoryFilled: true };
}

interface LocationFilter {
  province: string;
  district: string | null;
}

interface PlaceCategoryRow {
  place_id: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  price_range_start: number | null;
  price_range_end: number | null;
  category_labels: {
    category_id: string;
    categories: {
      price_nature: PriceNature;
      category_name: string;
      environment_type: EnvironmentType;
    };
  };
}

/**
 * หมวดของสถานที่มาจากป้าย ททท.: places.att_type_label -> category_labels -> categories (D-35, D-39)
 * `!inner` ตัดสถานที่ที่ไม่มีป้าย/หมวดออก · 1 สถานที่ได้ 1 แถวเสมอ
 * กรองแค่ location (province + district ถ้ามี) — การจับคู่หมวดทำใน getFilteredPlaces (D-48)
 */
async function queryPlacesWithCategoryInfo(
  locationFilter: LocationFilter
): Promise<PlaceWithScore[]> {
  let query = supabase
    .from("places")
    .select(
      "place_id, latitude, longitude, rating, price_range_start, price_range_end, category_labels!inner(category_id, categories!inner(price_nature, category_name, environment_type))"
    )
    .eq("province", locationFilter.province);

  if (locationFilter.district) {
    query = query.eq("district", locationFilter.district);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`ดึงสถานที่ตามหมวดไม่สำเร็จ: ${error.message}`);
  }

  // Supabase infer embed เป็น array แต่ relation นี้คืน object เดี่ยวจริง
  const rows = (data ?? []) as unknown as PlaceCategoryRow[];

  return rows.map((row) => {
    const category = row.category_labels.categories;
    return {
      placeId: row.place_id,
      latitude: row.latitude,
      longitude: row.longitude,
      rating: row.rating,

      priceRangeStart: row.price_range_start,
      priceRangeEnd: row.price_range_end,
      priceNature: category.price_nature,

      categoryId: row.category_labels.category_id,
      categoryMatch: null, // getFilteredPlaces ใส่ค่าจริงเมื่อผู้ใช้เลือกหมวด

      categoryName: category.category_name,

      environmentType: category.environment_type,
    };
  });
}
