import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import * as dotenv from "dotenv";
import { CsvRow, PlaceRecord } from "./types";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const INPUT_PATH = path.join(__dirname, "../data/attraction.csv");
const BATCH_SIZE = 200;

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

function toPlaceRecord(row: CsvRow): PlaceRecord | null {
  const coords = parseLatLng(row.ATT_LOCATION || "");
  if (!coords) return null;

  return {
    google_place_id: `csv:${row.ATT_ID}`,
    place_name: clean(row.ATT_NAME_TH) || clean(row.ATT_NAME_EN) || row.ATT_ID,
    latitude: coords.lat,
    longitude: coords.lng,
    rating: null,
    price_level: null,
    formatted_address: buildAddress(row),
    phone_number: clean(row.ATT_TEL),
    website: clean(row.ATT_WEBSITE),
    opening_hours: clean(row.ATT_START_END)
      ? { text: clean(row.ATT_START_END) }
      : null,
    province: clean(row.PROVINCE_NAME_TH) || "",
    district: clean(row.DISTRICT_NAME_TH) || "",
    user_ratings_total: null,
    att_id: row.ATT_ID,                              // ← เพิ่ม (ขาดอยู่แต่เดิม)
  att_type_label: clean(row.ATT_TYPE_LABEL),        // ← เพิ่ม
  att_category_label: clean(row.ATT_CATEGORY_LABEL),// ← เพิ่ม
  att_detail_th: clean(row.ATT_DETAIL_TH),          // ← เพิ่ม
    att_facebook: clean(row.ATT_FACEBOOK),     // ← เพิ่ม
  att_instagram: clean(row.ATT_INSTAGRAM),   // ← เพิ่ม
  att_tiktok: clean(row.ATT_TIKTOK),         // ← เพิ่ม
  att_youtube: clean(row.ATT_YOUTUBE),       // ← เพิ่ม
  att_line: clean(row.ATT_LINE),             // ← เพิ่ม
  };
}

async function main() {
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

  const places = rows.map(toPlaceRecord).filter(Boolean) as PlaceRecord[];
  const seen = new Set<string>();
  const deduplicated = places.filter((place) => {
    if (seen.has(place.google_place_id)) return false;
    seen.add(place.google_place_id);
    return true;
  });

  console.log(`CSV rows: ${rows.length}`);
  console.log(`Valid places: ${places.length}`);
  console.log(`After deduplicate: ${deduplicated.length}`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < deduplicated.length; i += BATCH_SIZE) {
    const batch = deduplicated.slice(i, i + BATCH_SIZE);
    const batchNumber = i / BATCH_SIZE + 1;

    const { error } = await supabase
      .from("places")
      .upsert(batch, { onConflict: "google_place_id" });

    if (error) {
      errorCount += batch.length;
      console.error(`Batch ${batchNumber} error: ${error.message}`);
    } else {
      successCount += batch.length;
      console.log(
        `Batch ${batchNumber}: uploaded ${batch.length} places (total: ${successCount})`
      );
    }
  }

  console.log("Upload complete.");
  console.log(`Success: ${successCount}`);
  console.log(`Error: ${errorCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
