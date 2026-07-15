import { supabase } from "../../config/db";
import { PRICE_LEVEL_TO_BAHT } from "../../utils/priceLevel";

export interface TripInfo {
  userId: string;
  // ✅ เปลี่ยนชื่อ field จาก city เป็น district แล้ว (rename ทั้งระบบ) ตอนนี้ชื่อตรงกับ
  // places.district ที่ query จริงพอดี ไม่ต้องเดาอีกต่อไปว่า trips.city ควร map ไปคอลัมน์ไหน
  // ✅ อัปเดตล่าสุด: tripController.ts บังคับกรอก province เสมอ (ไม่ nullable จริงในทางปฏิบัติ)
  // ส่วน district ยังเลือกกรอกเพิ่มหรือไม่ก็ได้ (nullable) — type ยังคง `string | null` ไว้เผื่อ
  // ข้อมูลเก่าก่อนเปลี่ยนกฎ แต่ getFilteredPlaces() ด้านล่างจะเจอ location filter เป็น province
  // เสมอในทางปฏิบัติ ไม่มีทาง fallback ไป district-only หรือ return ว่างเปล่าจริงๆ อีกต่อไป
  province: string | null;
  district: string | null;
  startLat: number;
  startLng: number;
  dailyBudget: number | null;
  numberOfPeople: number;
  // ✅ แก้แล้ว: nullable เพราะ tripController.ts ไม่ได้บังคับกรอก available_time_per_day
  availableTimePerDay: number | null; // ชั่วโมง ตาม schema ของ trips
  useBudget: boolean;
}

export interface PlaceWithScore {
  placeId: string;
  latitude: number;
  longitude: number;
  rating: number | null;

  priceLevel: number;

  confidenceScore: number | null;
  defaultDurationMin: number;
  categoryName: string;
}

export interface FilteredPlacesResult {
  places: PlaceWithScore[];
  categoryFallbackUsed: boolean; // true = เคยมี category_ids แต่กรองแล้วเหลือ 0 ที่ เลยตัด category filter ออก
}

/**
 * ดึงข้อมูลทริปที่จำเป็นสำหรับคำนวณ POI score และ hard filter งบ/เวลา
 */
export async function getTripInfo(tripId: string): Promise<TripInfo | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(
  "user_id, province, district, start_lat, start_lng, daily_budget, number_of_people, available_time_per_day, use_budget"
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
  numberOfPeople: data.number_of_people,
  availableTimePerDay: data.available_time_per_day,
  useBudget: data.use_budget ?? false,
};
}

/**
 * Pipeline กรองสถานที่ ตาม PROJECT_BRIEF_v4.md ข้อ 4.1 + 4.5 (แก้ไขใหม่) ทำตามลำดับ ห้ามสลับ:
 * 1. กรอง province (บังคับเสมอ) + กรอง district ซ้อนแบบ AND ถ้า user ระบุมา
 * 2. กรอง category (ถ้า user เลือกไว้) พร้อม fallback ถ้ากรองแล้วเหลือ 0 ที่
 * 3. กรองงบ (hard filter): ตัดสถานที่ที่ place_cost > per_person_daily_budget
 *    (ข้ามถ้า daily_budget null "หรือ" ถ้าสถานที่นั้นไม่มี price_level จริง — ดู hasPriceLevel)
 * 4. กรองเวลา (hard filter): ตัดสถานที่ที่ default_duration_min > available_time_per_day (แปลงเป็นนาที)
 *
 * ✅ แก้บั๊ก: เดิม locationFilter เลือกกรองแค่ field เดียว (province "หรือ" district) ทำให้พอ
 * province มีค่า (ซึ่งมีเสมอเพราะบังคับกรอก) district ที่ user ระบุมาด้วยไม่ถูกกรองเลย
 * (เช่น เลือก ชลบุรี/เมืองชลบุรี แต่ได้ผลลัพธ์จากอำเภอสัทหีบปนมาด้วย) ตอนนี้กรอง province เสมอ
 * + AND ด้วย district ถ้ามีค่า ตรงตามมติที่ปิดไว้ใน itineraries_feature_status.md
 */
