import { DedupeRules } from "../dedupe/dedupeTypes";

/**
 * กฎ dedupe ชุดเดิมของ data-pipeline (manualOverrides.ts ณ 2026-10-18) — ใช้กับ characterization test เท่านั้น
 * fixture ใน __tests__/fixtures สร้างด้วยกฎชุดนี้ ถ้าแก้ test จะไม่ตรง
 * runtime ใช้การตัดสินใจของ admin ที่เก็บใน admin_place_decisions แทน (D-26) · ไม่กู้รายการที่หายใน 44d26dd (#20)
 */
export const legacyDedupeRules: DedupeRules = {
  locationOverrides: {},

  excludeIds: ["20241012015029001"],

  blockedPairs: [],

  forceMergeGroups: [
    ["20100518224629675", "20241220131515001", "20241220131453001", "20241220130749001"],
    ["20160528174922008571", "2015120421550717990"],
    ["201005182246293199", "2015120421550718071"],
    ["201005182246293395", "201005182246293300"],
  ],
};
