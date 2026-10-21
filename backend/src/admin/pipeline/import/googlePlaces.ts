import type { OpeningHours } from "../../../utils/openingHoursChecker";

/**
 * Google Places API (Legacy) — Find Place + Place Details (R5 P4, D-27/D-30)
 * ใช้ Legacy เพราะ key เดิมใช้ได้ และรูปแบบ opening_hours (periods/weekday_text) ตรงกับ openingHoursChecker.ts
 * ⚠️ ทุก request มีค่าใช้จ่าย — test ต้องส่ง fetchFn ปลอมเข้ามาเสมอ ห้ามเรียกของจริง
 */

const FIND_PLACE_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

// Find Place ขอแค่ field พื้นฐาน (ถูกกว่า) — ข้อมูลที่เหลือขอใน Details หลังจับคู่ผ่านแล้วเท่านั้น
const FIND_PLACE_FIELDS = "place_id,name,geometry,formatted_address";
// field เดิมของ data-pipeline + type (ขอชื่อ "type" แต่ Google คืนเป็น "types")
const DETAILS_FIELDS =
  "place_id,name,formatted_address,formatted_phone_number,website,opening_hours,rating,price_level,user_ratings_total,geometry,type";

export const BIAS_RADIUS_METERS = 1000;

// status ที่ทำต่อไม่ได้ทั้ง job (key ผิด/โควต้าหมด) — แถวอื่นจะเจอเหมือนกันหมด
const FATAL_STATUSES = new Set(["REQUEST_DENIED", "OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT"]);

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GoogleCandidate {
  place_id: string;
  name?: string;
  formatted_address?: string;
  geometry?: { location?: LatLng };
}

export interface GoogleDetails {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: OpeningHours;
  rating?: number;
  price_level?: number;
  user_ratings_total?: number;
  geometry?: { location?: LatLng };
  types?: string[];
}

export interface GooglePlacesClient {
  /** null = ไม่พบ (ZERO_RESULTS หรือไม่มี candidate) */
  findPlace(query: string, bias: LatLng): Promise<GoogleCandidate | null>;
  getDetails(placeId: string): Promise<GoogleDetails>;
}

export class GoogleApiError extends Error {
  constructor(readonly status: string, message: string) {
    super(message);
    this.name = "GoogleApiError";
  }

  /** true = หยุดทั้ง job */
  get fatal(): boolean {
    return FATAL_STATUSES.has(this.status);
  }
}

type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface GoogleResponse {
  status?: string;
  error_message?: string;
  candidates?: GoogleCandidate[];
  result?: GoogleDetails;
}

export function createGooglePlacesClient(apiKey: string, fetchFn: FetchFn = fetch): GooglePlacesClient {
  async function call(baseUrl: string, params: Record<string, string>): Promise<GoogleResponse> {
    const url = `${baseUrl}?${new URLSearchParams({ ...params, language: "th", key: apiKey })}`;
    const res = await fetchFn(url);
    if (!res.ok) throw new GoogleApiError(`HTTP_${res.status}`, `Google ตอบ HTTP ${res.status}`);
    return (await res.json()) as GoogleResponse;
  }

  // ข้อความ error ไม่ใส่ URL (มี key อยู่ใน query string)
  const fail = (body: GoogleResponse): never => {
    const status = body.status ?? "UNKNOWN";
    throw new GoogleApiError(status, `Google status ${status}${body.error_message ? `: ${body.error_message}` : ""}`);
  };

  return {
    async findPlace(query, bias) {
      const body = await call(FIND_PLACE_URL, {
        input: query,
        inputtype: "textquery",
        locationbias: `circle:${BIAS_RADIUS_METERS}@${bias.lat},${bias.lng}`,
        fields: FIND_PLACE_FIELDS,
      });
      if (body.status === "ZERO_RESULTS") return null;
      if (body.status !== "OK") fail(body);
      return body.candidates?.[0] ?? null;
    },

    async getDetails(placeId) {
      const body = await call(DETAILS_URL, { place_id: placeId, fields: DETAILS_FIELDS });
      if (body.status !== "OK" || !body.result) fail(body);
      return body.result!;
    },
  };
}
