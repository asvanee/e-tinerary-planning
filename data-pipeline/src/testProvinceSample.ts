import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import * as dotenv from "dotenv";
import { CsvRow, PlaceRecord } from "./types";
import { dedupeRows, applyLocationOverrides, applyForceMerges } from "./dedupe";
import { locationOverrides, forceMergeGroups, excludeIds, blockedMergePairs } from "./manualOverrides";

dotenv.config();

const INPUT_PATH = path.join(__dirname, "../data/attraction.csv");
const TARGET_PROVINCE = process.env.TARGET_PROVINCE || "ชลบุรี";
const LIMIT = process.env.SAMPLE_LIMIT ? Number(process.env.SAMPLE_LIMIT) : 5;

function clean(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function parseLatLng(location: string): { lat: number; lng: number } | null {
  const parts = location.split(",").map((part) => part.trim());
  if (parts.length !== 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

function buildAddress(row: CsvRow): string | null {
  const parts = [
    row.ATT_ADDRESS,
    row.ATT_ADDRESS_ALLEY,
    row.ATT_ADDRESS_ROAD,
    row.SUBDISTRICT_NAME_TH,
    row.DISTRICT_NAME_TH,
    row.PROVINCE_NAME_TH,
    row.ATT_POSTCODE,
  ]
    .map(clean)
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function toPlaceRecordPreview(row: CsvRow): Partial<PlaceRecord> & { _rawLocation: string } {
  const coords = parseLatLng(row.ATT_LOCATION || "");

  return {
    google_place_id: `csv:${row.ATT_ID}`,
    place_name: clean(row.ATT_NAME_TH) || clean(row.ATT_NAME_EN) || row.ATT_ID,
    latitude: coords?.lat,
    longitude: coords?.lng,
    formatted_address: buildAddress(row),
    phone_number: clean(row.ATT_TEL),
    website: clean(row.ATT_WEBSITE),
    opening_hours: clean(row.ATT_START_END) ? { text: clean(row.ATT_START_END) } : null,
    province: clean(row.PROVINCE_NAME_TH) || "",
    district: clean(row.DISTRICT_NAME_TH) || "",
    att_id: row.ATT_ID,
    att_type_label: clean(row.ATT_TYPE_LABEL),
    att_category_label: clean(row.ATT_CATEGORY_LABEL),
    att_detail_th: clean(row.ATT_DETAIL_TH),
    att_facebook: clean(row.ATT_FACEBOOK),
    att_instagram: clean(row.ATT_INSTAGRAM),
    att_tiktok: clean(row.ATT_TIKTOK),
    att_youtube: clean(row.ATT_YOUTUBE),
    att_line: clean(row.ATT_LINE),
    _rawLocation: row.ATT_LOCATION,
  };
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

  const rawProvinceRows = rows.filter(
    (row) => clean(row.PROVINCE_NAME_TH) === TARGET_PROVINCE
  );

  console.log(`Target province: ${TARGET_PROVINCE}`);
  console.log(`Total rows in province (before dedupe): ${rawProvinceRows.length}`);

  // 1) แก้พิกัดที่รู้อยู่แล้วว่าพัง/ผิด (verify โดยคนแล้ว) ก่อนเข้า dedupe อัตโนมัติ
  const overriddenRows = applyLocationOverrides(rawProvinceRows, locationOverrides);

  // 2) dedupe อัตโนมัติ (website/phone + พิกัด/ชื่อยืนยัน)
  const autoResult = dedupeRows(overriddenRows, excludeIds, blockedMergePairs);

  // 3) บังคับ merge กลุ่มที่คนตรวจสอบแล้วว่าเป็นที่เดียวกันจริง แต่อัลกอริทึมมองไม่ออก
  const relevantForceMergeGroups = forceMergeGroups.filter((group) =>
    group.some((id) => rawProvinceRows.some((r) => r.ATT_ID === id))
  );
  const { deduped, mergedGroups, reviewGroups } = applyForceMerges(
    overriddenRows,
    autoResult,
    relevantForceMergeGroups
  );

  const provinceRows = deduped;
  const flaggedRowCount = reviewGroups.reduce((sum, g) => sum + g.rows.length, 0);

  console.log(`Total rows in province (after dedupe): ${provinceRows.length}`);
  console.log(`Confirmed duplicate groups merged: ${mergedGroups.length}`);
  if (flaggedRowCount > 0) {
    console.log(
      `⚠️  Flagged for manual review (kept separate, not auto-merged): ${reviewGroups.length} cluster(s), ${flaggedRowCount} rows — see testDedupe.ts for detail`
    );
  }
  console.log(`Sampling: ${LIMIT}\n`);

  const sample = provinceRows.slice(0, LIMIT);

  if (sample.length === 0) {
    console.log("⚠️  No rows found — check TARGET_PROVINCE spelling matches CSV exactly.");
    return;
  }

  sample.forEach((row, i) => {
    const preview = toPlaceRecordPreview(row);
    const validLocation = !!parseLatLng(row.ATT_LOCATION || "");

    console.log(`--- [${i + 1}/${sample.length}] ${preview.place_name} ---`);
    console.log(`  ATT_ID:            ${preview.att_id}`);
    console.log(`  Location valid:    ${validLocation ? "✅" : "❌ raw=" + preview._rawLocation}`);
    console.log(`  lat/lng:           ${preview.latitude ?? "-"}, ${preview.longitude ?? "-"}`);
    console.log(`  Address:           ${preview.formatted_address ?? "-"}`);
    console.log(`  Phone:             ${preview.phone_number ?? "-"}`);
    console.log(`  Website:           ${preview.website ?? "-"}`);
    console.log(`  Opening (raw):     ${JSON.stringify(preview.opening_hours) ?? "-"}`);
    console.log(`  Category / Type:   ${preview.att_category_label ?? "-"} / ${preview.att_type_label ?? "-"}`);
    console.log(`  Detail TH:         ${preview.att_detail_th ? preview.att_detail_th.slice(0, 50) + "..." : "-"}`);
    console.log(`  Facebook:          ${preview.att_facebook ?? "-"}`);
    console.log(`  Instagram:         ${preview.att_instagram ?? "-"}`);
    console.log(`  TikTok:            ${preview.att_tiktok ?? "-"}`);
    console.log(`  YouTube:           ${preview.att_youtube ?? "-"}`);
    console.log(`  Line:              ${preview.att_line ?? "-"}`);
    console.log("");
  });

  // Coverage summary over the full province (not just sample) — helps decide before running Google enrichment
  const coverage = (field: keyof CsvRow) =>
    (
      (provinceRows.filter((r) => clean(r[field] as string)).length /
        provinceRows.length) *
      100
    ).toFixed(1);

  console.log(`--- Coverage across all ${provinceRows.length} ${TARGET_PROVINCE} rows ---`);
  console.log(`  ATT_TEL:        ${coverage("ATT_TEL")}%`);
  console.log(`  ATT_WEBSITE:    ${coverage("ATT_WEBSITE")}%`);
  console.log(`  ATT_START_END:  ${coverage("ATT_START_END")}%`);
  console.log(`  ATT_DETAIL_TH:  ${coverage("ATT_DETAIL_TH")}%`);
  console.log(`  ATT_FACEBOOK:   ${coverage("ATT_FACEBOOK")}%`);
  console.log(`  ATT_INSTAGRAM:  ${coverage("ATT_INSTAGRAM")}%`);
  console.log(`  ATT_TIKTOK:     ${coverage("ATT_TIKTOK")}%`);
  console.log(`  ATT_YOUTUBE:    ${coverage("ATT_YOUTUBE")}%`);
  console.log(`  ATT_LINE:       ${coverage("ATT_LINE")}%`);

  const invalidLocations = provinceRows.filter(
    (r) => !parseLatLng(r.ATT_LOCATION || "")
  ).length;
  console.log(
    `  Invalid ATT_LOCATION: ${invalidLocations} / ${provinceRows.length} (${(
      (invalidLocations / provinceRows.length) *
      100
    ).toFixed(1)}%)`
  );
}

main();