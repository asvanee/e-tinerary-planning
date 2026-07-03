import { supabase } from "../../config/db";

export interface TripInfo {
  userId: string;
  // ✅ เปลี่ยนชื่อ field จาก city เป็น district แล้ว (rename ทั้งระบบ) ตอนนี้ชื่อตรงกับ
  // places.district ที่ query จริงพอดี ไม่ต้องเดาอีกต่อไปว่า trips.city ควร map ไปคอลัมน์ไหน
  // ✅ แก้แล้ว: province/district เป็น null ได้ทั้งคู่ ตาม tripController.ts ที่อนุญาตให้กรอก
  // จังหวัดหรืออำเภออย่างใดอย่างหนึ่งก็พอ (ไม่ใช่ province เป็น non-nullable เสมอแบบเดิม)
  province: string | null;
  district: string | null;
  startLat: number;
  startLng: number;
  dailyBudget: number | null;
  numberOfPeople: number;
  // ✅ แก้แล้ว: nullable เพราะ tripController.ts ไม่ได้บังคับกรอก available_time_per_day
  availableTimePerDay: number | null; // ชั่วโมง ตาม schema ของ trips
}

export interface PlaceWithScore {
  placeId: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  priceLevel: number;
  confidenceScore: number | null; // null = ไม่กรอง category เลย หรือใช้ fallback แล้ว
  defaultDurationMin: number; // จาก categories.default_duration_min ของ category ของ place
}

export interface FilteredPlacesResult {
  places: PlaceWithScore[];
  categoryFallbackUsed: boolean; // true = เคยมี category_ids แต่กรองแล้วเหลือ 0 ที่ เลยตัด category filter ออก
}

// ✅ แก้แล้ว: เพิ่ม price_level 3-4 ให้ครบตาม price_level_cost จริงใน Supabase
// (0->0, 1->200, 2->450, 3->900, 4->1500) เดิมขาด 3-4 ทำให้สถานที่ราคาแพง
// ถูกมองว่า cost = 0 บาท ผ่าน budget hard filter ไปได้ทั้งหมดทั้งที่ไม่ควรผ่าน
const PRICE_LEVEL_TO_BAHT: Record<number, number> = {
  0: 0,
  1: 200,
  2: 450,
  3: 900,
  4: 1500,
};

/**
 * ดึงข้อมูลทริปที่จำเป็นสำหรับคำนวณ POI score และ hard filter งบ/เวลา
 */
export async function getTripInfo(tripId: string): Promise<TripInfo | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "user_id, province, district, start_lat, start_lng, daily_budget, number_of_people, available_time_per_day"
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
  };
}

/**
 * Pipeline กรองสถานที่ ตาม PROJECT_BRIEF_v4.md ข้อ 4.1 + 4.5 (แก้ไขใหม่) ทำตามลำดับ ห้ามสลับ:
 * 1. กรอง province
 * 2. กรอง category (ถ้า user เลือกไว้) พร้อม fallback ถ้ากรองแล้วเหลือ 0 ที่
 * 3. กรองงบ (hard filter): ตัดสถานที่ที่ place_cost > per_person_daily_budget (ข้ามถ้า daily_budget null)
 * 4. กรองเวลา (hard filter): ตัดสถานที่ที่ default_duration_min > available_time_per_day (แปลงเป็นนาที)
 */
export async function getFilteredPlaces(
  tripId: string,
  trip: TripInfo
): Promise<FilteredPlacesResult> {
  const locationFilter = trip.province
    ? { field: "province" as const, value: trip.province }
    : trip.district
    ? { field: "district" as const, value: trip.district }
    : null;

  if (locationFilter === null) {
    return { places: [], categoryFallbackUsed: false };
  }

  // ---- ขั้น 1-2: province/district + category (พร้อม fallback) ----
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
      places = await queryPlacesWithCategoryInfo(locationFilter, null);
      categoryFallbackUsed = true;
    }
  }

  // ---- ขั้น 3: กรองงบ (hard filter) ----
  if (trip.dailyBudget !== null) {
    const perPersonDailyBudget = trip.dailyBudget / trip.numberOfPeople;
    places = places.filter((place) => {
      const placeCost = PRICE_LEVEL_TO_BAHT[place.priceLevel] ?? 0;
      return placeCost <= perPersonDailyBudget;
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
  field: "province" | "district";
  value: string;
}

/**
 * Join places <- place_categories <- categories เสมอ (เพื่อให้รู้ default_duration_min ทุกกรณี)
 * categoryIds = null -> ไม่กรอง category ใช้แค่ location (province หรือ district)
 * categoryIds = number[] -> กรองทั้ง location และ category_id IN (...)
 */
async function queryPlacesWithCategoryInfo(
  locationFilter: LocationFilter,
  categoryIds: number[] | null
): Promise<PlaceWithScore[]> {
  let query = supabase
    .from("place_categories")
    .select(
      "confidence_score, categories!inner(default_duration_min), places!inner(place_id, latitude, longitude, rating, price_level, province, district)"
    )
    .eq(`places.${locationFilter.field}`, locationFilter.value);

  if (categoryIds !== null) {
    query = query.in("category_id", categoryIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`ดึง place_categories ไม่สำเร็จ: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    placeId: row.places.place_id,
    latitude: row.places.latitude,
    longitude: row.places.longitude,
    rating: row.places.rating,
    priceLevel: row.places.price_level,
    confidenceScore: categoryIds === null ? null : row.confidence_score,
    defaultDurationMin: row.categories.default_duration_min ?? 60, // fallback ค่า default ของ categories.default_duration_min เอง
  }));
}