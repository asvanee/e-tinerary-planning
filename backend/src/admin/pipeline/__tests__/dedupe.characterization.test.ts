import * as fs from "fs";
import * as path from "path";
import { getProvinceRows } from "../attractionCsv";
import { runDedupe } from "../dedupe/runDedupe";
import { legacyDedupeRules as dedupeRules } from "../__testutils__/legacyDedupeRules";

interface DedupeFixture {
  source: string;
  province: string;
  rowsBefore: number;
  locationOverridesApplied: number;
  rowsAfter: number;
  mergedGroups: {
    representativeAttId: string;
    droppedAttIds: string[];
    matchedBy: string[];
    confirmedBy: string[];
  }[];
  reviewGroups: { attIds: string[]; matchedBy: string[] }[];
}

function loadFixture(name: string): DedupeFixture {
  const file = path.join(__dirname, "fixtures", `dedupe.${name}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as DedupeFixture;
}

// Characterization test: ผลต้องตรงกับ data-pipeline/src/testDedupe.ts เดิมทุก ATT_ID และทุกลำดับ
// (fixture สร้างจากผลรันจริงของ data-pipeline 2026-10-18 ด้วยกฎชุดเดียวกับ dedupeRules.ts)
// ลำดับสำคัญ: ตอนนำเข้า (R5 P4) LIMIT ตัดจาก deduped ตามลำดับนี้
const fixtures = ["chiangmai", "chonburi", "bangkok"].map(loadFixture);

describe.each(fixtures)("dedupe ของ $province ตรงกับ data-pipeline เดิม", (fixture) => {
  let result: ReturnType<typeof runDedupe>;

  beforeAll(async () => {
    const rows = await getProvinceRows(fixture.province);
    result = runDedupe(rows, dedupeRules);
  }, 60_000);

  test("จำนวนแถวก่อน/หลัง และจำนวน location override", () => {
    expect(result.rowsBefore).toBe(fixture.rowsBefore);
    expect(result.locationOverridesApplied).toBe(fixture.locationOverridesApplied);
    expect(result.deduped).toHaveLength(fixture.rowsAfter);
  });

  test("กลุ่มที่ merge: ตัวแทน, แถวที่ถูกตัด, เหตุผล", () => {
    expect(
      result.mergedGroups.map((g) => ({
        representativeAttId: g.representativeAttId,
        droppedAttIds: g.droppedAttIds,
        matchedBy: g.matchedBy,
        confirmedBy: g.confirmedBy,
      }))
    ).toEqual(fixture.mergedGroups);
  });

  test("review clusters", () => {
    expect(
      result.reviewGroups.map((g) => ({
        attIds: g.rows.map((r) => r.ATT_ID),
        matchedBy: g.matchedBy,
      }))
    ).toEqual(fixture.reviewGroups);
  });

  test("representativeMap ชี้ไปที่แถวที่อยู่ใน deduped เสมอ", () => {
    const keptIds = new Set(result.deduped.map((r) => r.ATT_ID));
    for (const repId of Object.values(result.representativeMap)) {
      expect(keptIds.has(repId)).toBe(true);
    }
  });
});
