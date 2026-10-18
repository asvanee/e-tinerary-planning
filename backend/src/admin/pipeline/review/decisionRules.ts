import { DedupeRules, BlockedPair } from "../dedupe/dedupeTypes";
import { PlaceDecision } from "./reviewTypes";

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * แปลงการตัดสินใจของ admin เป็นกฎ dedupe (แทน dedupeRules.ts ที่ hard code — D-26)
 * - merge       → forceMergeGroups (+ พิกัดที่กรอกเองตอน merge → locationOverrides ของแถวหลัก)
 * - separate    → blockedPairs ทุกคู่ในกลุ่ม ยกเว้นคู่ที่อยู่ใน merge เดียวกัน
 *                 (กลุ่ม 5 แถวที่ merge 2 แถว แล้วที่เหลือแยกกัน = merge 1 + separate 1)
 * - exclude     → excludeIds
 * - fix_location → locationOverrides
 * - ok          → ไม่มีผลกับ dedupe (แค่ซ่อนจากรายการปัญหา)
 */
export function decisionsToRules(decisions: PlaceDecision[]): DedupeRules {
  const rules: DedupeRules = {
    locationOverrides: {},
    excludeIds: [],
    blockedPairs: [],
    forceMergeGroups: [],
  };
  const mergedPairs = new Set<string>();

  for (const d of decisions) {
    if (d.kind === "merge") {
      rules.forceMergeGroups.push([...d.att_ids]);
      eachPair(d.att_ids, (a, b) => mergedPairs.add(pairKey(a, b)));
      if (d.primary_att_id && d.lat !== null && d.lng !== null) {
        rules.locationOverrides[d.primary_att_id] = { lat: d.lat, lng: d.lng, source: sourceOf(d) };
      }
    } else if (d.kind === "exclude") {
      rules.excludeIds.push(d.att_ids[0]);
    } else if (d.kind === "fix_location" && d.lat !== null && d.lng !== null) {
      rules.locationOverrides[d.att_ids[0]] = { lat: d.lat, lng: d.lng, source: sourceOf(d) };
    }
  }

  const blocked = new Set<string>();
  for (const d of decisions) {
    if (d.kind !== "separate") continue;
    eachPair(d.att_ids, (a, b) => {
      const key = pairKey(a, b);
      if (mergedPairs.has(key) || blocked.has(key)) return;
      blocked.add(key);
      rules.blockedPairs.push([a, b] as BlockedPair);
    });
  }

  return rules;
}

// คู่ที่ admin ตัดสินแล้ว (อยู่ใน merge หรือ separate เดียวกัน) → decision_id ที่ครอบคู่นั้น
export function coveredPairs(decisions: PlaceDecision[]): Map<string, number[]> {
  const covered = new Map<string, number[]>();
  for (const d of decisions) {
    if (d.kind !== "merge" && d.kind !== "separate") continue;
    eachPair(d.att_ids, (a, b) => {
      const key = pairKey(a, b);
      covered.set(key, [...(covered.get(key) ?? []), d.decision_id]);
    });
  }
  return covered;
}

export function eachPair(ids: string[], fn: (a: string, b: string) => void): void {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) fn(ids[i], ids[j]);
  }
}

function sourceOf(d: PlaceDecision): string {
  return `admin decision #${d.decision_id}${d.note ? ` — ${d.note}` : ""}`;
}
