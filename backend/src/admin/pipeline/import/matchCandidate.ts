import { haversineKm } from "../../../utils/haversine";
import { normalizeName } from "../dedupe/normalize";
import type { LatLng } from "./googlePlaces";

/**
 * เกณฑ์รับผลจาก Google (D-33 แทนที่ D-27 ข้อ "≤ 100 m รับเลย"): เทียบกับพิกัดและชื่อใน CSV
 * - ห่างไม่เกิน 1 km และชื่อคล้ายกัน → รับ
 * - ชื่อไม่คล้าย (แม้ห่าง 0 m), ห่างเกิน 1 km หรือ Google ไม่มีพิกัด → ส่งให้ admin ตัดสิน (needs_review_mismatch)
 * ระยะใกล้อย่างเดียวยืนยันไม่ได้ เพราะพิกัด CSV บางแถวคัดลอกมาจากหมุดของสิ่งที่อยู่ใกล้ๆ
 * (ทดลองน่าน: "เวียงภูเพียงแช่แห้ง" ห่าง 0 m จาก "วงเวียนพระธาตุแช่แห้ง")
 */
export const MAX_MATCH_METERS = 1000;
export const NAME_SIMILARITY_MIN = 0.6;

export type MatchResult =
  | { accepted: true; distanceM: number; reason: "similar_name" }
  | { accepted: false; distanceM: number | null; reason: "no_location" | "name_mismatch" | "too_far" };

// ระยะแก้ไข (insert/delete/replace) ระหว่าง 2 สตริง นับเป็นตัวอักษร (code point)
function levenshtein(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 0–1: 1 - ระยะแก้ไข / ความยาวของชื่อที่ยาวกว่า */
export function nameSimilarity(a: string, b: string): number {
  const ca = Array.from(a);
  const cb = Array.from(b);
  const maxLength = Math.max(ca.length, cb.length);
  return maxLength === 0 ? 0 : 1 - levenshtein(ca, cb) / maxLength;
}

const isBlankName = (value?: string) => !value || !value.trim() || value.trim() === "ไม่มี";

// เลขไทย ๐–๙ → 0–9 ก่อน normalize (เช่น "ตลาดน้ำ ๔,๐๐๐ ปี" กับ "ตลาดน้ำ 4000 ปี")
// ใช้เฉพาะการเทียบกับ Google — normalizeName ใช้ร่วมกับ dedupe จึงไม่แก้ที่นั่น
const normalizeForMatch = (value: string) =>
  normalizeName(value.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50)));

/**
 * ชื่อจาก Google คล้ายชื่อใน CSV (ไทยหรืออังกฤษ ไม่นับช่องว่าง/"ไม่มี") ไหม
 * คล้าย = หลัง normalize (รวมแปลงเลขไทย) แล้วชื่อหนึ่งอยู่ในอีกชื่อ หรือ nameSimilarity ≥ 0.6
 */
export function namesSimilar(googleName: string | undefined, csvNames: (string | undefined)[]): boolean {
  if (isBlankName(googleName)) return false;
  const g = normalizeForMatch(googleName!);
  if (!g) return false;

  return csvNames.some((name) => {
    if (isBlankName(name)) return false;
    const c = normalizeForMatch(name!);
    if (!c) return false;
    return g.includes(c) || c.includes(g) || nameSimilarity(g, c) >= NAME_SIMILARITY_MIN;
  });
}

export function matchCandidate(
  csvCoords: LatLng,
  googleCoords: LatLng | undefined,
  googleName: string | undefined,
  csvNames: (string | undefined)[]
): MatchResult {
  if (!googleCoords || !Number.isFinite(googleCoords.lat) || !Number.isFinite(googleCoords.lng)) {
    return { accepted: false, distanceM: null, reason: "no_location" };
  }

  const distanceM = haversineKm(csvCoords.lat, csvCoords.lng, googleCoords.lat, googleCoords.lng) * 1000;

  if (distanceM > MAX_MATCH_METERS) return { accepted: false, distanceM, reason: "too_far" };
  return namesSimilar(googleName, csvNames)
    ? { accepted: true, distanceM, reason: "similar_name" }
    : { accepted: false, distanceM, reason: "name_mismatch" };
}
