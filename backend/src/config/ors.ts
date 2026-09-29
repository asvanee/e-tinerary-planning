/**
 * OpenRouteService config (ฝั่ง backend เท่านั้น — key ห้ามส่งไป frontend)
 *
 * ใช้ฟังก์ชัน getter แทนการอ่าน process.env ตอน import เพื่อไม่ให้พังถ้า dotenv.config()
 * ถูกเรียกหลังไฟล์นี้ถูก import (อ่านค่าตอนเรียกใช้จริงเสมอ)
 *
 *   ORS_API_KEY           (บังคับ) Basic Key จาก account.heigit.org/manage/key
 *   ORS_BASE_URL          default https://api.heigit.org/openrouteservice (ไม่ต้องมี / ท้าย)
 *                         ⚠️ โดเมนเก่า api.openrouteservice.org ถูกปิดแล้ว (28 ก.ย. 2026)
 *   ORS_PROFILE           default driving-car
 *   ORS_TIMEOUT_MS        default 8000
 *   ORS_MATRIX_CHUNK_SIZE default 500 (จำนวนสถานที่ปลายทางต่อ 1 request)
 *   ORS_CACHE_TTL_MS      default 86400000 (24 ชม.)
 */
export interface OrsConfig {
  apiKey: string;
  baseUrl: string;
  profile: string;
  timeoutMs: number;
  matrixChunkSize: number;
  cacheTtlMs: number;
}

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

/** false = ไม่มี key -> ผู้เรียกควรข้าม ORS แล้วใช้ haversine ทันที ไม่ต้องยิง request */
export function isOrsConfigured(): boolean {
  return getOrsConfig().apiKey.length > 0;
}