import { getOrsConfig, isOrsConfigured } from "../config/ors";
import { haversineKm } from "./haversine";
import { coordKey, postOrsMatrix } from "./orsMatrixRequest";
import { TtlCache } from "./ttlCache";

// ระยะทาง + เวลาเดินทางของทุกคู่สถานที่ (ใช้จัดลำดับการเดินทาง)
// cache รายคู่ ตอนยืนยันแผนจะได้ตัวเลขเดียวกับตอนจัด · คู่ที่ ORS ไม่มีค่าใช้ haversine ที่ 25 กม./ชม. (ไม่ throw)

// id ของจุดเริ่มต้นทริปใน matrix (ต้องตรงกับฝั่ง frontend)
export const TRIP_START_ID = "__trip_start__";

export const FALLBACK_AVG_SPEED_KMH = 25;

export interface TravelMetric {
  distanceKm: number;
  durationMin: number;
  source: "ors" | "haversine";
}

// matrix[fromId][toId] (ไม่มีคู่ที่ from === to)
export type TravelMatrix = Record<string, Record<string, TravelMetric>>;

export interface TravelPoint {
  id: string;
  latitude: number;
  longitude: number;
}

// ORS รับได้สูงสุด 3,500 คู่ต่อ request
const ORS_MAX_MATRIX_ROUTES = 3500;

interface PairMetric {
  km: number;
  min: number;
}

const pairCache = new TtlCache<PairMetric>(100_000);

function pairKey(profile: string, a: TravelPoint, b: TravelPoint): string {
  return `${profile}|${coordKey(a.latitude, a.longitude)}|${coordKey(b.latitude, b.longitude)}`;
}

// ยิง ORS ทีละชุดของต้นทาง — ชุดไหนล้มจะหยุด แล้วคืนเท่าที่ได้ (ที่เหลือเป็น null)
async function fetchOrsMatrix(points: TravelPoint[]) {
  const n = points.length;
  const distances: (number | null)[][] = points.map(() => new Array(n).fill(null));
  const durations: (number | null)[][] = points.map(() => new Array(n).fill(null));

  const rowsPerRequest = Math.max(1, Math.floor(ORS_MAX_MATRIX_ROUTES / n));
  const allIndices = points.map((_, i) => i);
  const locations = points.map((p) => [p.longitude, p.latitude]);

  for (let start = 0; start < n; start += rowsPerRequest) {
    const sources = allIndices.slice(start, start + rowsPerRequest);

    try {
      const json = await postOrsMatrix({
        locations,
        sources,
        destinations: allIndices,
        metrics: ["distance", "duration"],
        units: "km",
      });
      const dRows = json.distances;
      const tRows = json.durations;
      if (!dRows || !tRows || dRows.length !== sources.length || tRows.length !== sources.length) {
        throw new Error("ORS matrix: รูปแบบผลลัพธ์ไม่ตรงกับที่ขอ");
      }

      sources.forEach((rowIdx, k) => {
        if (dRows[k].length !== n || tRows[k].length !== n) return;
        distances[rowIdx] = dRows[k];
        durations[rowIdx] = tRows[k];
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// วินาที -> นาที ขั้นต่ำ 1 นาที (กันโชว์ "เดินทาง 0 นาที") — ต้องตรงกับ itineraryBuilder ทั้งสองฝั่ง
function toMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// สร้าง matrix ของทุกคู่ (ส่งจุดเริ่มต้นมาด้วย id = TRIP_START_ID · id ซ้ำใช้ตัวแรก)
export async function buildTravelMatrix(input: TravelPoint[]): Promise<TravelMatrix> {
  const seen = new Set<string>();
  const points = input.filter((p) => !seen.has(p.id) && seen.add(p.id));

  const matrix: TravelMatrix = {};
  for (const p of points) matrix[p.id] = {};
  if (points.length < 2) return matrix;

  const cfg = getOrsConfig();
  const now = Date.now();
  const n = points.length;

  const known: (PairMetric | undefined)[][] = points.map(() => new Array(n).fill(undefined));
  let anyMissing = false;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      known[i][j] = pairCache.get(pairKey(cfg.profile, points[i], points[j]), now);
      if (!known[i][j]) anyMissing = true;
    }
  }

  if (anyMissing && isOrsConfigured()) {
    const raw = await fetchOrsMatrix(points);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || known[i][j]) continue;
        const km = raw.distances[i][j];
        const sec = raw.durations[i][j];
        // null = ORS หาถนนใกล้จุดนั้นไม่เจอ -> fallback ด้านล่าง
        if (isFiniteNumber(km) && isFiniteNumber(sec)) {
          const entry = { km: round2(km), min: toMinutes(sec) };
          known[i][j] = entry;
          pairCache.set(pairKey(cfg.profile, points[i], points[j]), entry, now + cfg.cacheTtlMs);
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ors = known[i][j];
      if (ors) {
        matrix[points[i].id][points[j].id] = { distanceKm: ors.km, durationMin: ors.min, source: "ors" };
        continue;
      }
      const km = haversineKm(points[i].latitude, points[i].longitude, points[j].latitude, points[j].longitude);
      matrix[points[i].id][points[j].id] = {
        distanceKm: round2(km),
        durationMin: toMinutes((km / FALLBACK_AVG_SPEED_KMH) * 3600),
        source: "haversine",
      };
    }
  }

  return matrix;
}
