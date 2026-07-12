import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import * as dotenv from "dotenv";
import { CsvRow } from "./types";
import { dedupeRows, applyLocationOverrides, applyForceMerges } from "./dedupe";
import { locationOverrides, forceMergeGroups, excludeIds, blockedMergePairs } from "./manualOverrides";

dotenv.config();

const INPUT_PATH = path.join(__dirname, "../data/attraction.csv");
const TARGET_PROVINCE = process.env.TARGET_PROVINCE || "เชียงใหม่";

// รัศมีที่ถือว่า "ใกล้พอจนน่าสงสัยว่า Google อาจคืน place เดียวกัน" — กว้างกว่าระยะเดินจริง
// ของธุรกิจทั่วไป (~50-80m) แต่แคบกว่ารัศมีค้นหาของ findPlaceByLatLng เอง (500m) เพราะ
// เป้าหมายคือหา "คู่ที่อยู่ติดกันเป๊ะๆ" ไม่ใช่ "คู่ที่แค่อยู่ในโซนเดียวกัน" (นั่นจะ noise เกินไป)
const COLLISION_RADIUS_METERS = 150;

function clean(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function name(row: CsvRow): string {
  return row.ATT_NAME_TH || row.ATT_NAME_EN || row.ATT_ID;
}

function parseCoords(row: CsvRow): { lat: number; lng: number } | null {
  const parts = (row.ATT_LOCATION || "").split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
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

  // ทำ pipeline เดียวกับ uploadProvinceGooglePlaces.ts ทุกขั้นตอน เพื่อให้ได้ 498 rows
  // ชุดเดียวกับที่ยิง Google จริง (ไม่งั้นเทียบกันไม่ตรง)
  const overriddenRows = applyLocationOverrides(rawProvinceRows, locationOverrides);
  const autoResult = dedupeRows(overriddenRows, excludeIds, blockedMergePairs);
  const relevantForceMergeGroups = forceMergeGroups.filter((group) =>
    group.some((id) => rawProvinceRows.some((r) => r.ATT_ID === id))
  );
  const { deduped } = applyForceMerges(overriddenRows, autoResult, relevantForceMergeGroups);

  console.log(`Target province: ${TARGET_PROVINCE}`);
  console.log(`Rows after dedupe (same set that gets sent to Google): ${deduped.length}`);
  console.log(`Collision radius: ${COLLISION_RADIUS_METERS}m\n`);

  // เก็บเฉพาะแถวที่มีพิกัด valid — แถวที่พิกัดพังไม่มีทางเทียบระยะได้อยู่แล้ว
  const withCoords = deduped
    .map((row) => ({ row, coords: parseCoords(row) }))
    .filter((r): r is { row: CsvRow; coords: { lat: number; lng: number } } => r.coords !== null);

  console.log(`Rows with valid coordinates: ${withCoords.length} / ${deduped.length}\n`);

  // brute-force O(n^2) — 498 แถวก็ ~124,000 คู่ ยังเร็วพอสำหรับรันครั้งเดียวแบบนี้
  const candidates: {
    a: CsvRow;
    b: CsvRow;
    distance: number;
  }[] = [];

  for (let i = 0; i < withCoords.length; i++) {
    for (let j = i + 1; j < withCoords.length; j++) {
      const d = haversineMeters(
        withCoords[i].coords.lat,
        withCoords[i].coords.lng,
        withCoords[j].coords.lat,
        withCoords[j].coords.lng
      );
      if (d <= COLLISION_RADIUS_METERS) {
        candidates.push({ a: withCoords[i].row, b: withCoords[j].row, distance: d });
      }
    }
  }

  candidates.sort((x, y) => x.distance - y.distance);

  console.log("=".repeat(70));
  console.log(`CANDIDATE PAIRS (${candidates.length}) — น่าสงสัยว่า Google อาจคืน place เดียวกัน`);
  console.log("=".repeat(70));

  if (candidates.length === 0) {
    console.log("None. (ถ้ายังเจอ collision 59 คู่ใน Supabase จริง แปลว่าไม่ได้มาจากพิกัดใกล้กัน — น่าจะเป็นเพราะชื่อคล้ายกันจน Google findplacefromtext ค้นด้วยชื่อแล้วไปเจอที่อื่นที่ไกลจาก locationbias center พอสมควร ต้องดู log เต็มแทน)");
    return;
  }

  candidates.forEach((c, i) => {
    console.log(`\n--- Candidate ${i + 1} (${c.distance.toFixed(1)}m apart) ---`);
    console.log(`  A: ${c.a.ATT_ID} | ${name(c.a)}`);
    console.log(`     type: ${clean(c.a.ATT_TYPE_LABEL) ?? "-"} | tel: ${clean(c.a.ATT_TEL) ?? "-"} | web: ${clean(c.a.ATT_WEBSITE) ?? "-"}`);
    console.log(`  B: ${c.b.ATT_ID} | ${name(c.b)}`);
    console.log(`     type: ${clean(c.b.ATT_TYPE_LABEL) ?? "-"} | tel: ${clean(c.b.ATT_TEL) ?? "-"} | web: ${clean(c.b.ATT_WEBSITE) ?? "-"}`);
  });

  console.log(`\n\nสรุป: พบ ${candidates.length} คู่ที่พิกัดใกล้กันภายใน ${COLLISION_RADIUS_METERS}m`);
  console.log(
    "หมายเหตุ: นี่คือ candidate เท่านั้น ไม่ใช่ทุกคู่จะเป็น 59 collision ที่เกิดจริงใน Supabase " +
    "(เพราะ Google อาจเจอ/ไม่เจอ place ก็ได้ และชื่อที่ใช้ค้นก็มีผลด้วย) แต่เป็นจุดเริ่มต้นที่ดีที่สุด " +
    "ที่เช็คได้โดยไม่เสีย API — เอาลิสต์นี้ไปเทียบกับ log เต็มของรอบที่รันจริง (ที่มีบรรทัด " +
    "'Saved <google_place_id>') เพื่อยืนยันว่าคู่ไหนชนกันจริง"
  );
}

main();