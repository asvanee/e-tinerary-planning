// ค่าตั้งของ OpenRouteService จาก env (มีค่า default) — อ่านตอนเรียกใช้ เผื่อ dotenv โหลดทีหลัง
export interface OrsConfig {
  apiKey: string;
  baseUrl: string;
  profile: string;
  timeoutMs: number;
  matrixChunkSize: number;
  cacheTtlMs: number;
}

// อ่านตัวเลขบวกจาก env ชื่อ name ถ้าไม่ใช่ตัวเลขบวกใช้ fallback
function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// รวมค่าตั้ง ORS จาก env คืนเป็น object (ไม่รับ parameter)
export function getOrsConfig(): OrsConfig {
  const baseUrl = (
    process.env.ORS_BASE_URL || "https://api.heigit.org/openrouteservice"
  ).replace(/\/+$/, "");

  return {
    apiKey: process.env.ORS_API_KEY ?? "",
    baseUrl,
    profile: process.env.ORS_PROFILE || "driving-car",
    timeoutMs: numberFromEnv("ORS_TIMEOUT_MS", 8000),
    matrixChunkSize: numberFromEnv("ORS_MATRIX_CHUNK_SIZE", 500),
    cacheTtlMs: numberFromEnv("ORS_CACHE_TTL_MS", 24 * 60 * 60 * 1000),
  };
}

// ไม่มี key = ไม่ยิง ORS ใช้ haversine แทน
export function isOrsConfigured(): boolean {
  return getOrsConfig().apiKey.length > 0;
}