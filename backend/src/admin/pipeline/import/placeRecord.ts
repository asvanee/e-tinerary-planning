import type { OpeningHours } from "../../../utils/openingHoursChecker";
import { AttractionRow } from "../attractionTypes";
import type { GoogleCandidate, GoogleDetails, LatLng } from "./googlePlaces";

// 1 แถวของตาราง places ที่ insert (place_id / created_at ให้ DB สร้าง) — ดู docs/DATABASE_SCHEMA.md
export interface PlaceRecord {
  google_place_id: string;
  place_name: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  price_level: number | null;
  user_ratings_total: number | null;
  opening_hours: OpeningHours | null;
  formatted_address: string | null;
  province: string;
  district: string;
  phone_number: string | null;
  website: string | null;
  gmaps_types: string[] | null;
  att_id: string;
  att_type_label: string | null;
  att_category_label: string | null;
  att_detail_th: string | null;
  att_facebook: string | null;
  att_instagram: string | null;
  att_tiktok: string | null;
  att_youtube: string | null;
  att_line: string | null;
}

/**
 * คอลัมน์ CSV ที่การนำเข้าอ่านจริง (ชื่อ/ค้นหา, พิกัด, ติดต่อ, ที่อยู่ fallback, att_*) — D-31
 * merge เลือกค่าได้เฉพาะคอลัมน์เหล่านี้ · ⚠️ frontend admin/lib/placeFields.ts::MERGE_FIELDS ต้องตรงกัน
 */
export const IMPORT_FIELDS: readonly string[] = [
  "ATT_NAME_TH",
  "ATT_NAME_EN",
  "ATT_LOCATION",
  "ATT_TEL",
  "ATT_WEBSITE",
  "ATT_ADDRESS",
  "ATT_ADDRESS_ALLEY",
  "ATT_ADDRESS_ROAD",
  "SUBDISTRICT_NAME_TH",
  "DISTRICT_NAME_TH",
  "ATT_POSTCODE",
  "ATT_TYPE_LABEL",
  "ATT_CATEGORY_LABEL",
  "ATT_DETAIL_TH",
  "ATT_FACEBOOK",
  "ATT_INSTAGRAM",
  "ATT_TIKTOK",
  "ATT_YOUTUBE",
  "ATT_LINE",
];

// ค่าว่าง / "ไม่มี" ใน CSV = ไม่มีข้อมูล
export function clean(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "ไม่มี" ? trimmed : null;
}

// ที่อยู่จาก CSV (ใช้เมื่อ Google ไม่มี formatted_address)
function buildAddress(row: AttractionRow): string | null {
  const parts = [
    row.ATT_ADDRESS,
    row.ATT_ADDRESS_ALLEY,
    row.ATT_ADDRESS_ROAD,
    row.SUBDISTRICT_NAME_TH,
    row.DISTRICT_NAME_TH,
    row.PROVINCE_NAME_TH,
    row.ATT_POSTCODE,
  ]
    .map(clean)
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * record ของ places จากแถว CSV + ผล Google ที่จับคู่ผ่านแล้ว (D-26/D-27)
 * - พิกัดจาก CSV เสมอ (หลัง admin แก้แล้ว)
 * - ชื่อ/เบอร์/เว็บ: Google ก่อน แล้วค่อย CSV
 * - rating, user_ratings_total, price_level, opening_hours, ที่อยู่, gmaps_types: Google
 * - province/district และ att_*: CSV
 */
export function buildPlaceRecord(
  row: AttractionRow,
  coords: LatLng,
  candidate: GoogleCandidate,
  details: GoogleDetails
): PlaceRecord {
  return {
    google_place_id: details.place_id || candidate.place_id,
    place_name:
      clean(details.name) ?? clean(candidate.name) ?? clean(row.ATT_NAME_TH) ?? clean(row.ATT_NAME_EN) ?? row.ATT_ID,
    latitude: coords.lat,
    longitude: coords.lng,
    rating: details.rating ?? null,
    price_level: details.price_level ?? null,
    user_ratings_total: details.user_ratings_total ?? null,
    opening_hours: details.opening_hours ?? null,
    formatted_address: clean(details.formatted_address) ?? clean(candidate.formatted_address) ?? buildAddress(row),
    province: clean(row.PROVINCE_NAME_TH) ?? "",
    district: clean(row.DISTRICT_NAME_TH) ?? "",
    phone_number: clean(details.formatted_phone_number) ?? clean(row.ATT_TEL),
    website: clean(details.website) ?? clean(row.ATT_WEBSITE),
    gmaps_types: details.types && details.types.length > 0 ? details.types : null,
    att_id: row.ATT_ID,
    att_type_label: clean(row.ATT_TYPE_LABEL),
    att_category_label: clean(row.ATT_CATEGORY_LABEL),
    att_detail_th: clean(row.ATT_DETAIL_TH),
    att_facebook: clean(row.ATT_FACEBOOK),
    att_instagram: clean(row.ATT_INSTAGRAM),
    att_tiktok: clean(row.ATT_TIKTOK),
    att_youtube: clean(row.ATT_YOUTUBE),
    att_line: clean(row.ATT_LINE),
  };
}
