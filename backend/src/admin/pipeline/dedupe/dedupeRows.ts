import { haversineKm } from "../../../utils/haversine";
import { AttractionRow } from "../attractionTypes";
import {
  BlockedPair,
  Confirmation,
  ContactMatch,
  DedupeResult,
  MergedGroup,
  ReviewGroup,
} from "./dedupeTypes";
import {
  displayName,
  isJunkName,
  namesStrictlyMatch,
  normalizePhone,
  normalizeWebsite,
  parseCoords,
} from "./normalize";

const LOCATION_PROXIMITY_METERS = 500;

const REVIEW_REASON = (matchedBy: ContactMatch[]) =>
  `แชร์ ${matchedBy.join("/")} เดียวกัน แต่ชื่อไม่คล้ายและพิกัดไม่ใกล้กัน (หรือไม่มีพิกัดยืนยัน) — น่าจะเป็น contact info ของหน่วยงานกลาง (เช่น ททท. จังหวัด) ไม่ใช่ของสถานที่เอง`;

class UnionFind {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }
  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent[rootB] = rootA;
  }
  // จัดกลุ่ม index ตาม root — ลำดับกลุ่ม/สมาชิกตามลำดับที่ส่งเข้ามา
  groups(indices: Iterable<number>): number[][] {
    const byRoot = new Map<number, number[]>();
    for (const i of indices) addTo(byRoot, this.find(i), i);
    return [...byRoot.values()];
  }
}

function addTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function addToSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

// รวม Set ของสมาชิกทุกตัวในกลุ่ม (คงลำดับที่เจอครั้งแรก)
function collect<V>(indices: number[], byIndex: Map<number, Set<V>>): V[] {
  const result = new Set<V>();
  indices.forEach((i) => byIndex.get(i)?.forEach((v) => result.add(v)));
  return [...result];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * ตัดสินว่า 2 แถวเป็นสถานที่เดียวกันจริงไหม:
 * - มีพิกัด valid ทั้งคู่ → พิกัดตัดสินเด็ดขาด (ห่างไม่เกิน 500 m) ไม่สนชื่อ
 * - ไม่มีพิกัดให้เช็ค (ฝั่งใดฝั่งหนึ่ง invalid) → ใช้ชื่อแบบเข้มงวด
 */
function confirmPair(rowA: AttractionRow, rowB: AttractionRow): Confirmation | null {
  const coordsA = parseCoords(rowA);
  const coordsB = parseCoords(rowB);

  if (coordsA && coordsB) {
    const meters = haversineKm(coordsA.lat, coordsA.lng, coordsB.lat, coordsB.lng) * 1000;
    return meters <= LOCATION_PROXIMITY_METERS ? "location" : null;
  }
  return namesStrictlyMatch(displayName(rowA), displayName(rowB)) ? "name" : null;
}

// ตัวแทนกลุ่ม: ไม่ใช่ record ขยะ (ถ้ามีตัวเลือกอื่น) และมีพิกัด valid ก่อน ไม่งั้นเอาตัวแรก
export function pickRepresentative(rows: AttractionRow[]): AttractionRow {
  const nonJunk = rows.filter((r) => !isJunkName(r));
  const candidates = nonJunk.length > 0 ? nonJunk : rows;
  return candidates.find((r) => parseCoords(r) !== null) ?? candidates[0];
}

/**
 * dedupe แบบสองชั้น:
 * 1) หา candidate pair ที่ website หรือ phone (normalize แล้ว) ตรงกัน
 * 2) merge เฉพาะ pair ที่ยืนยันได้ (confirmPair) และไม่อยู่ใน blockedPairs
 *    ยืนยันไม่ได้ → ไม่ merge แต่รวมเป็น review cluster ให้คนตรวจ
 *    (กันเคส phone/website ของสำนักงาน ททท. จังหวัดที่ใช้ซ้ำกับหลายสถานที่)
 * excludeIds ถูกตัดทิ้งก่อนทุกอย่าง จึงไม่มีทางเป็นตัวแทนกลุ่ม
 */
export function dedupeRows(
  allRows: AttractionRow[],
  excludeIds: string[] = [],
  blockedPairs: BlockedPair[] = []
): DedupeResult {
  const excludeSet = new Set(excludeIds);
  const rows = allRows.filter((r) => !excludeSet.has(r.ATT_ID));
  const blockedSet = new Set(blockedPairs.map(([a, b]) => pairKey(a, b)));

  // bucket ของ index ที่ contact ตรงกัน
  const buckets: [ContactMatch, Map<string, number[]>][] = [
    ["website", new Map()],
    ["phone", new Map()],
  ];
  rows.forEach((row, i) => {
    const website = normalizeWebsite(row.ATT_WEBSITE);
    if (website) addTo(buckets[0][1], website, i);
    const phone = normalizePhone(row.ATT_TEL);
    if (phone) addTo(buckets[1][1], phone, i);
  });

  const mergeUf = new UnionFind(rows.length);
  const reviewUf = new UnionFind(rows.length);
  const matchedBy = new Map<number, Set<ContactMatch>>();
  const confirmedBy = new Map<number, Set<Confirmation>>();
  const reviewMatchedBy = new Map<number, Set<ContactMatch>>();
  const flagged = new Set<number>();

  for (const [kind, bucket] of buckets) {
    bucket.forEach((indices) => {
      for (let a = 0; a < indices.length; a++) {
        for (let b = a + 1; b < indices.length; b++) {
          const i = indices[a];
          const j = indices[b];
          const blocked = blockedSet.has(pairKey(rows[i].ATT_ID, rows[j].ATT_ID));
          const confirmation = blocked ? null : confirmPair(rows[i], rows[j]);

          if (confirmation) {
            mergeUf.union(i, j);
            for (const k of [i, j]) {
              addToSet(matchedBy, k, kind);
              addToSet(confirmedBy, k, confirmation);
            }
          } else {
            reviewUf.union(i, j);
            for (const k of [i, j]) {
              addToSet(reviewMatchedBy, k, kind);
              flagged.add(k);
            }
          }
        }
      }
    });
  }

  // review: รวมเป็น 1 กลุ่มต่อ cluster (ไม่ใช่รายคู่) เพื่อลด noise
  const reviewGroups: ReviewGroup[] = reviewUf.groups(flagged).map((indices) => {
    const kinds = collect(indices, reviewMatchedBy);
    return { rows: indices.map((i) => rows[i]), matchedBy: kinds, reason: REVIEW_REASON(kinds) };
  });

  const deduped: AttractionRow[] = [];
  const mergedGroups: MergedGroup[] = [];
  const representativeMap: Record<string, string> = {};

  for (const indices of mergeUf.groups(rows.keys())) {
    const groupRows = indices.map((i) => rows[i]);
    const representative = pickRepresentative(groupRows);
    deduped.push(representative);
    groupRows.forEach((r) => (representativeMap[r.ATT_ID] = representative.ATT_ID));

    if (groupRows.length > 1) {
      mergedGroups.push({
        representativeAttId: representative.ATT_ID,
        droppedAttIds: groupRows.filter((r) => r.ATT_ID !== representative.ATT_ID).map((r) => r.ATT_ID),
        matchedBy: collect(indices, matchedBy),
        confirmedBy: collect(indices, confirmedBy),
      });
    }
  }

  return { deduped, mergedGroups, reviewGroups, representativeMap };
}
