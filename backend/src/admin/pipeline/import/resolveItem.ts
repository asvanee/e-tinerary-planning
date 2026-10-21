import { parseCoords } from "../dedupe/normalize";
import { GooglePlacesClient } from "./googlePlaces";
import { ImportItem, ImportStore } from "./importJob";
import { ImportRow } from "./importRows";
import { buildPlaceRecord } from "./placeRecord";

export type ResolveAction = "accept_google" | "csv_only" | "skip";
export const RESOLVE_ACTIONS: readonly ResolveAction[] = ["accept_google", "csv_only", "skip"];

/** ส่วนที่แตะ DB — ฝั่งจริงอยู่ที่ admin/imports/importQueries.ts */
export type ResolveStore = Pick<ImportStore, "findPlaceIdByGooglePlaceId" | "insertPlace" | "insertPlaceTypes"> & {
  /** item → resolved (เฉพาะที่ยังเป็น needs_review_*) · false = ถูกตัดสินไปก่อนแล้ว */
  markResolved(itemId: string, placeId: string | null, message: string): Promise<boolean>;
};

export type ResolveResult = { ok: true; placeId: string | null } | { ok: false; message: string };

const fail = (message: string): ResolveResult => ({ ok: false, message });

/**
 * admin ตัดสินแถว needs_review หลังนำเข้า (R5 P4c):
 * - accept_google: ใช้สถานที่ที่ Google เสนอ (เรียก Details 1 ครั้ง) · พิกัดยังใช้จาก CSV
 * - csv_only: สร้างจาก CSV อย่างเดียว google_place_id = "csv:<ATT_ID>" (D-26)
 * - skip: ไม่นำเข้า
 * row = ค่าหลังตัดสินใจในหน้ารีวิวแล้ว (prepareImportRows) · item ต้องยังเป็น needs_review_*
 */
export async function resolveItem({
  item,
  row,
  action,
  google,
  store,
}: {
  item: ImportItem & { item_id: string };
  row: ImportRow["row"] | undefined;
  action: ResolveAction;
  google: GooglePlacesClient | null; // null = ไม่มี API key (ใช้ได้แค่ csv_only / skip)
  store: ResolveStore;
}): Promise<ResolveResult> {
  if (!item.status.startsWith("needs_review_")) return fail("แถวนี้ไม่ได้รอตรวจแล้ว");

  const resolve = async (placeId: string | null, message: string): Promise<ResolveResult> =>
    (await store.markResolved(item.item_id, placeId, message))
      ? { ok: true, placeId }
      : fail("แถวนี้ถูกตัดสินไปแล้ว");

  if (action === "skip") return resolve(null, "admin ตัดทิ้ง");

  if (!row) return fail("ไม่พบสถานที่นี้ในข้อมูลที่ตรวจแล้ว (อาจถูกตัดทิ้งหรือรวมกับแถวอื่นภายหลัง)");
  const coords = parseCoords(row);
  if (!coords) return fail("พิกัดใน CSV ใช้ไม่ได้ — แก้พิกัดในหน้าตรวจข้อมูลก่อน");

  if (action === "csv_only") {
    const record = buildPlaceRecord(row, coords, { place_id: `csv:${row.ATT_ID}` }, {});
    if (await store.findPlaceIdByGooglePlaceId(record.google_place_id)) {
      return fail("สถานที่นี้ถูกนำเข้าจาก CSV ไว้แล้ว");
    }
    return resolve(await store.insertPlace(record), "admin นำเข้าจาก CSV อย่างเดียว");
  }

  // accept_google
  if (!google) return fail("ยังไม่ได้ตั้งค่า GOOGLE_PLACES_API_KEY ใน backend/.env");
  if (item.status === "needs_review_duplicate" || !item.google_place_id) {
    return fail("ผลจาก Google ใช้ไม่ได้ (ไม่มีหรือซ้ำกับสถานที่ที่มีอยู่) — เลือกนำเข้าจาก CSV หรือตัดทิ้ง");
  }
  if (await store.findPlaceIdByGooglePlaceId(item.google_place_id)) {
    return fail("สถานที่ที่ Google เสนอมีอยู่ในระบบแล้ว — เลือกนำเข้าจาก CSV หรือตัดทิ้ง");
  }

  const candidate = {
    place_id: item.google_place_id,
    name: item.candidate?.name ?? undefined,
    formatted_address: item.candidate?.formatted_address ?? undefined,
  };
  const details = await google.getDetails(item.google_place_id);
  const record = buildPlaceRecord(row, coords, candidate, details);
  // Google อาจคืน place_id ใหม่ใน Details — เช็คซ้ำอีกครั้งด้วย id ที่จะบันทึกจริง
  if (record.google_place_id !== item.google_place_id && (await store.findPlaceIdByGooglePlaceId(record.google_place_id))) {
    return fail("สถานที่ที่ Google เสนอมีอยู่ในระบบแล้ว — เลือกนำเข้าจาก CSV หรือตัดทิ้ง");
  }

  const placeId = await store.insertPlace(record);
  let message = "admin ยอมรับผล Google";
  if (record.gmaps_types) {
    try {
      await store.insertPlaceTypes(placeId, [...new Set(record.gmaps_types)]);
    } catch (err) {
      console.error(`resolve item ${item.item_id} place_types error:`, err);
      message += " · บันทึก place_types ไม่สำเร็จ";
    }
  }
  return resolve(placeId, message);
}
