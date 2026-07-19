import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY!;
const TARGET_PROVINCE = process.env.TARGET_PROVINCE || "เชียงใหม่";
const DELAY_MS = Number(process.env.GOOGLE_DELAY_MS || 200);
const PAGE_SIZE = 1000; // Supabase จำกัด default 1000 rows ต่อ request ต้อง paginate เอง

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PlaceRow {
  place_id: string; // uuid ของเราเอง (primary key) — ใช้ตอน update
  google_place_id: string;
  place_name: string;
}

/**
 * ดึงเฉพาะ field "type" (Basic Data SKU ของ Google — ถูกกว่า Contact/Atmosphere
 * ที่ uploadProvinceGooglePlaces.ts เคยยิงตอน enrich ครั้งแรก) เพราะรอบนี้ต้องการ
 * แค่ category ไม่ต้องการ rating/phone/website ซ้ำ
 *
 * หมายเหตุ: ชื่อ field ตอน "ขอ" คือ "type" (เอกพจน์) แต่ Google คืนกลับมาเป็น
 * "types" (พหูพจน์, array) ใน response — เป็น quirk ของ Places API (Legacy) เอง
 */
async function fetchTypes(googlePlaceId: string): Promise<string[] | null> {
  try {
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        params: {
          place_id: googlePlaceId,
          fields: "type",
          language: "th",
          key: GOOGLE_API_KEY,
        },
      }
    );

    if (res.data.status !== "OK") {
      console.log(`  Google status: ${res.data.status}`);
      return null;
    }

    return res.data.result?.types ?? null;
  } catch (error: any) {
    console.error(`  Details error: ${error.message}`);
    return null;
  }
}

/**
 * ดึง place ทั้งหมดในจังหวัดที่ต้องเติม gmaps_types โดย:
 *  - google_place_id ต้องเป็นของจริงจาก Google เท่านั้น (ตัด "csv:xxx" placeholder ทิ้ง
 *    เพราะยิง Details API ด้วย id ที่ไม่ใช่ของ Google ไม่ได้อยู่แล้ว)
 *  - gmaps_types ต้องยัง null (รันซ้ำได้โดยไม่ยิง API ซ้ำของเดิมที่เคยดึงสำเร็จแล้ว)
 */
async function fetchRowsToProcess(province: string): Promise<PlaceRow[]> {
  const rows: PlaceRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("places")
      .select("place_id, google_place_id, place_name")
      .eq("province", province)
      .not("google_place_id", "like", "csv:%")
      .is("gmaps_types", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Fetch rows error: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY in .env");
    process.exit(1);
  }

  console.log(`Target province: ${TARGET_PROVINCE}`);

  const rows = await fetchRowsToProcess(TARGET_PROVINCE);
  console.log(
    `Places to fetch types for (real google_place_id, gmaps_types still null): ${rows.length}\n`
  );

  if (rows.length === 0) {
    console.log("ไม่มีแถวที่ต้องดึงเพิ่ม — อาจดึงครบแล้ว หรือยังไม่มี place จริงในจังหวัดนี้เลย");
    return;
  }

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`[${i + 1}/${rows.length}] ${row.place_name}`);

    const types = await fetchTypes(row.google_place_id);
    await sleep(DELAY_MS);

    if (types === null) {
      notFoundCount++;
      continue;
    }

    const { error } = await supabase
      .from("places")
      .update({ gmaps_types: types })
      .eq("place_id", row.place_id);

    if (error) {
      console.error(`  Update error: ${error.message}`);
      errorCount++;
      continue;
    }

    successCount++;
    console.log(`  types: ${types.join(", ")}`);
  }

  console.log("\nDone.");
  console.log(`Success: ${successCount}`);
  console.log(`Not found / no types returned: ${notFoundCount}`);
  console.log(`Error: ${errorCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
