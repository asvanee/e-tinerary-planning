import { DedupeRules } from "./dedupe/dedupeTypes";

/**
 * กฎ dedupe ที่คนตรวจสอบแล้ว (ย้ายมาจาก data-pipeline/src/manualOverrides.ts — เนื้อหาเท่าเดิม)
 * ทุกรายการต้องผ่านการตรวจโดยคน (ไม่ใช่เดา) และควรมีที่มากำกับเพื่อ audit ย้อนหลัง
 *
 * ⚠️ Known Issue #20: commit 44d26dd ลบรายการเชียงใหม่ไปบางส่วน (locationOverrides 4 รายการ,
 * blockedMergePairs และบางส่วนของ forceMergeGroups/excludeIds) — จะกู้ใน R5 P2b
 * ถ้าเปลี่ยนกฎในไฟล์นี้ fixture ใน __tests__/fixtures จะไม่ตรง ต้องอัปเดต test ให้ตรงกับผลใหม่ด้วย
 * แผน: ย้ายไปเก็บในตาราง Supabase ใน R5 P4 (แก้ผ่านหน้า admin)
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
