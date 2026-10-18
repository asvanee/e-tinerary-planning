import { AttractionRow } from "../attractionTypes";

export type ContactMatch = "website" | "phone";
export type Confirmation = "name" | "location";

export interface LocationOverride {
  lat: number;
  lng: number;
  source: string; // ไปเอาพิกัดมาจากไหน / ใครยืนยัน
}

export type BlockedPair = [string, string];

// กฎที่คนตรวจสอบแล้ว ใช้แก้เคสที่ dedupe อัตโนมัติมองไม่ออก (ดู dedupeRules.ts)
export interface DedupeRules {
  locationOverrides: Record<string, LocationOverride>; // ATT_ID → พิกัดที่ถูกต้อง
  excludeIds: string[]; // record ทดสอบ/ขยะ ตัดทิ้งก่อน dedupe
  blockedPairs: BlockedPair[]; // ห้าม merge แม้ contact ตรงและพิกัดใกล้
  forceMergeGroups: string[][]; // บังคับ merge แม้อัลกอริทึมมองไม่ออก
}

export interface MergedGroup {
  representativeAttId: string;
  droppedAttIds: string[];
  matchedBy: (ContactMatch | "manual")[];
  confirmedBy: (Confirmation | "manual")[];
}

// แชร์ contact เดียวกันแต่ยืนยันไม่ได้ว่าเป็นที่เดียวกัน — ไม่ merge ให้คนตรวจ
export interface ReviewGroup {
  rows: AttractionRow[];
  matchedBy: ContactMatch[];
  reason: string;
}

export interface DedupeResult {
  deduped: AttractionRow[];
  mergedGroups: MergedGroup[];
  reviewGroups: ReviewGroup[];
  representativeMap: Record<string, string>; // ATT_ID เดิม → ATT_ID ที่เป็นตัวแทนตอนนี้
}
