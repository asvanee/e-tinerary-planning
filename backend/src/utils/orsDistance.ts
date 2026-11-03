import { getOrsConfig, isOrsConfigured } from "../config/ors";
import { haversineKm } from "./haversine";
import { coordKey, postOrsMatrix } from "./orsMatrixRequest";
import { TtlCache } from "./ttlCache";

// ระยะทางถนนจากจุดเริ่มต้นไปแต่ละสถานที่ (ใช้ในหน้าแนะนำ POI)
// ยิง ORS เป็นก้อนเพราะโควต้านับเป็นจำนวน request · ที่ไหนไม่ได้ค่าจาก ORS ใช้ haversine แทน (ไม่ throw)

export type DistanceSource = "ors" | "haversine" | "mixed";

export interface DistancePlace {
  placeId: string;
  latitude: number;
  longitude: number;
}

export interface DistanceResult {
  distancesKm: Map<string, number>;
  source: DistanceSource;
  // ให้หน้าเว็บรู้ว่าการ์ดไหนเป็นระยะเส้นตรงโดยประมาณ
  perPlaceSource: Map<string, "ors" | "haversine">;
}

const distanceCache = new TtlCache<number>(50_000);

function cacheKey(
  profile: string,
  startLat: number,
  startLng: number,
  place: DistancePlace
): string {
  return `${profile}|${coordKey(startLat, startLng)}|${coordKey(place.latitude, place.longitude)}`;
}

async function fetchMatrixChunk(
  startLat: number,
  startLng: number,
  chunk: DistancePlace[]
): Promise<(number | null)[]> {
  // index 0 = จุดเริ่มต้น, 1..n = สถานที่
  const json = await postOrsMatrix({
    locations: [
      [startLng, startLat],
      ...chunk.map((p) => [p.longitude, p.latitude]),
    ],
    sources: [0],
    destinations: chunk.map((_, i) => i + 1),
    metrics: ["distance"],
    units: "km",
  });

  const row = json.distances?.[0];
  if (!row || row.length !== chunk.length) {
    throw new Error("ORS matrix: รูปแบบผลลัพธ์ไม่ตรงกับที่ขอ");
  }
  return row;
}

export async function getRoadDistancesKm(
  startLat: number,
  startLng: number,
  places: DistancePlace[]
): Promise<DistanceResult> {
  const cfg = getOrsConfig();
  const now = Date.now();

  const roadKm = new Map<string, number>();
  const missing: DistancePlace[] = [];

  for (const place of places) {
    const cached = distanceCache.get(cacheKey(cfg.profile, startLat, startLng, place), now);
    if (cached !== undefined) roadKm.set(place.placeId, cached);
    else missing.push(place);
  }

  if (missing.length > 0 && isOrsConfigured()) {
    for (let i = 0; i < missing.length; i += cfg.matrixChunkSize) {
      const chunk = missing.slice(i, i + cfg.matrixChunkSize);

      try {
        const row = await fetchMatrixChunk(startLat, startLng, chunk);
        chunk.forEach((place, idx) => {
          const km = row[idx];
          // null = ORS หาถนนใกล้จุดนั้นไม่เจอ -> ใช้ haversine ด้านล่าง
          if (typeof km === "number" && Number.isFinite(km)) {
            roadKm.set(place.placeId, km);
            distanceCache.set(cacheKey(cfg.profile, startLat, startLng, place), km, now + cfg.cacheTtlMs);
          }
        });
      } catch (err) {
        // ล้มทั้งก้อน — หยุดยิงก้อนที่เหลือ ไม่ให้เปลืองโควต้า
        console.warn(
          "[orsDistance] ORS ไม่สำเร็จ ใช้ haversine กับที่เหลือ:",
          err instanceof Error ? err.message : err
        );
        break;
      }
    }
  }

  const distancesKm = new Map<string, number>();
  const perPlaceSource = new Map<string, "ors" | "haversine">();

  for (const place of places) {
    const ors = roadKm.get(place.placeId);
    distancesKm.set(
      place.placeId,
      ors ?? haversineKm(startLat, startLng, place.latitude, place.longitude)
    );
    perPlaceSource.set(place.placeId, ors !== undefined ? "ors" : "haversine");
  }

  const sources = new Set(perPlaceSource.values());
  const source: DistanceSource = !sources.has("haversine")
    ? "ors"
    : !sources.has("ors")
      ? "haversine"
      : "mixed";

  return { distancesKm, source, perPlaceSource };
}
