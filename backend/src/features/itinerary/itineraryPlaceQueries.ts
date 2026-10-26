import { supabase } from "../../config/db";
import type { OpeningHours } from "../../utils/openingHoursChecker";
import type { PriceNature } from "../poi/poiPlaceQueries";

/* =========================================================
 * Types
 * ========================================================= */

export interface TripDay {
  tripDayId: string;
  dayNumber: number;
  visitDate: string;
  startTime: string | null;
  endTime: string | null;
  dailyBudget: number | null;
  useBudget: boolean;
}

export interface SelectedPlace {
  placeId: string;
  latitude: number;
  longitude: number;
  priceRangeStart: number | null;
  priceRangeEnd: number | null;
  priceNature: PriceNature;
  openingHours: OpeningHours | null;
}

export interface TripOwnerAndStart {
  userId: string;
  startLat: number;
  startLng: number;
}

export interface AutoTripPlace {
  placeId: string;
  placeName: string;
  categoryId: string;
  categoryName: string;
  poiScore: number;
  latitude: number;
  longitude: number;
  openingHours: OpeningHours | null;
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

interface CategoryRow {
  category_id: string;
  category_name: string;
  price_nature: PriceNature;
}

interface CategoryLabelRow {
  categories: CategoryRow | CategoryRow[] | null;
}

interface SelectedPlaceRow {
  place_id: string;
  latitude: number;
  longitude: number;
  price_range_start: number | null;
  price_range_end: number | null;
  opening_hours: OpeningHours | null;
  category_labels: CategoryLabelRow | CategoryLabelRow[] | null;
}

interface AutoTripCategory {
  category_id: string;
  category_name: string;
  price_nature: PriceNature;
}

interface TripCategoryRow {
  categories:
    | { category_id: string; category_name: string }
    | { category_id: string; category_name: string }[]
    | null;
}

interface AutoTripPlaceRow {
  place_id: string;
  place_name: string;
  latitude: number;
  longitude: number;
  opening_hours: OpeningHours | null;
  price_level: number | null;
  category_labels:
    | {
        categories: AutoTripCategory | AutoTripCategory[] | null;
      }
    | {
        categories: AutoTripCategory | AutoTripCategory[] | null;
      }[]
    | null;
}

interface AutoTripScoreRow {
  poi_score: number | null;
  places: AutoTripPlaceRow | AutoTripPlaceRow[] | null;
}

const TRIP_DAY_COLUMNS =
  "trip_day_id, day_number, visit_date, start_time, end_time, daily_budget";

/* =========================================================
 * Relation & Utility Helpers
 * ========================================================= */

/**
 * รองรับ Supabase relation ที่เป็นทั้ง Object และ Array
 */
function asArray<T>(
  value: T | T[] | null | undefined
): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getCategoryRows(
  labels: CategoryLabelRow | CategoryLabelRow[] | null | undefined
): CategoryRow[] {
  return asArray(labels)
    .flatMap((label) => asArray(label?.categories))
    .filter(
      (category): category is CategoryRow =>
        category != null &&
        typeof category.category_id === "string" &&
        typeof category.category_name === "string"
    );
}

function timeStringToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return hh * 60 + mm;
}

function minutesToTimeString(totalMinutes: number): string {
  const capped = Math.min(Math.max(totalMinutes, 0), 1439);
  const hh = Math.floor(capped / 60);
  const mm = capped % 60;

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

function enumerateDates(
  startDate: string,
  endDate: string
): string[] {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);

  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const dates: string[] = [];

  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    dates.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    );
  }

  return dates;
}

function mapTripDayRow(
  row: TripDayRow,
  useBudget: boolean
): TripDay {
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

/* =========================================================
 * Trip Queries
 * ========================================================= */

export async function getTripOwnerAndStart(
  tripId: string
): Promise<TripOwnerAndStart | null> {
  const { data, error } = await supabase
    .from("trips")
    .select("user_id, start_lat, start_lng")
    .eq("trip_id", tripId)
    .single();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    startLat: data.start_lat,
    startLng: data.start_lng,
  };
}

export async function getOrCreateTripDays(
  tripId: string
): Promise<TripDay[]> {
  const { data: tripMeta, error: metaError } = await supabase
    .from("trips")
    .select("use_budget")
    .eq("trip_id", tripId)
    .single();

  if (metaError || !tripMeta) {
    throw new Error(
      `ดึงข้อมูลทริปไม่สำเร็จ: ${metaError?.message ?? "ไม่พบทริป"}`
    );
  }

  const useBudget = tripMeta.use_budget ?? false;

  const { data: existingRows, error: existingError } =
    await supabase
      .from("trip_days")
      .select(TRIP_DAY_COLUMNS)
      .eq("trip_id", tripId)
      .order("day_number", { ascending: true });

  if (existingError) {
    throw new Error(
      `ดึง trip_days ไม่สำเร็จ: ${existingError.message}`
    );
  }

  if (existingRows?.length) {
    return existingRows.map((row) =>
      mapTripDayRow(row as TripDayRow, useBudget)
    );
  }

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select(
      "start_date, end_date, start_time, available_time_per_day, daily_budget"
    )
    .eq("trip_id", tripId)
    .single();

  if (tripError || !trip) {
    throw new Error(
      `ดึงข้อมูลเพื่อสร้าง trip_days ไม่สำเร็จ: ${tripError?.message ?? "ไม่พบทริป"}`
    );
  }

  const dates = enumerateDates(trip.start_date, trip.end_date);
  const startMinutes = timeStringToMinutes(trip.start_time);

  const endTime =
    trip.available_time_per_day == null
      ? null
      : minutesToTimeString(
          startMinutes + trip.available_time_per_day * 60
        );

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
    throw new Error(
      `สร้าง trip_days ไม่สำเร็จ: ${insertError.message}`
    );
  }

  return (insertedRows ?? [])
    .map((row) => mapTripDayRow(row as TripDayRow, useBudget))
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

