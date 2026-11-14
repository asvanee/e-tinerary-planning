import { getOrsConfig } from "../config/ors";

export interface OrsMatrixBody {
  // ORS ใช้ [lng, lat]
  locations: number[][];
  sources: number[];
  destinations: number[];
  metrics: ("distance" | "duration")[];
  units: "km";
}

export interface OrsMatrixResponse {
  distances?: (number | null)[][]; // km
  durations?: (number | null)[][]; // วินาที
}

// key ของพิกัดใน cache (ทศนิยม 5 ตำแหน่ง ≈ 1 ม.)
export function coordKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

// ยิง ORS Matrix 1 ครั้ง — HTTP ไม่สำเร็จจะ throw ให้ผู้เรียกไปใช้ haversine
export async function postOrsMatrix(body: OrsMatrixBody): Promise<OrsMatrixResponse> {
  const cfg = getOrsConfig();

  const res = await fetch(`${cfg.baseUrl}/v2/matrix/${cfg.profile}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: cfg.apiKey,
    },
    signal: AbortSignal.timeout(cfg.timeoutMs),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ORS matrix ${res.status}: ${text.slice(0, 200)}`);
  }

  return (await res.json()) as OrsMatrixResponse;
}
