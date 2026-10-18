import { DedupeRules } from "./dedupe/dedupeTypes";

/**
 * กฎ dedupe ที่คนตรวจสอบแล้ว (ย้ายมาจาก data-pipeline/src/manualOverrides.ts — เนื้อหาเท่าเดิม)
 * ทุกรายการต้องผ่านการตรวจโดยคน (ไม่ใช่เดา) และควรมีที่มากำกับเพื่อ audit ย้อนหลัง
 *
 * ไฟล์นี้ตรงกับกฎที่ใช้สร้าง fixture ใน __tests__/fixtures (ผล data-pipeline 2026-10-18) — ถ้าแก้ test จะไม่ตรง
 * D-26: จะถูกแทนด้วยการตัดสินใจของ admin ที่เก็บใน DB (R5 P3) แล้วเหลือไว้ใช้กับ characterization test เท่านั้น
 * (ไม่กู้รายการที่หายใน commit 44d26dd / Known Issue #20)
 */
export const dedupeRules: DedupeRules = {
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
