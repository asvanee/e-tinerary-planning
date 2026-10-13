/**
 * weatherForecast.ts — ดึงโอกาสฝนตกเฉลี่ยตามช่วงวันเดินทางจาก Open-Meteo (v1: ฝนอย่างเดียว)
 *
 * หลักการ (ตามมติ):
 * - ทริปหลายวัน → เฉลี่ย precipitation_probability_max รายวันของ "วันที่มีพยากรณ์" ในช่วงนั้น
 *   (ขั้นคำนวณ POI เกิดก่อนจัด itinerary จึงยังไม่รู้ว่า place จะลงวันไหน และ poi_scores
 *   เก็บคะแนนต่อ place ค่าเดียวต่อทริป)
 * - วันที่เกินช่วงพยากรณ์ของ Open-Meteo (ประมาณ 16 วันข้างหน้า) หรือวันที่ผ่านมาแล้ว → ข้าม
 *   ถ้าไม่เหลือวันไหนเลย → ไม่มีค่าให้ grid นั้น (caller ใช้ null → weather_score = 1.0)
 * - ปัดพิกัดเป็นกริด 0.1° (~11 กม.) สถานที่ที่อยู่กริดเดียวกันใช้พยากรณ์ชุดเดียวกัน
 *   ส่งหลายกริดใน request เดียว (แบ่งเป็นก้อนละ CHUNK_SIZE) + แคชในหน่วยความจำ
 * - ห้าม throw: API ล่ม/timeout/ตอบผิดรูปแบบ → ข้ามกริดนั้น ไม่ทำให้ทั้งคำขอล้ม
 *
 * หมายเหตุ: ใช้ fetch ของ Node 18+ (ไม่พึ่ง axios) — ถ้า backend ใช้ Node เก่ากว่านี้ต้องเปลี่ยน
 * Open-Meteo ฟรีสำหรับงานไม่เชิงพาณิชย์ ควรเช็กเงื่อนไขการใช้งานอีกครั้งถ้านำไปใช้จริง
 */

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FORECAST_MAX_DAYS_AHEAD = 15; // วันนี้ + 15 วัน (Open-Meteo รองรับสูงสุด 16 วันรวมวันนี้)
const GRID_DECIMALS = 1; // 0.1° ≈ 11 กม.
const CHUNK_SIZE = 50; // จำนวนกริดต่อ request (กัน URL ยาวเกิน)
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 ชั่วโมง

export interface LatLng {
  lat: number;
  lng: number;
}

/** คีย์กริดของพิกัด เช่น "13.7,100.5" — ใช้ทั้งตอนขอพยากรณ์และตอนค้นผลต่อ place */
export function gridKey(lat: number, lng: number): string {
  return `${lat.toFixed(GRID_DECIMALS)},${lng.toFixed(GRID_DECIMALS)}`;
}

// ---------- วันที่ (สตริง YYYY-MM-DD เทียบกันตรงๆ ได้) ----------

function todayInBangkok(): string {
  // เวลาไทย = UTC+7 (ไม่มี DST)
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ตัดช่วงวันเดินทางให้อยู่ในช่วงที่ขอพยากรณ์ได้ (วันนี้ .. วันนี้+15)
 * คืน null ถ้าไม่เหลือวันไหนเลย หรือรูปแบบวันที่ไม่ถูกต้อง
 */
export function clampToForecastWindow(
  startDate: string,
  endDate: string,
  today: string = todayInBangkok()
): { start: string; end: string } | null {
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) return null;

  const windowEnd = addDays(today, FORECAST_MAX_DAYS_AHEAD);
  const start = startDate > today ? startDate : today;
  const end = endDate < windowEnd ? endDate : windowEnd;

  return start <= end ? { start, end } : null;
}

// ---------- แคช ----------

const cache = new Map<string, { at: number; value: number | null }>();

// ---------- ดึงพยากรณ์ ----------

function averageOf(values: unknown): number | null {
  if (!Array.isArray(values)) return null;
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

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
    // หลายพิกัด → array, พิกัดเดียว → object เดี่ยว
    const list: any[] = Array.isArray(json) ? json : [json];

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
  } catch (err: any) {
    console.error(`Open-Meteo fetch error: ${err?.message ?? err}`);
  }

  return out;
}

/**
 * คืน Map<gridKey, โอกาสฝนเฉลี่ย (%) ของช่วงวันเดินทาง> เฉพาะกริดที่มีข้อมูลจริง
 * กริดที่ไม่มีใน Map (API พลาด / วันอยู่นอกช่วงพยากรณ์) → caller ใช้ null → weather_score 1.0
 * ไม่ throw
 */
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
  const toFetch: string[] = [];

  for (const g of grids) {
    const hit = cache.get(`${g}|${range.start}|${range.end}`);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      if (hit.value !== null) result.set(g, hit.value);
    } else {
      toFetch.push(g);
    }
  }

  for (let i = 0; i < toFetch.length; i += CHUNK_SIZE) {
    const chunk = toFetch.slice(i, i + CHUNK_SIZE);
    const fetched = await fetchChunk(chunk, range.start, range.end);

    for (const g of chunk) {
      const value = fetched.get(g) ?? null;
      // แคชเฉพาะที่ได้ค่าจริง — ถ้า API พลาดจะได้ลองใหม่รอบหน้า ไม่ติดค่า null ค้างนาน 2 ชม.
      if (value !== null) {
        cache.set(`${g}|${range.start}|${range.end}`, { at: now, value });
        result.set(g, value);
      }
    }
  }

  return result;
}