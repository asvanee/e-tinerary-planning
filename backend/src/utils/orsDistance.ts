import { getOrsConfig, isOrsConfigured } from "../config/ors";
import { haversineKm } from "./haversine";

/**
 * ระยะทางถนนจากจุดเริ่มต้นไปแต่ละสถานที่ ผ่าน ORS Matrix (1 ต้นทาง × N ปลายทาง)
 *
 * - ยิง ORS ต่อ "chunk" (default 500 ที่ต่อ request) — โควต้า Matrix ของ ORS นับเป็นจำนวน
 *   request ไม่ใช่จำนวนคู่ (เช็คจริงแล้ว: x-ratelimit-limit = 500 ต่อวัน)
 * - cache ระดับคู่ (จุดเริ่มต้น -> สถานที่) ในหน่วยความจำ ยิงเฉพาะคู่ที่ยังไม่เคยมี
 * - ไม่ throw เด็ดขาด: ORS พลาด/ไม่มี key/ได้ null รายจุด -> ใช้ haversine แทน
 *   แล้วบอกผ่าน `source` ให้ผู้เรียกส่งต่อไปที่ frontend
 * - ผลลัพธ์ทุก placeId ใน input มีค่าใน Map เสมอ (ไม่มี undefined)
 */

export type DistanceSource = "ors" | "haversine" | "mixed";

export interface DistancePlace {
  placeId: string;
  latitude: number;
  longitude: number;
}

export interface DistanceResult {
  distancesKm: Map<string, number>;
  source: DistanceSource;
  /** แหล่งของระยะทางรายสถานที่ — ให้ frontend ระบุได้ว่าการ์ดไหนเป็นค่าประมาณเส้นตรง */
  perPlaceSource: Map<string, "ors" | "haversine">;
}

// ---------- cache ----------

interface CacheEntry {
  km: number;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 50_000;
const distanceCache = new Map<string, CacheEntry>();

function round5(n: number): string {
  return n.toFixed(5);
}

function cacheKey(
  profile: string,
  startLat: number,
  startLng: number,
  place: DistancePlace
): string {
  return `${profile}|${round5(startLat)},${round5(startLng)}|${round5(
    place.latitude
  )},${round5(place.longitude)}`;
}

function cacheGet(key: string, now: number): number | undefined {
  const entry = distanceCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    distanceCache.delete(key);
    return undefined;
  }
  return entry.km;
}

function cacheSet(key: string, km: number, expiresAt: number): void {
  if (distanceCache.size >= MAX_CACHE_ENTRIES) {
    // ลบตัวที่เก่าสุดก่อน (Map เรียงตามลำดับการ insert)
    const oldest = distanceCache.keys().next().value;
    if (oldest !== undefined) distanceCache.delete(oldest);
  }
  distanceCache.set(key, { km, expiresAt });
}

/** ใช้ในเทสต์เท่านั้น */
export function clearOrsDistanceCache(): void {
  distanceCache.clear();
}

// ---------- ORS request ----------

async function fetchMatrixChunk(
  startLat: number,
  startLng: number,
  chunk: DistancePlace[]
): Promise<(number | null)[]> {
  const cfg = getOrsConfig();

  const res = await fetch(`${cfg.baseUrl}/v2/matrix/${cfg.profile}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: cfg.apiKey,
    },
    signal: AbortSignal.timeout(cfg.timeoutMs),
    body: JSON.stringify({
      // ORS ใช้ [lng, lat] — index 0 = จุดเริ่มต้น, 1..n = สถานที่
      locations: [
        [startLng, startLat],
        ...chunk.map((p) => [p.longitude, p.latitude]),
      ],
      sources: [0],
      destinations: chunk.map((_, i) => i + 1),
      metrics: ["distance"],
      units: "km",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ORS matrix ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { distances?: (number | null)[][] };
  const row = json.distances?.[0];

  if (!row || row.length !== chunk.length) {
    throw new Error("ORS matrix: รูปแบบผลลัพธ์ไม่ตรงกับที่ขอ");
  }

  return row;
}

// ---------- public API ----------

export async function getRoadDistancesKm(
  startLat: number,
  startLng: number,
  places: DistancePlace[]
): Promise<DistanceResult> {
  const cfg = getOrsConfig();
  const now = Date.now();

  const roadKm = new Map<string, number>(); // เฉพาะค่าที่ได้จาก ORS จริง (cache + ที่เพิ่งยิง)
  const missing: DistancePlace[] = [];

  for (const place of places) {
    const cached = cacheGet(
      cacheKey(cfg.profile, startLat, startLng, place),
      now
    );
    if (cached !== undefined) {
      roadKm.set(place.placeId, cached);
    } else {
      missing.push(place);
    }
  }

  if (missing.length > 0 && isOrsConfigured()) {
    for (let i = 0; i < missing.length; i += cfg.matrixChunkSize) {
      const chunk = missing.slice(i, i + cfg.matrixChunkSize);

      try {
        const row = await fetchMatrixChunk(startLat, startLng, chunk);

        chunk.forEach((place, idx) => {
          const km = row[idx];
          if (typeof km === "number" && Number.isFinite(km)) {
            roadKm.set(place.placeId, km);
            cacheSet(
              cacheKey(cfg.profile, startLat, startLng, place),
              km,
              now + cfg.cacheTtlMs
            );
          }
          // null (ORS หาถนนใกล้จุดนั้นไม่เจอ) -> ปล่อยไว้ ใช้ haversine ด้านล่าง
        });
      } catch (err) {
        // ล้มทั้ง chunk (โควต้า/timeout/เน็ต) — หยุดเลย ไม่ยิง chunk ที่เหลือซ้ำให้เปลืองโควต้า
        console.warn(
          "[orsDistance] ORS ไม่สำเร็จ ใช้ haversine กับที่เหลือ:",
          err instanceof Error ? err.message : err
        );
        break;
      }
    }
  }

  // รวมผล: ORS ถ้ามี ไม่งั้น haversine
  const distancesKm = new Map<string, number>();
  const perPlaceSource = new Map<string, "ors" | "haversine">();
  let fromOrs = 0;
  let fromFallback = 0;

  for (const place of places) {
    const ors = roadKm.get(place.placeId);
    if (ors !== undefined) {
      distancesKm.set(place.placeId, ors);
      perPlaceSource.set(place.placeId, "ors");
      fromOrs++;
    } else {
      distancesKm.set(
        place.placeId,
        haversineKm(startLat, startLng, place.latitude, place.longitude)
      );
      perPlaceSource.set(place.placeId, "haversine");
      fromFallback++;
    }
  }

  const source: DistanceSource =
    fromFallback === 0 ? "ors" : fromOrs === 0 ? "haversine" : "mixed";

  return { distancesKm, source, perPlaceSource };
}