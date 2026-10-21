import { parseCoords } from "../dedupe/normalize";
import { GoogleApiError, GooglePlacesClient } from "./googlePlaces";
import { ImportRow } from "./importRows";
import { matchCandidate } from "./matchCandidate";
import { buildPlaceRecord, clean, PlaceRecord } from "./placeRecord";

export type ImportItemStatus =
  | "imported"
  | "needs_review_mismatch"
  | "needs_review_not_found"
  | "needs_review_duplicate"
  | "error"
  | "resolved"; // admin ตัดสินแถว needs_review แล้ว (P4c — resolveItem.ts)

// 1 แถวของ pipeline_job_items (item_id / created_at ให้ DB สร้าง)
export interface ImportItem {
  job_id: string;
  att_id: string;
  status: ImportItemStatus;
  google_place_id: string | null;
  place_id: string | null;
  candidate: { name: string | null; formatted_address: string | null; lat: number | null; lng: number | null } | null;
  distance_m: number | null;
  message: string | null;
}

export interface ImportCounters {
  processed: number;
  imported: number;
  needs_review: number;
  failed: number;
}

export type JobFinalStatus = "done" | "failed" | "cancelled";

/** ส่วนที่แตะ DB — ฝั่งจริงอยู่ที่ admin/imports/importQueries.ts, test ใช้ของปลอม */
export interface ImportStore {
  isCancelRequested(jobId: string): Promise<boolean>;
  /** place_id ของแถวใน places ที่ใช้ google_place_id นี้อยู่แล้ว (null = ยังไม่มี) */
  findPlaceIdByGooglePlaceId(googlePlaceId: string): Promise<string | null>;
  insertPlace(record: PlaceRecord): Promise<string>;
  insertPlaceTypes(placeId: string, types: string[]): Promise<void>;
  addItem(item: ImportItem): Promise<void>;
  updateProgress(jobId: string, counters: ImportCounters): Promise<void>;
  finishJob(jobId: string, status: JobFinalStatus, error: string | null): Promise<void>;
}

