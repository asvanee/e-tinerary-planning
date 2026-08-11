import { supabase } from "../../config/db";
import { PRICE_LEVEL_TO_BAHT } from "../../utils/priceLevel";

// ✅ ยุบเหลือ 2 หมวดแล้ว (เดิม "free" | "food" | "paid_other") — ดูเหตุผลที่
// poiScoreCalculator.ts::calculatePriceScore (food กับ paid_other มี logic เหมือนกันทุกกรณี
// ทั้งฝั่ง price_score และฝั่ง hard filter งบด้านล่าง จึงไม่มีเหตุผลต้องแยกกันอีก)
// ✅ DB migration รันไปแล้ว (categories.price_nature เก็บแค่ free/paid ตรงๆ) จึงไม่ต้องมี
// mapping/normalize ชั้นพิเศษในโค้ด — อ่านค่าดิบจาก DB มาใช้ตรงๆ ได้เลย
export type PriceNature = "free" | "paid";

/**
 * ✅ ใหม่: ใช้แทน categories.default_price_level ที่เลิกใช้แล้ว (ดู PRICE_SCORE_REDESIGN.md)
 * ใช้เฉพาะตอน place ไม่มี price_level จริง เพื่อประมาณราคาให้ hard filter งบเทียบได้
 * (ไม่ใช่ตัวที่ใช้คำนวณ price_score — price_score ใช้ lookup คนละตารางใน poiScoreCalculator.ts)
 *
 * ✅ มติ (ข) ล็อกแล้ว + ขยายผลถึง food/paid_other (ตอนนี้รวมเป็นหมวด "paid" เดียว): ตัดออกจาก
 * ตารางนี้แล้ว — เลิกเดาราคาเมื่อไม่มีข้อมูลจริง (เดิมรอบแรกตัดแค่ paid_other ออก ยังเดา food
 * เป็นค่ากลาง level 1 อยู่ ทำให้ food missing ยังถูกกรองออกจากหน้า POI list ได้ ทั้งที่ตอนคิด
 * price_score และตอนคำนวณ budget conflict ต่างก็ตัดสินใจไม่เดา food missing ไปแล้วทั้งคู่ —
 * ตอนนี้ทำให้ตรงกันทั้ง 3 จุด: paid + ไม่มีราคาจริง = ไม่มีใครเดาแทน user เลยทั้งระบบ)
 *
 * เหลือแค่ free เท่านั้นที่ยังประมาณต่อ เพราะมั่นใจทิศทางราคาได้สูงกว่ามาก (มักฟรีจริง) — ต่างจาก
 * paid ที่ range กว้างพอจะเดาผิดได้ (ร้านข้างทาง/ตลาดนัด 20 บาท ถึงร้านหรู/ห้างหรูหลักพัน)
 */
