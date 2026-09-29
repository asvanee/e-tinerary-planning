import { getOrsConfig, isOrsConfigured } from "../config/ors";
import { haversineKm } from "./haversine";

/**
 * Travel matrix แบบ many-to-many สำหรับ Itinerary (ระยะทาง + เวลาเดินทางตามถนนจาก ORS)
 *
 * แยกจาก orsDistance.ts (1 ต้นทาง × N ปลายทาง สำหรับ POI Recommendation) โดยเจตนา — ไม่แตะไฟล์นั้น
 *
 * - ยิง ORS Matrix ครั้งเดียวสำหรับทุกจุด (ขอ distance + duration) 51 จุด = 2,601 คู่ ยังอยู่ใต้ลิมิต
 *   ของ ORS; ถ้าจุดเยอะกว่านั้นจะแบ่งยิงเป็นชุดของ "แถวต้นทาง" อัตโนมัติ
 * - cache ระดับคู่ (from -> to) ในหน่วยความจำ: draft แล้ว confirm ตามมาจะไม่เสียโควต้าซ้ำ
 *   และได้ตัวเลขเดียวกับที่ user เห็นตอนลากจัดแผน
 * - ไม่ throw เด็ดขาด: ไม่มี key / timeout / โควต้าหมด / เน็ตล่ม / ORS คืน null รายคู่
 *   -> fallback เฉพาะคู่นั้นเป็น haversine ÷ FALLBACK_AVG_SPEED_KMH (source = "haversine")
 * - ผลลัพธ์เป็น plain object ล้วน serialize เป็น JSON ส่ง frontend ได้ตรงๆ
 */

/** reserved id ของจุดเริ่มต้นทริป ใช้เป็น key ใน TravelMatrix (ต้องตรงกับ frontend port) */
export const TRIP_START_ID = "__trip_start__";

/** ใช้เฉพาะคู่ที่ไม่มีข้อมูลจริงจาก ORS เท่านั้น — ห้ามใช้ถ้า ORS มี duration จริง */
export const FALLBACK_AVG_SPEED_KMH = 25;

export interface TravelMetric {
  distanceKm: number;
  durationMin: number;
  source: "ors" | "haversine";
}

/** matrix[fromId][toId] — ไม่มี entry แนวทแยง (from === to) */
export type TravelMatrix = Record<string, Record<string, TravelMetric>>;

export interface TravelPoint {
  id: string;
  latitude: number;
  longitude: number;
}

/** ลิมิตจำนวนคู่ต่อ 1 request ของ ORS Matrix (แผน standard = 3,500) */
const ORS_MAX_MATRIX_ROUTES = 3500;

// ---------- cache ----------

interface CacheEntry {
  km: number;
  min: number;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 100_000;
const pairCache = new Map<string, CacheEntry>();

function coord(n: number): string {
  return n.toFixed(5);
}

function pairKey(profile: string, a: TravelPoint, b: TravelPoint): string {
  return `${profile}|${coord(a.latitude)},${coord(a.longitude)}|${coord(
    b.latitude
  )},${coord(b.longitude)}`;
}

function cacheGet(key: string, now: number): CacheEntry | undefined {
  const entry = pairCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    pairCache.delete(key);
    return undefined;
  }
  return entry;
}

function cacheSet(key: string, km: number, min: number, expiresAt: number) {
  if (pairCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = pairCache.keys().next().value;
    if (oldest !== undefined) pairCache.delete(oldest);
  }
  pairCache.set(key, { km, min, expiresAt });
}

/** ใช้ในเทสต์เท่านั้น */
export function clearOrsTravelMatrixCache(): void {
  pairCache.clear();
}

// ---------- ORS request ----------

interface OrsRawMatrix {
  distances: (number | null)[][]; // km
  durations: (number | null)[][]; // วินาที
}

/**
 * ยิง ORS เป็นชุดของแถวต้นทาง (destinations = ทุกจุดเสมอ)
 * ไม่ throw: ถ้าชุดไหนล้ม จะหยุดยิงชุดที่เหลือ (กันเปลืองโควต้า) แล้วคืนเท่าที่ได้ — แถวที่ไม่ได้จะเป็น null
 */
