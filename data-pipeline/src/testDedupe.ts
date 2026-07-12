import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import * as dotenv from "dotenv";
import { CsvRow } from "./types";
import { dedupeRows, applyLocationOverrides, applyForceMerges } from "./dedupe";
import { locationOverrides, forceMergeGroups, excludeIds, blockedMergePairs } from "./manualOverrides";

dotenv.config();

const INPUT_PATH = path.join(__dirname, "../data/attraction.csv");
const TARGET_PROVINCE = process.env.TARGET_PROVINCE || "ชลบุรี";

function clean(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function name(row: CsvRow): string {
  return row.ATT_NAME_TH || row.ATT_NAME_EN || row.ATT_ID;
}

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error("attraction.csv not found.");
    process.exit(1);
  }

  const csvContent = fs.readFileSync(INPUT_PATH, "utf8");
  const rows: CsvRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
  });

  const provinceRows = rows.filter(
    (row) => clean(row.PROVINCE_NAME_TH) === TARGET_PROVINCE
  );

  console.log(`Target province: ${TARGET_PROVINCE}`);
  console.log(`Rows before dedupe: ${provinceRows.length}`);

  // 1) แก้พิกัดที่รู้อยู่แล้วว่าพัง/ผิด (verify โดยคนแล้ว) ก่อนเข้า dedupe อัตโนมัติ
  //    ทำให้ location-based confirm ใน dedupeRows() ใช้พิกัดที่ถูกต้องได้ตั้งแต่ต้น
  const overriddenRows = applyLocationOverrides(provinceRows, locationOverrides);
  const overrideCount = Object.keys(locationOverrides).filter((id) =>
    provinceRows.some((r) => r.ATT_ID === id)
  ).length;
  if (overrideCount > 0) {
    console.log(`Location overrides applied: ${overrideCount}`);
  }

  // 2) dedupe อัตโนมัติ (website/phone + พิกัด/ชื่อยืนยัน)
  const autoResult = dedupeRows(overriddenRows, excludeIds, blockedMergePairs);

  // 3) บังคับ merge กลุ่มที่คนตรวจสอบแล้วว่าเป็นที่เดียวกันจริง แต่อัลกอริทึมมองไม่ออก
  //    (เช่น ชื่อคนละภาษา + พิกัดพังทั้งคู่พร้อมกัน) — ทำหลัง dedupe อัตโนมัติเสมอ
  const relevantForceMergeGroups = forceMergeGroups.filter((group) =>
    group.some((id) => provinceRows.some((r) => r.ATT_ID === id))
  );
  const { deduped, mergedGroups, reviewGroups } = applyForceMerges(
    overriddenRows,
    autoResult,
    relevantForceMergeGroups
  );
  const flaggedRowCount = reviewGroups.reduce((sum, g) => sum + g.rows.length, 0);

  console.log(`Rows after auto-merge + manual overrides: ${deduped.length}`);
  console.log(`Confirmed duplicate groups: ${mergedGroups.length}`);
  console.log(
    `Flagged for manual review: ${reviewGroups.length} cluster(s), ${flaggedRowCount} rows total\n`
  );

  console.log("=".repeat(60));
  console.log("CONFIRMED MERGES (auto-applied)");
  console.log("=".repeat(60));

  if (mergedGroups.length === 0) {
    console.log("None.\n");
  }

  mergedGroups.forEach((group, i) => {
    const repRow = overriddenRows.find((r) => r.ATT_ID === group.representativeAttId)!;
    console.log(
      `--- Group ${i + 1} (matched: ${group.matchedBy.join("+")}, confirmed by: ${group.confirmedBy.join("+")}) ---`
    );
    console.log(`  Kept:    ${group.representativeAttId} | ${name(repRow)}`);
    group.droppedAttIds.forEach((id) => {
      const droppedRow = overriddenRows.find((r) => r.ATT_ID === id)!;
      console.log(`  Dropped: ${id} | ${name(droppedRow)}`);
    });
    console.log("");
  });

  console.log("=".repeat(60));
  console.log("FLAGGED FOR MANUAL REVIEW (kept all rows, not auto-merged)");
  console.log("=".repeat(60));

  if (reviewGroups.length === 0) {
    console.log("None.\n");
  }

  reviewGroups.forEach((group, i) => {
    console.log(
      `--- Review Cluster ${i + 1} (shared: ${group.matchedBy.join("+")}, ${group.rows.length} rows) ---`
    );
    group.rows.forEach((row) => {
      console.log(`  - ${row.ATT_ID} | ${name(row)}`);
    });
    console.log(`  Reason: ${group.reason}`);
    console.log("");
  });
}

main();