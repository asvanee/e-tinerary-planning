import { supabase } from "../../config/db";
import { PRICE_LEVEL_TO_BAHT } from "../../utils/priceLevel";
import { pickBestCategoryRows } from "../../utils/bestCategoryRow";

// ค่าของ categories.price_nature
export type PriceNature = "free" | "paid";

// ค่าของ categories.environment_type — poiScoreCalculator.ts แปลงเป็นสัดส่วนที่โดนฝน
export type EnvironmentType = "INDOOR" | "OUTDOOR" | "MIXED";

/**
 * price_level โดยประมาณเมื่อ place ไม่มีราคาจริง — ใช้กับ hard filter งบเท่านั้น
 * (price_score ใช้ rawPriceLevel + priceNature ใน poiScoreCalculator.ts)
 *
 * ประมาณเฉพาะ free (มักฟรีจริง) · paid ที่ไม่มีราคาจริงไม่เดา (ราคากว้างตั้งแต่หลักสิบถึงหลักพัน)
 * จึงได้ null แล้วปล่อยผ่าน filter งบ — ตรงกับ price_score และ budget conflict ที่ไม่เดาเช่นกัน
 */
const PRICE_NATURE_ESTIMATED_LEVEL: Partial<Record<PriceNature, number>> = {
  free: 0,
};

export interface TripInfo {
  userId: string;
  // tripController.ts บังคับกรอก province · district ไม่บังคับ (null = ไม่กรองอำเภอ)
  province: string | null;
  district: string | null;
  startLat: number;
  startLng: number;
  dailyBudget: number | null;
  numberOfPeople: number;
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

  // ราคาจริง หรือประมาณด้วย PRICE_NATURE_ESTIMATED_LEVEL — ใช้กับ hard filter งบเท่านั้น
  // ห้ามส่งเข้า calculatePoiScore() · null = paid ที่ไม่มีราคาจริง (ปล่อยผ่าน filter งบ)
  priceLevel: number | null;

  // ราคาจริงจาก places.price_level ไม่ผ่าน fallback (null = ไม่มีข้อมูล) — ใช้คิด price_score
  rawPriceLevel: number | null;

  // ค่าของ category ที่ confidence_score สูงสุดของ place นั้น (ดู pickBestCategoryRows)
  priceNature: PriceNature;
  confidenceScore: number | null;
  defaultDurationMin: number;
  categoryName: string;
  environmentType: EnvironmentType; // ใช้คำนวณ weather_score
}

interface FilteredPlacesResult {
  places: PlaceWithScore[];
  categoryFallbackUsed: boolean; // true = มี category_ids แต่กรองแล้วเหลือ 0 ที่ เลยตัด category filter ออก
}

/**
 * ข้อมูลทริปที่ใช้คำนวณ POI score และ hard filter งบ/เวลา
 */
export async function getTripInfo(tripId: string): Promise<TripInfo | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "user_id, province, district, start_lat, start_lng, daily_budget, number_of_people, available_time_per_day, use_budget, start_date, end_date"
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
    startDate: data.start_date,
    endDate: data.end_date,
  };
}

/**
 * Pipeline กรองสถานที่ ทำตามลำดับ ห้ามสลับ:
 * 1. province (บังคับเสมอ) + AND district ถ้า user ระบุมา
 * 2. category (ถ้า user เลือกไว้) พร้อม fallback ถ้ากรองแล้วเหลือ 0 ที่
 * 3. งบ (hard filter): ตัดสถานที่ที่ place_cost > daily_budget
 *    (ข้ามถ้าไม่ได้ใช้งบ หรือเป็น paid ที่ไม่มีราคาจริง — ไม่เดาราคาแทน user)
 * 4. เวลา (hard filter): ตัดสถานที่ที่ default_duration_min > available_time_per_day (นาที)
 */