export async function getFilteredPlaces(
  tripId: string,
  trip: TripInfo
): Promise<FilteredPlacesResult> {
  // หมายเหตุ: tripController.ts บังคับกรอก province เสมอตอนสร้างทริป ดังนั้น branch
  // province === null ด้านล่างเป็น defensive fallback เผื่อข้อมูลเก่าก่อนเปลี่ยนกฎ
  // (หรือแก้ trip ตรงๆ ผ่าน DB) ในทางปฏิบัติปัจจุบันจะมี province เสมอ
  if (!trip.province) {
    return { places: [], categoryFallbackUsed: false };
  }

  const locationFilter: LocationFilter = {
    province: trip.province,
    district: trip.district, // null ได้ — แปลว่าไม่กรอง district เพิ่ม กรองแค่ province พอ
  };

  // ---- ขั้น 1-2: province (+district ถ้ามี) + category (พร้อม fallback) ----
  const { data: tripCategories, error: tripCategoriesError } = await supabase
    .from("trip_categories")
    .select("category_id")
    .eq("trip_id", tripId);

  if (tripCategoriesError) {
    throw new Error(
      `ดึง trip_categories ไม่สำเร็จ: ${tripCategoriesError.message}`
    );
  }

  const categoryIds = (tripCategories ?? []).map((row) => row.category_id);

  let places: PlaceWithScore[];
  let categoryFallbackUsed = false;

  if (categoryIds.length === 0) {
    places = await queryPlacesWithCategoryInfo(locationFilter, null);
  } else {
    const placesWithCategory = await queryPlacesWithCategoryInfo(
      locationFilter,
      categoryIds
    );

    if (placesWithCategory.length > 0) {
      places = placesWithCategory;
    } else {
      // Fallback: กรองแล้วเหลือ 0 ที่ -> ตัด category filter ออก เหลือกรองแค่ location
      // (province + district เดิม — ไม่ตัด district ทิ้งไปด้วย)
      places = await queryPlacesWithCategoryInfo(locationFilter, null);
      categoryFallbackUsed = true;
    }
  }

  // ---- ขั้น 3: กรองงบ (hard filter) ----
  // ⚠️ ห้ามหาร numberOfPeople ซ้ำตรงนี้ — trips.daily_budget เป็นค่าสำเร็จรูปที่ frontend
  // คำนวณตาม budget_scope/budget_period มาให้เรียบร้อยแล้ว (ตามกฎหลักของโปรเจกต์: คำนวณ
  // business logic ที่ frontend จุดเดียว) ต้องเทียบ place cost กับ trip.dailyBudget ตรงๆ
  // ให้ตรงกับ itineraryBuilder.ts (เทียบ cumulativeCost กับ day.dailyBudget ตรงๆ เช่นกัน)
  // ไม่งั้น hard filter ตอนเลือก POI กับผลจริงตอนจัด itinerary จะขัดกันเรื่องงบ
  //
  // place.priceLevel ตรงนี้คือ effectivePriceLevel ที่ผ่าน fallback มาจาก
  // queryPlacesWithCategoryInfo() แล้ว (ราคาจริงถ้ามี, ไม่งั้นใช้ categories.default_price_level)
  // ดังนั้นทุกสถานที่ถูกกรองงบด้วยตัวเลขราคาเสมอ ไม่มีสถานที่ไหนหลุดผ่าน filter นี้ไปเฉยๆ
  // เพราะ "ไม่มีข้อมูลราคา" — กรณีนั้นถือว่าใช้ราคาโดยประมาณของหมวดหมู่แทน
  if (
  trip.useBudget &&
  trip.dailyBudget !== null
) {
  const dailyBudget = trip.dailyBudget;

  places = places.filter((place) => {
    const placeCost =
      PRICE_LEVEL_TO_BAHT[place.priceLevel] ?? 0;

    return placeCost <= dailyBudget;
  });
}

  // ---- ขั้น 4: กรองเวลา (hard filter) ----
  if (trip.availableTimePerDay !== null) {
    const availableMinutes = trip.availableTimePerDay * 60;
    places = places.filter(
      (place) => place.defaultDurationMin <= availableMinutes
    );
  }

  return { places, categoryFallbackUsed };
}

interface LocationFilter {
  province: string;
  district: string | null;
}

/**
 * Join places <- place_categories <- categories เสมอ (เพื่อให้รู้ default_duration_min ทุกกรณี)
 * categoryIds = null -> ไม่กรอง category ใช้แค่ location (province + district ถ้ามี)
 * categoryIds = number[] -> กรองทั้ง location และ category_id IN (...)
 *
 * ✅ แก้บั๊ก: เดิมกรองแค่ field เดียว (province ตัดกัน district) ตอนนี้กรอง province เสมอ
 * แล้ว AND เพิ่มด้วย district ถ้า locationFilter.district ไม่ใช่ null
 */
async function queryPlacesWithCategoryInfo(
  locationFilter: LocationFilter,
  categoryIds: number[] | null
): Promise<PlaceWithScore[]> {
  let query = supabase
    .from("place_categories")
    .select(
      "confidence_score, categories!inner(default_duration_min, default_price_level, category_name), places!inner(place_id, latitude, longitude, rating, price_level, province, district)"
    )
    .eq("places.province", locationFilter.province);

  if (locationFilter.district) {
    query = query.eq("places.district", locationFilter.district);
  }

  if (categoryIds !== null) {
    query = query.in("category_id", categoryIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`ดึง place_categories ไม่สำเร็จ: ${error.message}`);
  }

  // ✅ มติปัจจุบัน: coalesce price_level กับ categories.default_price_level เสมอ
  // ("มีราคาจริงก็ใช้ราคาจริง / ไม่มีก็ใช้ default price level ของหมวดหมู่แทน")
  // effectivePriceLevel ตัวนี้ถูกใช้ทั้งใน budget hard filter (ด้านบน) และส่งต่อเข้า
  // calculatePoiScore()/calculateBudgetScore() เป็น priceLevel ตรงๆ เมื่อ useBudget = true
  // เท่านั้น — ถ้า trip.useBudget = false ค่านี้จะไม่ถูกใช้เลย (ดู poiScoreCalculator.ts)
  return (data ?? []).map((row: any) => {
    const rawPriceLevel: number | null =
  row.places.price_level;

const effectivePriceLevel =
  rawPriceLevel ??
  row.categories.default_price_level ??
  0;
    return {
  placeId: row.places.place_id,
  latitude: row.places.latitude,
  longitude: row.places.longitude,
  rating: row.places.rating,

  priceLevel: effectivePriceLevel,

  confidenceScore:
    categoryIds === null
      ? null
      : row.confidence_score,

  defaultDurationMin:
    row.categories.default_duration_min ?? 60,

  categoryName:
    row.categories.category_name,
};
  });
}