/* =========================================================
 * Selected Places
 * ========================================================= */


export async function getSelectedPlaces(
  placeIds: string[]
): Promise<SelectedPlace[]> {
  if (placeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("places")
    .select(`
      place_id,
      latitude,
      longitude,
      price_range_start,
      price_range_end,
      opening_hours,
      category_labels(
        categories(price_nature)
      )
    `)
    .in("place_id", placeIds);

  if (error) {
    throw new Error(
      `ดึงข้อมูลสถานที่ที่เลือกไม่สำเร็จ: ${error.message}`
    );
  }

  const places: SelectedPlace[] = (data ?? []).map((row) => {
    const selectedRow = row as unknown as SelectedPlaceRow;
    const category = asArray(selectedRow.category_labels)
      .flatMap((label) => asArray(label.categories))[0];

    return {
      placeId: selectedRow.place_id,
      latitude: selectedRow.latitude,
      longitude: selectedRow.longitude,
      priceRangeStart: selectedRow.price_range_start,
      priceRangeEnd: selectedRow.price_range_end,
      // ถ้าไม่มีหมวดและไม่มีราคาจริง ห้ามอนุมานว่าสถานที่เข้าฟรี
      priceNature: category?.price_nature ?? "paid",
      openingHours: selectedRow.opening_hours,
    };
  });

  return places;
}

/* =========================================================
 * Auto Trip Places
 * ========================================================= */

/**
 * ดึงสถานที่จากคะแนน POI ของทริป
 * หนึ่งสถานที่อาจมีหลาย category_labels
 */
export async function getAutoTripPlaces(
  tripId: string
): Promise<AutoTripPlace[]> {
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
        price_level,
        category_labels!inner(
          categories!inner(
            category_id,
            category_name,
            price_nature
          )
        )
      )
    `)
    .eq("trip_id", tripId);

  if (error) {
    throw new Error(
      `ดึงข้อมูล Auto Trip ไม่สำเร็จ: ${error.message}`
    );
  }

  const result: AutoTripPlace[] = [];

  for (const row of (data ?? []) as unknown as AutoTripScoreRow[]) {
    const places = asArray(row.places);

    for (const place of places) {
      if (!place) continue;

      const labels = asArray(place.category_labels);

      const categories = labels.flatMap((label) =>
        asArray(label?.categories)
      );

      // ป้องกันหมวดหมู่ซ้ำ
      const uniqueCategories = Array.from(
        new Map(
          categories.map((category) => [
            category.category_id,
            category,
          ])
        ).values()
      );

      for (const category of uniqueCategories) {
        result.push({
          placeId: place.place_id,
          placeName: place.place_name,
          categoryId: category.category_id,
          categoryName: category.category_name,
          poiScore: Number(row.poi_score ?? 0),
          latitude: Number(place.latitude),
          longitude: Number(place.longitude),
          openingHours: place.opening_hours ?? null,
          rawPriceLevel: place.price_level ?? null,
          priceNature: category.price_nature,
        });
      }
    }
  }

  return result;
}

/**
 * ดึงหมวดที่ผู้ใช้เลือกไว้ในทริปเพื่อสร้างช่องกรอกเวลาใน Frontend
 */
export async function getAutoTripCategories(
  tripId: string
): Promise<Array<{ categoryId: string; categoryName: string }>> {
  const { data, error } = await supabase
    .from("trip_categories")
    .select("categories!inner(category_id, category_name)")
    .eq("trip_id", tripId);

  if (error) {
    throw new Error(`ดึงหมวดหมู่ของทริปไม่สำเร็จ: ${error.message}`);
  }

  const categoryMap = new Map<string, { categoryId: string; categoryName: string }>();

  for (const row of (data ?? []) as unknown as TripCategoryRow[]) {
    for (const category of asArray(row.categories)) {
      if (
        typeof category?.category_id === "string" &&
        typeof category.category_name === "string"
      ) {
        categoryMap.set(category.category_id, {
          categoryId: category.category_id,
          categoryName: category.category_name,
        });
      }
    }
  }

  return Array.from(categoryMap.values()).sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName, "th")
  );
}