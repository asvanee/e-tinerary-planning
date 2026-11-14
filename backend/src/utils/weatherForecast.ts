import { errorMessage } from "./errorMessage";
import { TtlCache } from "./ttlCache";

// โอกาสฝนตกเฉลี่ยทั้งช่วงทริปจาก Open-Meteo (ใช้คิดคะแนนสภาพอากาศของ POI)
// สถานที่ในกริด 0.1° (~11 กม.) เดียวกันใช้ค่าเดียวกัน · วันที่พยากรณ์ไม่ได้ข้ามไป
// ไม่มีพยากรณ์ = ไม่มีค่า (คะแนนสภาพอากาศเป็น 1.0) · API พลาดก็ข้าม ไม่ throw

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_MAX_DAYS_AHEAD = 15; // Open-Meteo พยากรณ์ได้ 16 วันรวมวันนี้
const GRID_DECIMALS = 1;
const CHUNK_SIZE = 50; // จำนวนกริดต่อ request (กัน URL ยาวเกิน)
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export interface LatLng {
  lat: number;
  lng: number;
}

// คีย์กริดของพิกัด เช่น "13.7,100.5"
export function gridKey(lat: number, lng: number): string {
  return `${lat.toFixed(GRID_DECIMALS)},${lng.toFixed(GRID_DECIMALS)}`;
}

// วันนี้ตามเวลาไทย "YYYY-MM-DD"
function todayInBangkok(): string {
  // เวลาไทย = UTC+7 (ไม่มี DST)
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// บวกวันให้วันที่ "YYYY-MM-DD"
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// วันสุดท้ายที่ Open-Meteo ยอมให้ขอ — API นับ "วันนี้" ตามวันที่ UTC ไม่ใช่ timezone ที่ส่งไป
// (เที่ยงคืน–7 โมงเช้าเวลาไทย วันที่ UTC ยังเป็นเมื่อวาน ถ้านับจากเวลาไทยจะขอเกิน 1 วันแล้ว error)
// ⚠️ ต้องแก้คู่กับ frontend/src/user/trip/create/tripDates.ts
export function forecastLastDay(now: number = Date.now()): string {
  return addDays(new Date(now).toISOString().slice(0, 10), FORECAST_MAX_DAYS_AHEAD);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ตัดช่วงวันเดินทางให้อยู่ในวันนี้ (เวลาไทย) ถึงวันสุดท้ายที่พยากรณ์ได้ — null ถ้าไม่เหลือวันหรือวันที่ผิดรูปแบบ
export function clampToForecastWindow(
  startDate: string,
  endDate: string,
  today: string = todayInBangkok(),
  windowEnd: string = forecastLastDay()
): { start: string; end: string } | null {
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) return null;

  const start = startDate > today ? startDate : today;
  const end = endDate < windowEnd ? endDate : windowEnd;

  return start <= end ? { start, end } : null;
}

// เก็บเฉพาะค่าที่ได้จริง API พลาดจะได้ลองใหม่รอบหน้า
const rainCache = new TtlCache<number>();

// ค่าเฉลี่ยของตัวเลขใน array (ข้ามค่าที่ไม่ใช่ตัวเลข) · ไม่มีเลยคืน null
function averageOf(values: unknown): number | null {
  if (!Array.isArray(values)) return null;
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

// ขอโอกาสฝนเฉลี่ยของกริดชุดหนึ่งจาก Open-Meteo ช่วง start–end · พลาดคืน Map ว่าง
async function fetchChunk(
  grids: string[],
  start: string,
  end: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();

  const params = new URLSearchParams({
    latitude: grids.map((g) => g.split(",")[0]).join(","),
    longitude: grids.map((g) => g.split(",")[1]).join(","),
    daily: "precipitation_probability_max",
    timezone: "Asia/Bangkok",
    start_date: start,
    end_date: end,
  });

  try {
    const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Open-Meteo HTTP ${res.status}`);
      return out;
    }

    const json = await res.json();
    // หลายพิกัด -> array, พิกัดเดียว -> object เดี่ยว
    const list: ({ daily?: { precipitation_probability_max?: unknown } } | null)[] =
      Array.isArray(json) ? json : [json];

    if (list.length !== grids.length) {
      console.error(
        `Open-Meteo returned ${list.length} results for ${grids.length} grids`
      );
      return out;
    }

    list.forEach((item, i) => {
      const avg = averageOf(item?.daily?.precipitation_probability_max);
      if (avg !== null) out.set(grids[i], avg);
    });
  } catch (err) {
    console.error(`Open-Meteo fetch error: ${errorMessage(err) ?? err}`);
  }

  return out;
}

// โอกาสฝนเฉลี่ย % ของแต่ละพิกัดในช่วงวันเดินทาง (รับพิกัด + วันเริ่ม/จบ) คืน Map<gridKey, %> เฉพาะกริดที่มีข้อมูล
export async function getAverageRainProbability(
  points: LatLng[],
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  const range = clampToForecastWindow(startDate, endDate);
  if (!range) return result;

  const grids = [
    ...new Set(
      points
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => gridKey(p.lat, p.lng))
    ),
  ];

  const now = Date.now();
  const cacheKey = (g: string) => `${g}|${range.start}|${range.end}`;
  const toFetch: string[] = [];

  for (const g of grids) {
    const hit = rainCache.get(cacheKey(g), now);
    if (hit !== undefined) result.set(g, hit);
    else toFetch.push(g);
  }

  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + CHUNK_SIZE);
    const fetched = await fetchChunk(chunk, range.start, range.end);

    for (const g of chunk) {
      const value = fetched.get(g);
      if (value !== undefined) {
        rainCache.set(cacheKey(g), value, now + CACHE_TTL_MS);
        result.set(g, value);
      }
    }
  }

  return result;
}