async function fetchOrsMatrix(points: TravelPoint[]): Promise<OrsRawMatrix> {
  const cfg = getOrsConfig();
  const n = points.length;

  const distances: (number | null)[][] = points.map(() => new Array(n).fill(null));
  const durations: (number | null)[][] = points.map(() => new Array(n).fill(null));

  const rowsPerRequest = Math.max(1, Math.floor(ORS_MAX_MATRIX_ROUTES / n));
  const allIndices = points.map((_, i) => i);
  // ORS ใช้ [lng, lat] (ไม่ใช่ [lat, lng])
  const locations = points.map((p) => [p.longitude, p.latitude]);

  for (let start = 0; start < n; start += rowsPerRequest) {
    const sources = allIndices.slice(start, start + rowsPerRequest);

    try {
      const res = await fetch(`${cfg.baseUrl}/v2/matrix/${cfg.profile}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: cfg.apiKey,
        },
        signal: AbortSignal.timeout(cfg.timeoutMs),
        body: JSON.stringify({
          locations,
          sources,
          destinations: allIndices,
          metrics: ["distance", "duration"],
          units: "km",
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ORS matrix ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = (await res.json()) as {
        distances?: (number | null)[][];
        durations?: (number | null)[][];
      };

      if (
        !json.distances ||
        !json.durations ||
        json.distances.length !== sources.length ||
        json.durations.length !== sources.length
      ) {
        throw new Error("ORS matrix: รูปแบบผลลัพธ์ไม่ตรงกับที่ขอ");
      }

      sources.forEach((rowIdx, k) => {
        const dRow = json.distances![k];
        const tRow = json.durations![k];
        if (dRow.length !== n || tRow.length !== n) return;
        distances[rowIdx] = dRow;
        durations[rowIdx] = tRow;
      });
    } catch (err) {
      console.warn(
        "[orsTravelMatrix] ORS ไม่สำเร็จ ใช้ haversine กับคู่ที่เหลือ:",
        err instanceof Error ? err.message : err
      );
      break;
    }
  }

  return { distances, durations };
}

// ---------- public API ----------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * เวลาเดินทางเป็นนาทีเต็ม ขั้นต่ำ 1 นาทีเสมอ (คนละสถานที่ไม่มีทางเดินทางได้ 0 นาที) —
 * กันการ์ดโชว์ "เดินทาง 0 นาที" เมื่อสองที่อยู่ติดกัน (ปัดเศษวินาทีลงเหลือ 0)
 * ต้องตรงกับ fallback ใน itineraryBuilder ทั้ง backend/frontend
 */
function toMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * สร้าง travel matrix ของทุกคู่ (from != to) ระหว่างจุดที่ส่งมา
 * ส่ง trip start เข้ามาเป็นจุดหนึ่งด้วย id = TRIP_START_ID
 */
export async function buildTravelMatrix(
  input: TravelPoint[]
): Promise<TravelMatrix> {
  // dedupe ตาม id (เก็บตัวแรก)
  const seen = new Set<string>();
  const points = input.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const matrix: TravelMatrix = {};
  for (const p of points) matrix[p.id] = {};
  if (points.length < 2) return matrix;

  const cfg = getOrsConfig();
  const now = Date.now();
  const n = points.length;

  // 1) ดึงจาก cache ก่อน
  const known: ({ km: number; min: number } | undefined)[][] = points.map(() =>
    new Array(n).fill(undefined)
  );
  let anyMissing = false;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const hit = cacheGet(pairKey(cfg.profile, points[i], points[j]), now);
      if (hit) known[i][j] = { km: hit.km, min: hit.min };
      else anyMissing = true;
    }
  }

  // 2) ยิง ORS ถ้ายังมีคู่ที่ไม่มีข้อมูล (ยิงทั้งก้อน 1 request — โควต้านับเป็น request)
  if (anyMissing && isOrsConfigured()) {
    const raw = await fetchOrsMatrix(points);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || known[i][j]) continue;
        const km = raw.distances[i][j];
        const sec = raw.durations[i][j];
        // null = ORS หาถนนใกล้จุดนั้นไม่เจอ -> ปล่อยให้ fallback ด้านล่าง
        if (isFiniteNumber(km) && isFiniteNumber(sec)) {
          const entry = { km: round2(km), min: toMinutes(sec) };
          known[i][j] = entry;
          cacheSet(
            pairKey(cfg.profile, points[i], points[j]),
            entry.km,
            entry.min,
            now + cfg.cacheTtlMs
          );
        }
      }
    }
  }

  // 3) ประกอบผล: ORS ถ้ามี ไม่งั้น haversine เฉพาะคู่นั้น
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ors = known[i][j];
      if (ors) {
        matrix[points[i].id][points[j].id] = {
          distanceKm: ors.km,
          durationMin: ors.min,
          source: "ors",
        };
      } else {
        const km = haversineKm(
          points[i].latitude,
          points[i].longitude,
          points[j].latitude,
          points[j].longitude
        );
        matrix[points[i].id][points[j].id] = {
          distanceKm: round2(km),
          durationMin: toMinutes((km / FALLBACK_AVG_SPEED_KMH) * 3600),
          source: "haversine",
        };
      }
    }
  }

  return matrix;
}