export async function getFilteredPlaces(
  tripId: string,
  trip: TripInfo
): Promise<FilteredPlacesResult> {
  // กันข้อมูลเก่าที่ไม่มี province (ปัจจุบันบังคับกรอกเสมอ)
  if (!trip.province) {
    return { places: [], categoryFallbackUsed: false };
  }

  const locationFilter: LocationFilter = {
    province: trip.province,
    district: trip.district, // null = กรองแค่ province
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
      // Fallback: กรองแล้วเหลือ 0 ที่ -> ตัด category filter ออก (location เดิม ไม่ตัด district)
      places = await queryPlacesWithCategoryInfo(locationFilter, null);
      categoryFallbackUsed = true;
    }
  }

  // ---- ขั้น 3: กรองงบ (hard filter) ----
  // ⚠️ ห้ามหาร numberOfPeople ตรงนี้ — trips.daily_budget เป็นค่าที่ frontend คำนวณตาม
  // budget_scope/budget_period มาแล้ว ต้องเทียบตรงๆ ให้ตรงกับ itineraryBuilder.ts
  // (เทียบ cumulativeCost กับ day.dailyBudget) ไม่งั้นผลตอนเลือก POI กับตอนจัดแผนจะขัดกัน
  if (trip.useBudget && trip.dailyBudget !== null) {
    const dailyBudget = trip.dailyBudget;

    places = places.filter((place) => {
      if (place.priceLevel === null) return true; // paid + ไม่รู้ราคาจริง — ปล่อยผ่าน ไม่เดา

      const placeCost = PRICE_LEVEL_TO_BAHT[place.priceLevel] ?? 0;

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

interface PlaceCategoryRow {
  category_id: string;
  confidence_score: number | null;
  categories: {
    default_duration_min: number | null;
    price_nature: PriceNature;
    category_name: string;
    environment_type: EnvironmentType;
  };
  places: {
    place_id: string;
    latitude: number;
    longitude: number;
    rating: number | null;
    price_level: number | null;
    province: string | null;
    district: string | null;
  };
}

/**
 * Join places <- place_categories <- categories เสมอ (ให้รู้ default_duration_min ทุกกรณี)
 * categoryIds = null -> ไม่กรอง category ใช้แค่ location (province + district ถ้ามี)
 * categoryIds = string[] -> กรองทั้ง location และ category_id IN (...)
 *
 * place หนึ่งมีได้หลาย category จึงเลือกแถวที่ confidence_score สูงสุดเป็นตัวแทน
 * (ไม่ sum/average ข้าม category) กัน place เดียวกันโผล่ซ้ำตามจำนวน category ที่ตรง
 */
async function queryPlacesWithCategoryInfo(
  locationFilter: LocationFilter,
  categoryIds: string[] | null
): Promise<PlaceWithScore[]> {
  let query = supabase
    .from("place_categories")
    .select(
      "category_id, confidence_score, categories!inner(default_duration_min, price_nature, category_name, environment_type), places!inner(place_id, latitude, longitude, rating, price_level, province, district)"
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

  // Supabase infer embed เป็น array แต่ relation นี้คืน object เดี่ยวจริง
  const rows = (data ?? []) as unknown as PlaceCategoryRow[];

  // ตอนไม่กรอง category (categoryIds === null) confidenceScore จะถูกบังคับเป็น null ด้านล่าง
  // แถวตัวแทนจึงมีผลแค่ duration/ราคา/หมวดที่แสดง
  return pickBestCategoryRows(rows, (row) => row.places.place_id).map((row) => {
    const rawPriceLevel = row.places.price_level;
    const priceNature = row.categories.price_nature;

    const effectivePriceLevel: number | null =
      rawPriceLevel ?? PRICE_NATURE_ESTIMATED_LEVEL[priceNature] ?? null;

    return {
      placeId: row.places.place_id,
      latitude: row.places.latitude,
      longitude: row.places.longitude,
      rating: row.places.rating,

      priceLevel: effectivePriceLevel,
      rawPriceLevel,
      priceNature,

      confidenceScore: categoryIds === null ? null : row.confidence_score,

      defaultDurationMin: row.categories.default_duration_min ?? 60,

      categoryName: row.categories.category_name,

      environmentType: row.categories.environment_type,
    };
  });
}
