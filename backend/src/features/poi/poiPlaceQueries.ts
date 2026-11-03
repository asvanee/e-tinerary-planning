import { supabase } from "../../config/db";
import { getPlaceCost } from "../../utils/placePrice";

// ค่าของ categories.price_nature
export type PriceNature = "free" | "paid";

// ค่าของ categories.environment_type
export type EnvironmentType = "INDOOR" | "OUTDOOR" | "MIXED";

export interface TripInfo {
  userId: string;
  // district null = ไม่กรองอำเภอ
  province: string | null;
  district: string | null;
  startLat: number;
  startLng: number;
  dailyBudget: number | null; // งบต่อคนต่อวัน
  useBudget: boolean;
  // "YYYY-MM-DD" ใช้ดึงพยากรณ์ฝน
  startDate: string;
  endDate: string;
}

export interface PlaceWithScore {
  placeId: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  priceRangeStart: number | null; // ช่วงราคาต่อคน (บาท)
  priceRangeEnd: number | null;
  priceNature: PriceNature;
  categoryId: string;
  // true = อยู่ในหมวดที่ผู้ใช้เลือก · false = หมวดอื่นที่เติมเข้ามา · null = ผู้ใช้ไม่ได้เลือกหมวด
  categoryMatch: boolean | null;
  categoryName: string;
  environmentType: EnvironmentType;
}

// จำนวนสถานที่แนะนำที่แสดง และเกณฑ์ว่าหมวดที่เลือกมี "พอ" หรือไม่
export const POI_RESULT_LIMIT = 50;

interface FilteredPlacesResult {
  places: PlaceWithScore[];
  // จำนวนที่ตรงหมวด (หลังกรองงบ) · null = ไม่ได้เลือกหมวด
  categoryMatchCount: number | null;
  // true = ตรงหมวดไม่ถึง 50 จึงเติมหมวดอื่นในพื้นที่เข้ามาด้วย
  categoryFilled: boolean;
}

// ข้อมูลทริปที่ใช้คิดคะแนน POI
export async function getTripInfo(tripId: string): Promise<TripInfo | null> {
  const { data, error } = await supabase
    .from("trips")
    .select(
      "user_id, province, district, start_lat, start_lng, daily_budget, use_budget, start_date, end_date"
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
    useBudget: data.use_budget ?? false,
    startDate: data.start_date,
    endDate: data.end_date,
  };
}

// กรองสถานที่ตามลำดับ (ห้ามสลับ): จังหวัด/อำเภอ → งบ → หมวด
// - งบ: ตัดที่ราคาต่อคนเกินงบต่อคนต่อวัน (ไม่ทราบราคาปล่อยผ่าน)
// - หมวด: นับหลังกรองงบ ตรงหมวด ≥ 50 เหลือเฉพาะที่ตรง · น้อยกว่านั้นเก็บทุกที่ (หมวดอื่นได้คะแนนหมวด 0)
export async function getFilteredPlaces(
  tripId: string,
  trip: TripInfo
): Promise<FilteredPlacesResult> {
  // ข้อมูลเก่าที่ไม่มีจังหวัด
  if (!trip.province) {
    return { places: [], categoryMatchCount: null, categoryFilled: false };
  }

  const locationFilter: LocationFilter = {
    province: trip.province,
    district: trip.district,
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

  let places = await queryPlacesWithCategoryInfo(locationFilter);

  // daily_budget เป็นงบต่อคนต่อวันแล้ว เทียบกับราคาต่อคนตรงๆ แบบเดียวกับตอนจัดแผน
  if (trip.useBudget && trip.dailyBudget !== null) {
    const dailyBudget = trip.dailyBudget;

    places = places.filter((place) => {
      const placeCost = getPlaceCost(
        place.priceRangeStart,
        place.priceRangeEnd,
        place.priceNature
      );
      return placeCost === null || placeCost <= dailyBudget;
    });
  }

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

// สถานที่ในพื้นที่พร้อมหมวดจากป้าย ททท. (places → category_labels → categories)
// `!inner` ตัดสถานที่ที่ไม่มีหมวดออก · 1 สถานที่ = 1 แถว
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

  // Supabase เดา type ของ embed เป็น array แต่ relation นี้คืน object เดียว
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
