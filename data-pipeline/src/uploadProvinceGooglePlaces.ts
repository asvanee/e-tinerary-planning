import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import * as dotenv from "dotenv";
import { CsvRow, GooglePlaceResult, PlaceRecord } from "./types";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const INPUT_PATH = path.join(__dirname, "../data/attraction.csv");
const TARGET_PROVINCE = process.env.TARGET_PROVINCE || "กรุงเทพมหานคร";
const DELAY_MS = Number(process.env.GOOGLE_DELAY_MS || 200);
const LIMIT = process.env.PLACES_LIMIT
  ? Number(process.env.PLACES_LIMIT)
  : Number.POSITIVE_INFINITY;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function findPlaceByLatLng(
  nameTh: string,
  nameEn: string,
  lat: number,
  lng: number
): Promise<GooglePlaceResult | null> {
  try {
    const searchName = nameEn || nameTh;
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
      {
        params: {
          input: searchName,
          inputtype: "textquery",
          locationbias: `circle:500@${lat},${lng}`,
          fields:
            "place_id,name,geometry,rating,price_level,formatted_address,user_ratings_total",
          language: "th",
          key: GOOGLE_API_KEY,
        },
      }
    );

    return (res.data.candidates?.[0] as GooglePlaceResult) || null;
  } catch (error: any) {
    console.error(`Find Place error: ${error.message}`);
    return null;
  }
}

async function getPlaceDetails(
  placeId: string
): Promise<Partial<GooglePlaceResult>> {
  try {
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        params: {
          place_id: placeId,
          fields:
            "place_id,name,formatted_address,formatted_phone_number,website,opening_hours,rating,price_level,user_ratings_total,geometry",
          language: "th",
          key: GOOGLE_API_KEY,
        },
      }
    );

    if (res.data.status !== "OK") return {};
    return res.data.result as GooglePlaceResult;
  } catch (error: any) {
    console.error(`Place Details error: ${error.message}`);
    return {};
  }
}

function toPlaceRecord(
  row: CsvRow,
  coords: { lat: number; lng: number },
  found: GooglePlaceResult,
  details: Partial<GooglePlaceResult>
): PlaceRecord {
  return {
    google_place_id: found.place_id,
    place_name:
      details.name || found.name || clean(row.ATT_NAME_TH) || clean(row.ATT_NAME_EN) || row.ATT_ID,
    latitude: details.geometry?.location?.lat ?? found.geometry?.location?.lat ?? coords.lat,
    longitude: details.geometry?.location?.lng ?? found.geometry?.location?.lng ?? coords.lng,
    rating: details.rating ?? found.rating ?? null,
    price_level: details.price_level ?? found.price_level ?? null,
    formatted_address:
      details.formatted_address ?? found.formatted_address ?? buildAddress(row),
    phone_number: details.formatted_phone_number ?? clean(row.ATT_TEL),
    website: details.website ?? clean(row.ATT_WEBSITE),
    opening_hours: details.opening_hours ?? null,
    province: clean(row.PROVINCE_NAME_TH) || "",
    district: clean(row.DISTRICT_NAME_TH) || "",
    user_ratings_total:
      details.user_ratings_total ?? found.user_ratings_total ?? null,
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

  const provinceRows = rows
    .filter((row) => clean(row.PROVINCE_NAME_TH) === TARGET_PROVINCE)
    .slice(0, LIMIT);

  console.log(`Target province: ${TARGET_PROVINCE}`);
  console.log(`Province rows: ${provinceRows.length}`);

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  const replacedCsvIds: string[] = [];
  const seenGooglePlaceIds = new Set<string>();

  for (let i = 0; i < provinceRows.length; i++) {
    const row = provinceRows[i];
    const nameTh = clean(row.ATT_NAME_TH) || "";
    const nameEn = clean(row.ATT_NAME_EN) || "";
    const displayName = nameTh || nameEn || row.ATT_ID;
    const coords = parseLatLng(row.ATT_LOCATION || "");

    console.log(`[${i + 1}/${provinceRows.length}] ${displayName}`);

    if (!coords) {
      console.log("  Invalid location");
      errorCount++;
      continue;
    }

    const found = await findPlaceByLatLng(nameTh, nameEn, coords.lat, coords.lng);
    await sleep(DELAY_MS);

    if (!found?.place_id) {
      console.log("  Not found on Google Places");
      notFoundCount++;
      continue;
    }

    const details = await getPlaceDetails(found.place_id);
    await sleep(DELAY_MS);

    const record = toPlaceRecord(row, coords, found, details);
    const { error } = await supabase
      .from("places")
      .upsert(record, { onConflict: "google_place_id" });

    if (error) {
      console.error(`  Supabase upsert error: ${error.message}`);
      errorCount++;
      continue;
    }

    successCount++;
    seenGooglePlaceIds.add(record.google_place_id);
    replacedCsvIds.push(`csv:${row.ATT_ID}`);
    console.log(
      `  Saved ${record.google_place_id} | opening_hours: ${
        record.opening_hours ? "yes" : "no"
      }`
    );
  }

  if (replacedCsvIds.length > 0) {
    const { error } = await supabase
      .from("places")
      .delete()
      .in("google_place_id", replacedCsvIds);

    if (error) {
      console.error(`Could not delete replaced CSV records: ${error.message}`);
    } else {
      console.log(`Deleted replaced CSV records: ${replacedCsvIds.length}`);
    }
  }

  console.log("Province Google upload complete.");
  console.log(`Success: ${successCount}`);
  console.log(`Unique Google place IDs: ${seenGooglePlaceIds.size}`);
  console.log(`Not found: ${notFoundCount}`);
  console.log(`Error: ${errorCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
