import { URL } from "url";
import { CsvRow } from "./types";

// --- normalization helpers -------------------------------------------------

function normalizePhone(value?: string): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= 9 ? digits : null;
}

function normalizeWebsite(value?: string): string | null {
  if (!value) return null;
  try {
    const url = value.trim().toLowerCase();
    const withProtocol = url.startsWith("http") ? url : `https://${url}`;
    const { hostname } = new URL(withProtocol);
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// decode ตัว HTML numeric entity ที่หลุดมาใน CSV เช่น &#8217; (apostrophe)
function decodeHtmlEntities(value: string): string {
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข (รองรับ unicode รวมภาษาไทย) แล้วทำเป็นตัวพิมพ์เล็ก
function normalizeName(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

// --- name matching (strict — ใช้เป็น fallback เท่านั้นตอนไม่มีพิกัดให้เช็ค) ---

// ยอมให้ merge จากชื่ออย่างเดียวได้แค่ 2 เคส: normalize แล้วเหมือนกันเป๊ะ หรือ
// ต่างกันแค่คำต่อท้าย/นำหน้าสั้นๆ (เช่น "พัทยา" ต่อท้าย) ไม่ใช้ fuzzy edit-distance
// เพราะชื่อสถานที่ไทยที่ขึ้นต้นด้วยคำเดียวกัน (หาด.../ถ้ำ.../วัด...) ตัวท้ายต่างกัน
// นิดเดียวก็ยังได้ similarity สูงลวงตา ทั้งที่เป็นคนละที่จริงๆ
const NAME_CONTAINMENT_MAX_LENGTH_DIFF = 6;

function namesStrictlyMatch(nameA: string, nameB: string): boolean {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (!a || !b) return false;
  if (a === b) return true;

  if (a.includes(b) || b.includes(a)) {
    return Math.abs(a.length - b.length) <= NAME_CONTAINMENT_MAX_LENGTH_DIFF;
  }

  return false;
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const LOCATION_PROXIMITY_METERS = 500;

function parseCoords(row: CsvRow): { lat: number; lng: number } | null {
  const parts = (row.ATT_LOCATION || "").split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function displayName(row: CsvRow): string {
  return row.ATT_NAME_TH || row.ATT_NAME_EN || row.ATT_ID;
}

// --- junk / test record detection ------------------------------------------
// ป้องกันเคสที่ auto-merge เอา record ทดสอบ/ขยะ (เช่น "ทดสอบอัพเดทผ่าน API. 17:51")
// มาเป็นตัวแทนของกลุ่ม แล้วสถานที่จริงที่ถูก merge เข้าไปหายไปเงียบๆ (เจอครั้งแรกตอนเชียงใหม่:
// Group 13 เอา record ทดสอบมาเป็นตัวแทนแทน "ผาช่อ" ที่เป็นสถานที่จริง)
const JUNK_NAME_PATTERN = /ทดสอบ|test\b|api\b/i;

export function isJunkName(row: CsvRow): boolean {
  return JUNK_NAME_PATTERN.test(displayName(row));
}

// --- manual pair blocking ---------------------------------------------------
// คู่ ATT_ID ที่คนตรวจสอบแล้วว่า "ห้าม merge เด็ดขาด" แม้ phone/website จะตรงกันและพิกัดใกล้กัน
// (ตรงข้ามกับ forceMergeGroups ซึ่งบังคับ merge) ใช้เมื่อเจอเคส over-merge: สถานที่คนละที่กัน
// แต่แชร์เบอร์/เว็บของหน่วยงานกลาง (เช่น สำนักงานอุทยานแห่งชาติ) แล้วบังเอิญพิกัดใกล้กันพอ
// จน location-based confirm ผ่านไปทั้งที่ไม่ควร
export type BlockedPair = [string, string];

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function buildBlockedSet(blockedPairs: BlockedPair[]): Set<string> {
  return new Set(blockedPairs.map(([a, b]) => pairKey(a, b)));
}

/**
 * ตัดสินว่า 2 แถวเป็นสถานที่เดียวกันจริงไหม:
 * - ถ้ามีพิกัด valid ทั้งคู่ -> พิกัดเป็นตัวตัดสินเด็ดขาด (ไม่สนชื่อเลย)
 *   เพราะชื่อไทยที่มี prefix ซ้ำกัน (หาด.../ถ้ำ.../วัด...) หลอก similarity ได้ง่าย
 *   ในขณะที่พิกัดเป็นข้อเท็จจริงที่เชื่อถือได้กว่า
 * - ถ้าไม่มีพิกัดให้เช็ค (อย่างน้อยฝั่งใดฝั่งหนึ่ง invalid) -> fallback ไปเช็คชื่อแบบเข้มงวด
 */
function confirmPair(
  rowA: CsvRow,
  rowB: CsvRow
): { confirmed: boolean; by: ("name" | "location")[] } {
  const coordsA = parseCoords(rowA);
  const coordsB = parseCoords(rowB);

  if (coordsA && coordsB) {
    const close =
      haversineMeters(coordsA.lat, coordsA.lng, coordsB.lat, coordsB.lng) <=
      LOCATION_PROXIMITY_METERS;
    return { confirmed: close, by: close ? ["location"] : [] };
  }

  const nameMatch = namesStrictlyMatch(displayName(rowA), displayName(rowB));
  return { confirmed: nameMatch, by: nameMatch ? ["name"] : [] };
}

// --- union-find --------------------------------------------------------

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
}

// --- public API ----------------------------------------------------------

export interface DedupeGroup {
  rows: CsvRow[];
  matchedBy: ("website" | "phone")[];
  confirmedBy: ("name" | "location")[];
}

export interface ReviewGroup {
  rows: CsvRow[];
  matchedBy: ("website" | "phone")[];
  reason: string;
}

export interface DedupeResult {
  deduped: CsvRow[];
  mergedGroups: {
    representativeAttId: string;
    droppedAttIds: string[];
    matchedBy: string[];
    confirmedBy: string[];
  }[];
  reviewGroups: ReviewGroup[];
  representativeMap: Record<string, string>; // original ATT_ID -> ATT_ID ที่เป็นตัวแทนอยู่ตอนนี้
}

/**
 * dedupe แบบสองชั้น:
 * 1) หา candidate pairs ที่ website หรือ phone (normalize แล้ว) ตรงกัน
 * 2) merge จริงเฉพาะ pair ที่มีหลักฐานยืนยันเพิ่ม (ชื่อคล้ายกันมาก หรือ พิกัดใกล้กัน <500m)
 *    ถ้า match แค่ contact info แต่ยืนยันไม่ได้ -> ไม่ merge, ใส่ไว้ใน reviewFlags แทน
 *    (กันเคส phone/website เป็นของสำนักงาน ททท. จังหวัด ที่ถูกใช้ซ้ำกับหลายสถานที่)
 */
export function dedupeRows(
  allRows: CsvRow[],
  excludeIds: string[] = [],
  blockedPairs: BlockedPair[] = []
): DedupeResult {
  // 0) ตัดทิ้ง record ทดสอบ/ขยะที่คนยืนยันแล้วว่าไม่ใช่สถานที่จริง (ดู manualOverrides.ts excludeIds)
  //    ทำก่อนทุกอย่าง เพื่อไม่ให้มีโอกาสถูกเลือกเป็นตัวแทนของกลุ่มไหนเลย
  const excludeSet = new Set(excludeIds);
  const rows = excludeSet.size > 0 ? allRows.filter((r) => !excludeSet.has(r.ATT_ID)) : allRows;
  const blockedSet = buildBlockedSet(blockedPairs);

  const uf = new UnionFind(rows.length); // สำหรับ merge ที่ confirm แล้วจริง
  const reviewUf = new UnionFind(rows.length); // สำหรับจับกลุ่มที่แชร์ contact info แต่ยืนยันไม่ได้ (ไว้แค่ print รวม ไม่ merge)

  const websiteMap = new Map<string, number[]>();
  const phoneMap = new Map<string, number[]>();

  rows.forEach((row, i) => {
    const website = normalizeWebsite(row.ATT_WEBSITE);
    if (website) {
      if (!websiteMap.has(website)) websiteMap.set(website, []);
      websiteMap.get(website)!.push(i);
    }
    const phone = normalizePhone(row.ATT_TEL);
    if (phone) {
      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push(i);
    }
  });

  const matchedByIndex = new Map<number, Set<"website" | "phone">>();
  const confirmedByIndex = new Map<number, Set<"name" | "location">>();
  const reviewMatchedByIndex = new Map<number, Set<"website" | "phone">>();
  const flaggedIndices = new Set<number>();

  const addMatch = (i: number, kind: "website" | "phone") => {
    if (!matchedByIndex.has(i)) matchedByIndex.set(i, new Set());
    matchedByIndex.get(i)!.add(kind);
  };
  const addConfirm = (i: number, kind: "name" | "location") => {
    if (!confirmedByIndex.has(i)) confirmedByIndex.set(i, new Set());
    confirmedByIndex.get(i)!.add(kind);
  };
  const addReviewMatch = (i: number, kind: "website" | "phone") => {
    if (!reviewMatchedByIndex.has(i)) reviewMatchedByIndex.set(i, new Set());
    reviewMatchedByIndex.get(i)!.add(kind);
  };

  const processBucket = (indices: number[], kind: "website" | "phone") => {
    if (indices.length < 2) return;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = indices[a];
        const j = indices[b];
        const rowA = rows[i];
        const rowB = rows[j];

        const blocked = blockedSet.has(pairKey(rowA.ATT_ID, rowB.ATT_ID));
        const { confirmed, by } = blocked ? { confirmed: false, by: [] as ("name" | "location")[] } : confirmPair(rowA, rowB);

        if (confirmed) {
          uf.union(i, j);
          addMatch(i, kind);
          addMatch(j, kind);
          by.forEach((k) => {
            addConfirm(i, k);
            addConfirm(j, k);
          });
        } else {
          // ไม่ confirm -> แค่จับกลุ่มไว้ print รวม ไม่ merge จริง
          reviewUf.union(i, j);
          addReviewMatch(i, kind);
          addReviewMatch(j, kind);
          flaggedIndices.add(i);
          flaggedIndices.add(j);
        }
      }
    }
  };

  websiteMap.forEach((indices) => processBucket(indices, "website"));
  phoneMap.forEach((indices) => processBucket(indices, "phone"));

  // รวม review clusters เป็นกลุ่มเดียวต่อ 1 cluster (ไม่ใช่ pairwise) เพื่อลด noise
  const reviewClusters = new Map<number, number[]>();
  flaggedIndices.forEach((i) => {
    const root = reviewUf.find(i);
    if (!reviewClusters.has(root)) reviewClusters.set(root, []);
    reviewClusters.get(root)!.push(i);
  });

  const reviewGroups: ReviewGroup[] = [];
  reviewClusters.forEach((indices) => {
    const matchedBy = new Set<"website" | "phone">();
    indices.forEach((idx) => {
      reviewMatchedByIndex.get(idx)?.forEach((k) => matchedBy.add(k));
    });
    reviewGroups.push({
      rows: indices.map((i) => rows[i]),
      matchedBy: [...matchedBy],
      reason: `แชร์ ${[...matchedBy].join("/")} เดียวกัน แต่ชื่อไม่คล้ายและพิกัดไม่ใกล้กัน (หรือไม่มีพิกัดยืนยัน) — น่าจะเป็น contact info ของหน่วยงานกลาง (เช่น ททท. จังหวัด) ไม่ใช่ของสถานที่เอง`,
    });
  });

  const groups = new Map<number, number[]>();
  rows.forEach((_, i) => {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  });

  function hasValidLocation(row: CsvRow): boolean {
    return parseCoords(row) !== null;
  }
  function pickRepresentative(group: CsvRow[]): CsvRow {
    // อย่าเลือก record ทดสอบ/ขยะเป็นตัวแทนเด็ดขาด แม้จะเป็นแถวเดียวที่มีพิกัด valid ก็ตาม
    const nonJunk = group.filter((r) => !isJunkName(r));
    const candidates = nonJunk.length > 0 ? nonJunk : group;
    return candidates.find(hasValidLocation) ?? candidates[0];
  }

  const deduped: CsvRow[] = [];
  const mergedGroups: DedupeResult["mergedGroups"] = [];
  const representativeMap: Record<string, string> = {};

  groups.forEach((indices) => {
    const groupRows = indices.map((i) => rows[i]);
    const representative = pickRepresentative(groupRows);
    deduped.push(representative);

    groupRows.forEach((r) => {
      representativeMap[r.ATT_ID] = representative.ATT_ID;
    });

    if (groupRows.length > 1) {
      const matchedBy = new Set<string>();
      const confirmedBy = new Set<string>();
      indices.forEach((idx) => {
        matchedByIndex.get(idx)?.forEach((k) => matchedBy.add(k));
        confirmedByIndex.get(idx)?.forEach((k) => confirmedBy.add(k));
      });
      mergedGroups.push({
        representativeAttId: representative.ATT_ID,
        droppedAttIds: groupRows
          .filter((r) => r.ATT_ID !== representative.ATT_ID)
          .map((r) => r.ATT_ID),
        matchedBy: [...matchedBy],
        confirmedBy: [...confirmedBy],
      });
    }
  });

  return { deduped, mergedGroups, reviewGroups, representativeMap };
}

// --- manual overrides ------------------------------------------------------

export interface LocationOverrideInput {
  lat: number;
  lng: number;
}

/**
 * แก้ ATT_LOCATION ของแถวที่ระบุ (โดย ATT_ID) ก่อนรัน dedupeRows()
 * ใช้กับเคสที่พิกัดต้นทางพัง (short link, ค่าขยะ ฯลฯ) แต่มีคนไปยืนยันพิกัดจริงมาแล้ว
 * เป็น pure function — คืน array ใหม่ ไม่แก้ rows เดิม
 */
export function applyLocationOverrides(
  rows: CsvRow[],
  overrides: Record<string, LocationOverrideInput>
): CsvRow[] {
  if (Object.keys(overrides).length === 0) return rows;
  return rows.map((row) => {
    const override = overrides[row.ATT_ID];
    if (!override) return row;
    return { ...row, ATT_LOCATION: `${override.lat}, ${override.lng}` };
  });
}

/**
 * บังคับ merge กลุ่ม ATT_ID ที่คนยืนยันแล้วว่าเป็นสถานที่เดียวกันจริง เข้าไปในผลลัพธ์ของ dedupeRows()
 * ทำงานหลัง dedupeRows() เสร็จแล้ว (post-process) เพราะบาง ATT_ID ในกลุ่มอาจถูก auto-merge
 * ไปแล้วบางส่วน (representativeMap ใช้เช็คว่าตอนนี้แต่ละ id ชี้ไปที่ตัวแทนตัวไหนอยู่)
 *
 * เลือกตัวแทนสุดท้ายโดย: เอาแถวที่มีพิกัด valid ก่อน (ถ้ามีมากกว่า 1 เอาตัวแรกที่เจอ)
 * ถ้าไม่มีเลยเอาตัวแรกในลิสต์ override group
 */
export function applyForceMerges(
  originalRows: CsvRow[],
  result: DedupeResult,
  forceMergeGroups: string[][]
): DedupeResult {
  let deduped = [...result.deduped];
  const representativeMap = { ...result.representativeMap };
  const mergedGroups = [...result.mergedGroups];
  const resolvedIds = new Set<string>();

  function hasValidLocation(row: CsvRow): boolean {
    const parts = (row.ATT_LOCATION || "").split(",").map((p) => p.trim());
    return (
      parts.length === 2 &&
      Number.isFinite(Number(parts[0])) &&
      Number.isFinite(Number(parts[1]))
    );
  }

  for (const group of forceMergeGroups) {
    const currentReps = Array.from(
      new Set(group.map((id) => representativeMap[id] ?? id))
    );

    group.forEach((id) => resolvedIds.add(id));

    if (currentReps.length <= 1) continue; // auto-merge จัดการให้หมดแล้ว ไม่ต้องทำอะไรเพิ่ม

    const repRows = currentReps
      .map((id) => deduped.find((r) => r.ATT_ID === id))
      .filter((r): r is CsvRow => !!r);

    if (repRows.length === 0) continue; // เผื่อ ATT_ID พิมพ์ผิดในไฟล์ override — เงียบไว้ ไม่ crash

    const nonJunkRepRows = repRows.filter((r) => !isJunkName(r));
    const repCandidates = nonJunkRepRows.length > 0 ? nonJunkRepRows : repRows;
    const finalRep = repCandidates.find(hasValidLocation) ?? repCandidates[0];
    const droppedIds = currentReps.filter((id) => id !== finalRep.ATT_ID);

    deduped = deduped.filter((r) => !droppedIds.includes(r.ATT_ID));

    Object.keys(representativeMap).forEach((originalId) => {
      if (droppedIds.includes(representativeMap[originalId])) {
        representativeMap[originalId] = finalRep.ATT_ID;
      }
    });
    group.forEach((id) => {
      if (!(id in representativeMap)) representativeMap[id] = finalRep.ATT_ID;
    });

    mergedGroups.push({
      representativeAttId: finalRep.ATT_ID,
      droppedAttIds: droppedIds,
      matchedBy: ["manual"],
      confirmedBy: ["manual override — human confirmed same place"],
    });
  }

  // เอา review cluster ที่ resolve ด้วย override ครบทุกแถวแล้วออก จะได้ไม่โชว์ค้างให้สับสน
  const reviewGroups = result.reviewGroups.filter(
    (group) => !group.rows.every((r) => resolvedIds.has(r.ATT_ID))
  );

  return { deduped, mergedGroups, reviewGroups, representativeMap };
}