export interface RunImportJobOptions {
  jobId: string;
  rows: ImportRow[];
  google: GooglePlacesClient;
  store: ImportStore;
  /** หน่วงหลังทุก request ของ Google (ms) */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const GOOGLE_DELAY_MS = 200;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// "ชื่อไทย อำเภอ จังหวัด" (ไม่มีชื่อไทยใช้ชื่ออังกฤษ) — D-30
export function buildSearchQuery(row: ImportRow["row"]): string {
  return [clean(row.ATT_NAME_TH) ?? clean(row.ATT_NAME_EN), clean(row.DISTRICT_NAME_TH), clean(row.PROVINCE_NAME_TH)]
    .filter(Boolean)
    .join(" ");
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * รัน job นำเข้าทีละแถว (R5 P4):
 * พิกัด CSV ใช้ไม่ได้ → error (ไม่เรียก Google) · Find Place → ไม่เจอ → needs_review_not_found
 * → เกณฑ์ D-33 (≤ 1 km + ชื่อคล้าย) ไม่ผ่าน → needs_review_mismatch · google_place_id ซ้ำ (ใน job นี้หรือใน places) → needs_review_duplicate
 * → ผ่าน → Details → insert places + place_types → imported
 * แถวที่ error ไม่หยุด job ยกเว้น Google ตอบว่า key/โควต้าใช้ไม่ได้ (หยุดเป็น failed)
 * เช็ค cancel_requested ก่อนทุกแถว · ไม่ throw (ผลสุดท้ายบันทึกผ่าน store.finishJob)
 */
export async function runImportJob({
  jobId,
  rows,
  google,
  store,
  delayMs = GOOGLE_DELAY_MS,
  sleep = defaultSleep,
}: RunImportJobOptions): Promise<void> {
  const counters: ImportCounters = { processed: 0, imported: 0, needs_review: 0, failed: 0 };
  const seenGooglePlaceIds = new Map<string, string>(); // google_place_id → ATT_ID ที่ใช้ไปแล้วใน job นี้

  const record = async (item: Omit<ImportItem, "job_id">) => {
    await store.addItem({ job_id: jobId, ...item });
    counters.processed++;
    if (item.status === "imported") counters.imported++;
    else if (item.status === "error") counters.failed++;
    else counters.needs_review++;
    await store.updateProgress(jobId, counters);
  };

  try {
    for (const { attId, row } of rows) {
      if (await store.isCancelRequested(jobId)) {
        await store.finishJob(jobId, "cancelled", null);
        return;
      }

      const empty = { google_place_id: null, place_id: null, candidate: null, distance_m: null };
      const coords = parseCoords(row);
      if (!coords) {
        await record({ att_id: attId, status: "error", ...empty, message: "พิกัดใน CSV ใช้ไม่ได้ (ไม่ได้เรียก Google)" });
        continue;
      }

      try {
        const candidate = await google.findPlace(buildSearchQuery(row), coords);
        await sleep(delayMs);

        if (!candidate?.place_id) {
          await record({ att_id: attId, status: "needs_review_not_found", ...empty, message: "Google ไม่พบสถานที่นี้" });
          continue;
        }

        const location = candidate.geometry?.location;
        const candidateInfo = {
          name: candidate.name ?? null,
          formatted_address: candidate.formatted_address ?? null,
          lat: location?.lat ?? null,
          lng: location?.lng ?? null,
        };
        const match = matchCandidate(coords, location, candidate.name, [row.ATT_NAME_TH, row.ATT_NAME_EN]);
        const found = {
          google_place_id: candidate.place_id,
          candidate: candidateInfo,
          distance_m: match.distanceM === null ? null : Math.round(match.distanceM),
        };

        if (!match.accepted) {
          const message =
            match.reason === "no_location"
              ? "Google ไม่มีพิกัดของผลที่พบ"
              : match.reason === "too_far"
              ? "ผลจาก Google ห่างจากพิกัด CSV เกิน 1 km"
              : "ชื่อจาก Google ไม่คล้ายชื่อใน CSV";
          await record({ att_id: attId, status: "needs_review_mismatch", place_id: null, ...found, message });
          continue;
        }

        const usedBy = seenGooglePlaceIds.get(candidate.place_id);
        const existingPlaceId = usedBy ? null : await store.findPlaceIdByGooglePlaceId(candidate.place_id);
        if (usedBy || existingPlaceId) {
          await record({
            att_id: attId,
            status: "needs_review_duplicate",
            place_id: existingPlaceId,
            ...found,
            message: usedBy
              ? `Google คืนสถานที่เดียวกับ ATT_ID ${usedBy} ใน job นี้`
              : "google_place_id นี้มีอยู่แล้วในตาราง places",
          });
          continue;
        }

        const details = await google.getDetails(candidate.place_id);
        await sleep(delayMs);

        const placeRecord = buildPlaceRecord(row, coords, candidate, details);
        seenGooglePlaceIds.set(placeRecord.google_place_id, attId);
        const placeId = await store.insertPlace(placeRecord);
        const notes: string[] = [];

        // place เพิ่งสร้างใหม่ จึงยังไม่มีคู่ (place_id, api_type_id) เดิม — insert ได้ทุกตัว (D-27)
        // ไม่สำเร็จไม่ถือว่าแถวนี้ error เพราะ places บันทึกแล้ว (gmaps_types ยังอยู่ใน places)
        if (placeRecord.gmaps_types) {
          try {
            await store.insertPlaceTypes(placeId, [...new Set(placeRecord.gmaps_types)]);
          } catch (typesErr) {
            console.error(`import job ${jobId} row ${attId} place_types error:`, typesErr);
            notes.push("บันทึก place_types ไม่สำเร็จ");
          }
        }

        await record({
          att_id: attId,
          status: "imported",
          ...found,
          google_place_id: placeRecord.google_place_id,
          place_id: placeId,
          message: notes.length > 0 ? notes.join(" · ") : null,
        });
      } catch (err) {
        if (err instanceof GoogleApiError && err.fatal) throw err;
        console.error(`import job ${jobId} row ${attId} error:`, err);
        await record({ att_id: attId, status: "error", ...empty, message: errorText(err) });
      }
    }

    await store.finishJob(jobId, "done", null);
  } catch (err) {
    console.error(`import job ${jobId} failed:`, err);
    try {
      await store.finishJob(jobId, "failed", errorText(err));
    } catch (finishErr) {
      console.error(`import job ${jobId} finishJob error:`, finishErr);
    }
  }
}