const PRICE_NATURE_ESTIMATED_LEVEL: Partial<Record<PriceNature, number>> = {
  free: 0,
};

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

  // ✅ ประมาณราคาแล้ว (fallback ด้วย PRICE_NATURE_ESTIMATED_LEVEL ถ้าไม่มีราคาจริง) —
  // ใช้กับ hard filter งบเท่านั้น (ดู getFilteredPlaces ขั้น 3) ห้ามส่งเข้า
  // calculatePoiScore() โดยตรงอีกต่อไป เพราะ price_score คำนวณจาก rawPriceLevel + priceNature
  // คนละ lookup table กัน (ดู PRICE_SCORE_REDESIGN.md)
  // ✅ มติ (ข): เปลี่ยนเป็น nullable แล้ว — null = paid ที่ไม่มีราคาจริง (ไม่เดาอีกต่อไป)
  // getFilteredPlaces ขั้น 3 ต้องปล่อยผ่าน hard filter งบเมื่อเจอ null ไม่ใช่ตัดออก
  priceLevel: number | null;

  // ✅ ใหม่: ราคาจริงจาก places.price_level ตรงๆ ไม่ผ่าน fallback ใดๆ — null = ไม่มีข้อมูลจริง
  // ใช้ตัดสิน real vs inferred confidence ใน poiScoreCalculator.ts
  rawPriceLevel: number | null;

  // ✅ ใหม่: ธรรมชาติราคาของ category ที่ confidence_score สูงสุด (best-match เดียวกับ
  // categoryName/defaultDurationMin ด้านล่าง) ใช้เลือก lookup table + weight ที่ถูกต้อง
  priceNature: PriceNature;

  // ✅ place อาจมีได้หลาย category จริง (ดู DATA_PREPARATION_4.md หัวข้อ 8.2) — ค่าที่นี่คือ
  // ของ category ที่ confidence_score สูงสุด (best match) ต่อ place นั้น ไม่ใช่ค่าเดียว
  // ที่มีของ place (ดู bestRowByPlaceId ใน queryPlacesWithCategoryInfo)
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
 *    (ข้ามถ้า daily_budget null "หรือ" ถ้าเป็น paid ที่ไม่มี price_level จริง — มติ (ข)
 *    ไม่เดาราคาแทน user ปล่อยผ่าน filter ไปเลย — ดู PRICE_NATURE_ESTIMATED_LEVEL ด้านล่าง)
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
  // queryPlacesWithCategoryInfo() แล้ว (ราคาจริงถ้ามี ไม่งั้นประมาณตาม priceNature ของ
  // category ผ่าน PRICE_NATURE_ESTIMATED_LEVEL — ดู PRICE_SCORE_REDESIGN.md หัวข้อ 3)
  //
  // ✅ มติ (ข) ล็อกแล้ว: priceLevel เป็น null ได้เมื่อเป็น paid (รวม food/paid_other เดิม)
  // ที่ไม่มีราคาจริง (ดู PRICE_NATURE_ESTIMATED_LEVEL ด้านบน) — "ไม่รู้จริงๆ" ไม่เดา
  // ปล่อยผ่าน hard filter งบไปเลย ให้ user เห็นตัวเลือกในหน้า POI list แล้วตัดสินใจเอง —
  // เหลือแค่ free เท่านั้นที่ priceLevel ไม่มีทาง null (มี fallback ใน
  // PRICE_NATURE_ESTIMATED_LEVEL) จึงยังกรองด้วยราคาประมาณตามปกติ
  if (
  trip.useBudget &&
  trip.dailyBudget !== null
) {
  const dailyBudget = trip.dailyBudget;

  places = places.filter((place) => {
    if (place.priceLevel === null) return true; // paid + ไม่รู้ราคาจริง — ปล่อยผ่าน ไม่เดา

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
      "category_id, confidence_score, categories!inner(default_duration_min, price_nature, category_name), places!inner(place_id, latitude, longitude, rating, price_level, province, district)"
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

  // ✅ เพิ่มใหม่ — Multi-category support (ดู DATA_PREPARATION_4.md หัวข้อ 8.2/8.7):
  // ตั้งแต่ Stage 3 (gmaps_types weighted scoring) place หนึ่งเก็บได้หลาย category พร้อมกัน
  // (ทุก category ที่ score >= 0.5 * max_score ของ place นั้น) เชียงใหม่ผ่าน Stage 3 แล้ว
  // (429/429) ดังนั้น place_categories ของเชียงใหม่มีโอกาสจริงที่ 1 place จะมีหลายแถว —
  // ถ้าไม่ group ตรงนี้ place เดียวกันจะโผล่ซ้ำในผลลัพธ์เท่าจำนวน category ที่แมทช์
  // (โดยเฉพาะตอน user เลือกหลาย interest พร้อมกันแล้ว place แมทช์มากกว่า 1 interest)
  //
  // มติ: group by place_id แล้วเลือกแถวที่ confidence_score สูงสุด (MAX aggregation) เป็น
  // ตัวแทนของ place นั้น — ใช้ categoryName + defaultDurationMin ของ category ที่ match
  // แน่นสุด (คะแนนสูงสุด) เป็นตัวแทนการแสดงผล ไม่ sum/average ข้าม category กัน
  //
  // หมายเหตุ: กรุงเทพฯ/ชลบุรียังไม่ผ่าน Stage 3 (ดู DATA_PREPARATION_4.md หัวข้อ 8.4) ตอนนี้
  // ยังไม่มี place ไหนของ 2 จังหวัดนี้ที่จะมีหลายแถวจริง แต่โค้ดนี้เขียนให้ถูกต้องล่วงหน้า
  // ไว้เลย ไม่ต้องมาแก้ซ้ำตอนกรุงเทพฯ/ชลบุรีผ่าน Stage 3 ทีหลัง
  const bestRowByPlaceId = new Map<string, any>();

  // ✅ แก้ TS2339: (data ?? []) ที่ไม่ cast จะโดน Supabase infer ว่า row.places เป็น array
  // (relation ไม่ได้ตั้ง one-to-one ชัดเจน) ทั้งที่รันจริงเป็น object เดี่ยว — cast เป็น any[]
  // ตรงนี้เหมือนกับที่ .map((row: any) => ...) ด้านล่างทำอยู่แล้ว ให้ทั้งไฟล์สม่ำเสมอกัน
  // (sync กับ itineraryPlaceQueries.ts::getSelectedPlaces ที่แก้จุดเดียวกันไปแล้ว)
  for (const row of (data ?? []) as any[]) {
    const placeId = row.places.place_id;
    const existing = bestRowByPlaceId.get(placeId);

    // confidence_score เป็น null ได้ตอน categoryIds === null (ไม่ได้กรอง category เลย
    // เห็นทุกแถวของ place นั้น) กรณีนั้นไม่มีเกณฑ์เทียบความมั่นใจ ใช้แถวแรกที่เจอไปเลย
    // เพราะ confidenceScore สุดท้ายจะถูกบังคับเป็น null อยู่ดี (ดูด้านล่าง) ไม่ถูกใช้คำนวณ
    if (
      !existing ||
      (row.confidence_score ?? 0) > (existing.confidence_score ?? 0)
    ) {
      bestRowByPlaceId.set(placeId, row);
    }
  }

  // ✅ แก้แล้ว (v2 — เลิกใช้ categories.default_price_level): fallback ตอน price_level
  // หายด้วย PRICE_NATURE_ESTIMATED_LEVEL (ประมาณตามธรรมชาติราคาของหมวดหมู่ ไม่ใช่ค่าคงที่
  // ต่อ category เดี่ยวๆ แบบเดิม) — effectivePriceLevel ตัวนี้ใช้กับ hard filter งบเท่านั้น
  // (ดู getFilteredPlaces ขั้น 3) ห้ามส่งเข้า calculatePoiScore() ตรงๆ อีกต่อไป
  // priceNature/rawPriceLevel ต่างหากคือสิ่งที่ poiScoreCalculator.ts ใช้จริงสำหรับ price_score
  // (ดู PRICE_SCORE_REDESIGN.md หัวข้อ 3)
  //
  // ✅ มติ (ข): PRICE_NATURE_ESTIMATED_LEVEL[priceNature] คืน undefined เมื่อ priceNature ===
  // "paid" แล้ว (ตัด entry นี้ออกจากตารางแล้ว) — effectivePriceLevel จึงเป็น null ได้
  // ในเคสนี้ (rawPriceLevel null + paid) ให้ getFilteredPlaces ขั้น 3 ปล่อยผ่าน filter
  return Array.from(bestRowByPlaceId.values()).map((row: any) => {
    const rawPriceLevel: number | null = row.places.price_level;
    // ✅ DB migration รันแล้ว — row.categories.price_nature เป็น "free" | "paid" ตรงๆ
    // ไม่ต้อง normalize/map จาก 3 หมวดเดิมอีกต่อไป (เทียบกับตอนที่ DB ยังไม่ migrate)
    const priceNature: PriceNature = row.categories.price_nature;

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