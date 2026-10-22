import { haversineKm } from "../../../utils/haversine";
import { AttractionRow } from "../attractionTypes";
import { displayName, isJunkName, namesStrictlyMatch, parseCoords } from "../dedupe/normalize";
import { RowIssue } from "./reviewTypes";

export const NEAR_POINTS_METERS = 50;
export const FAR_FROM_PROVINCE_KM = 150;

// กรอบพิกัดประเทศไทยแบบหยาบ (ใช้กันพิกัดที่ผิดชัดๆ เช่นสลับ lat/lng หรืออยู่ต่างประเทศ)
export function isInThailand(c: { lat: number; lng: number }): boolean {
  return c.lat >= 5.6 && c.lat <= 20.5 && c.lng >= 97.3 && c.lng <= 105.7;
}

export function distanceMeters(a: AttractionRow, b: AttractionRow): number | null {
  const ca = parseCoords(a);
  const cb = parseCoords(b);
  if (!ca || !cb) return null;
  return haversineKm(ca.lat, ca.lng, cb.lat, cb.lng) * 1000;
}

// รวมคู่ที่เข้าเงื่อนไขเป็นกลุ่ม (connected components) — คงลำดับตามแถวใน CSV
function groupPairs(rows: AttractionRow[], isPair: (a: AttractionRow, b: AttractionRow) => boolean): string[][] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const linked = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (!isPair(rows[i], rows[j])) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[rj] = ri;
      linked.add(i).add(j);
    }
  }

  const groups = new Map<number, string[]>();
  [...linked].sort((a, b) => a - b).forEach((i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), rows[i].ATT_ID]);
  });
  return [...groups.values()];
}

/** ชื่อเหมือน/คล้ายกัน (เกณฑ์เดียวกับ dedupe: เหมือนเป๊ะหลัง normalize หรือครอบกันและยาวต่างไม่เกิน 6) */
export function findSimilarNameGroups(
  rows: AttractionRow[],
  skipPair: (a: AttractionRow, b: AttractionRow) => boolean
): string[][] {
  return groupPairs(rows, (a, b) => !skipPair(a, b) && namesStrictlyMatch(displayName(a), displayName(b)));
}

/** พิกัดห่างกันไม่เกิน 50 m แต่ชื่อไม่ตรงกัน — Google มีโอกาสคืนสถานที่เดียวกันให้ทั้งคู่ (upsert ทับกัน) */
export function findNearPointGroups(
  rows: AttractionRow[],
  skipPair: (a: AttractionRow, b: AttractionRow) => boolean
): string[][] {
  return groupPairs(rows, (a, b) => {
    if (skipPair(a, b)) return false;
    const meters = distanceMeters(a, b);
    return meters !== null && meters <= NEAR_POINTS_METERS && !namesStrictlyMatch(displayName(a), displayName(b));
  });
}

// ศูนย์กลางจังหวัด = median ของพิกัดที่ valid และอยู่ในไทย (ทนต่อพิกัดผิดไม่กี่แถว)
export function provinceCenter(rows: AttractionRow[]): { lat: number; lng: number } | null {
  const coords = rows.map(parseCoords).filter((c): c is { lat: number; lng: number } => !!c && isInThailand(c));
  if (coords.length === 0) return null;
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return { lat: median(coords.map((c) => c.lat)), lng: median(coords.map((c) => c.lng)) };
}

const isBlank = (value?: string) => !value || !value.trim() || value.trim() === "ไม่มี";

export function detectRowIssues(row: AttractionRow, center: { lat: number; lng: number } | null): RowIssue[] {
  const issues: RowIssue[] = [];

  if (isBlank(row.ATT_NAME_TH) && isBlank(row.ATT_NAME_EN)) {
    issues.push({ type: "missing_name", detail: "ไม่มีชื่อทั้งภาษาไทยและอังกฤษ" });
  } else if (isJunkName(row)) {
    issues.push({ type: "junk_name", detail: `ชื่อดูเป็น record ทดสอบ: "${displayName(row)}"` });
  }

  const coords = parseCoords(row);
  if (!coords) {
    issues.push({
      type: "invalid_location",
      detail: row.ATT_LOCATION?.trim() ? `พิกัดใช้ไม่ได้: "${row.ATT_LOCATION.trim()}"` : "ไม่มีพิกัด",
    });
  } else if (!isInThailand(coords)) {
    issues.push({ type: "outside_thailand", detail: `พิกัด ${coords.lat}, ${coords.lng} อยู่นอกประเทศไทย` });
  } else if (center) {
    const km = haversineKm(coords.lat, coords.lng, center.lat, center.lng);
    if (km > FAR_FROM_PROVINCE_KM) {
      issues.push({
        type: "far_from_province",
        detail: `ห่างจากศูนย์กลางของสถานที่ในจังหวัดนี้ ${Math.round(km)} km (เกณฑ์ ${FAR_FROM_PROVINCE_KM} km)`,
      });
    }
  }

  const status = row.ATT_STATUS?.trim();
  if (status && status !== "1") {
    const remark = row.ATT_STATUS_REMARK?.trim();
    issues.push({ type: "status_not_active", detail: `ATT_STATUS = ${status}${remark ? ` (${remark})` : ""}` });
  }

  return issues;
}
