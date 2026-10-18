import { AttractionRow } from "../attractionTypes";
import { DedupeResult, DedupeRules } from "./dedupeTypes";
import { dedupeRows } from "./dedupeRows";
import { applyForceMerges, applyLocationOverrides } from "./applyRules";

export interface RunDedupeResult extends DedupeResult {
  rowsBefore: number;
  locationOverridesApplied: number;
}

/**
 * จุดเรียก dedupe จุดเดียว (ลำดับเดียวกับ data-pipeline เดิม):
 * 1) แก้พิกัดที่คนยืนยันแล้ว → 2) dedupe อัตโนมัติ (ตัด excludeIds, เคารพ blockedPairs)
 * → 3) force merge เฉพาะกลุ่มที่มี id อยู่ในข้อมูลชุดนี้
 */
export function runDedupe(rows: AttractionRow[], rules: DedupeRules): RunDedupeResult {
  const ids = new Set(rows.map((r) => r.ATT_ID));

  const overridden = applyLocationOverrides(rows, rules.locationOverrides);
  const locationOverridesApplied = Object.keys(rules.locationOverrides).filter((id) =>
    ids.has(id)
  ).length;

  const autoResult = dedupeRows(overridden, rules.excludeIds, rules.blockedPairs);
  const relevantForceMerges = rules.forceMergeGroups.filter((group) =>
    group.some((id) => ids.has(id))
  );

  return {
    ...applyForceMerges(autoResult, relevantForceMerges),
    rowsBefore: rows.length,
    locationOverridesApplied,
  };
}
