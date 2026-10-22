import { supabase } from "../../config/db";
import {
  ImportCounters,
  ImportItem,
  ImportItemStatus,
  ImportStore,
  JobFinalStatus,
} from "../pipeline/import/importJob";
import { PlaceRecord } from "../pipeline/import/placeRecord";
import { ResolveStore } from "../pipeline/import/resolveItem";
import { selectAll } from "../provinces/decisionQueries";

// ตาราง pipeline_jobs / pipeline_job_items (docs/DATABASE_SCHEMA.md) — job_id/item_id เป็น uuid
const JOBS = "pipeline_jobs";
const ITEMS = "pipeline_job_items";
const ACTIVE_STATUSES = ["queued", "running"];
export const ITEMS_PAGE_SIZE = 100;

export interface ImportJob {
  job_id: string;
  province: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  limit_rows: number | null;
  total: number;
  processed: number;
  imported: number;
  needs_review: number;
  failed: number;
  cancel_requested: boolean;
  error: string | null;
  started_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface StoredImportItem extends ImportItem {
  item_id: string;
  created_at: string;
}

export async function findActiveJob(): Promise<ImportJob | null> {
  const { data, error } = await supabase
    .from(JOBS)
    .select("*")
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as ImportJob | undefined) ?? null;
}

export async function createRunningJob(job: {
  province: string;
  limit_rows: number | null;
  total: number;
  started_by: string;
}): Promise<ImportJob> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(JOBS)
    .insert({ ...job, status: "running", started_at: now })
    .select("*")
    .single();
  if (error) throw error;
  return data as ImportJob;
}

export async function getJob(jobId: string): Promise<ImportJob | null> {
  const { data, error } = await supabase.from(JOBS).select("*").eq("job_id", jobId).maybeSingle();
  if (error) throw error;
  return (data as ImportJob | null) ?? null;
}

export async function listJobs(province: string): Promise<ImportJob[]> {
  const { data, error } = await supabase
    .from(JOBS)
    .select("*")
    .eq("province", province)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ImportJob[];
}

// ขอยกเลิก job ที่ยังทำงานอยู่ (runner เช็คก่อนทุกแถว) — null = ไม่มี job นี้หรือจบไปแล้ว
export async function requestCancel(jobId: string): Promise<ImportJob | null> {
  const { data, error } = await supabase
    .from(JOBS)
    .update({ cancel_requested: true })
    .eq("job_id", jobId)
    .in("status", ACTIVE_STATUSES)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as ImportJob | null) ?? null;
}

export async function listItems(
  jobId: string,
  status: ImportItemStatus | null,
  page: number
): Promise<{ items: StoredImportItem[]; total: number }> {
  const from = page * ITEMS_PAGE_SIZE;
  let query = supabase
    .from(ITEMS)
    .select("*", { count: "exact" })
    .eq("job_id", jobId)
    .order("created_at")
    .order("item_id")
    .range(from, from + ITEMS_PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) throw error;
  return { items: (data ?? []) as StoredImportItem[], total: count ?? 0 };
}

export async function getItem(itemId: string): Promise<StoredImportItem | null> {
  const { data, error } = await supabase.from(ITEMS).select("*").eq("item_id", itemId).maybeSingle();
  if (error) throw error;
  return (data as StoredImportItem | null) ?? null;
}

// แถวที่รอ admin ตัดสินหลังนำเข้า ของทุก job ในจังหวัด (P4c)
export async function listPendingItems(province: string): Promise<StoredImportItem[]> {
  const jobIds = await jobIdsOfProvince(province);
  if (jobIds.length === 0) return [];
  return selectAll<StoredImportItem>((from, to) =>
    supabase
      .from(ITEMS)
      .select("*")
      .in("job_id", jobIds)
      .like("status", "needs_review_%")
      .order("created_at")
      .order("item_id")
      .range(from, to)
  );
}

async function jobIdsOfProvince(province: string): Promise<string[]> {
  const rows = await selectAll<{ job_id: string }>((from, to) =>
    supabase.from(JOBS).select("job_id").eq("province", province).order("created_at").range(from, to)
  );
  return rows.map((r) => r.job_id);
}

async function itemsOfProvince(province: string): Promise<{ att_id: string; status: string; place_id: string | null }[]> {
  const jobIds = await jobIdsOfProvince(province);
  if (jobIds.length === 0) return [];
  return selectAll((from, to) =>
    supabase
      .from(ITEMS)
      .select("att_id, status, place_id")
      .in("job_id", jobIds)
      .order("created_at")
      .order("item_id")
      .range(from, to)
  );
}

/**
 * สถานะการนำเข้าของจังหวัด (ใช้ตัดสินว่าเริ่ม/รันต่อได้ไหม — D-30)
 * - doneAttIds: ATT_ID ที่มีผลแล้ว (ทุกสถานะยกเว้น error) → job ถัดไปข้าม · แถว error ลองใหม่ได้
 * - foreignPlaces: แถวของจังหวัดนี้ใน places ที่ไม่ได้มาจาก job ของระบบนี้ (ข้อมูลเดิม) → ต้องลบก่อน
 */
export async function provinceImportState(
  province: string
): Promise<{ doneAttIds: Set<string>; placesInProvince: number; foreignPlaces: number }> {
  const [items, places] = await Promise.all([
    itemsOfProvince(province),
    selectAll<{ place_id: string }>((from, to) =>
      supabase.from("places").select("place_id").eq("province", province).order("place_id").range(from, to)
    ),
  ]);

  const doneAttIds = new Set(items.filter((i) => i.status !== "error").map((i) => i.att_id));
  // place_id ของ needs_review_duplicate ชี้ไปที่แถวเดิมใน places จึงนับเฉพาะที่ job นี้สร้างเอง
  const importedPlaceIds = new Set(
    items
      .filter((i) => i.status === "imported" || i.status === "resolved")
      .map((i) => i.place_id)
      .filter((id): id is string => !!id)
  );
  const foreignPlaces = places.filter((p) => !importedPlaceIds.has(p.place_id)).length;

  return { doneAttIds, placesInProvince: places.length, foreignPlaces };
}

// เปิด server ใหม่ = job ที่ค้าง queued/running ไม่มีใครรันต่อแล้ว
export async function failStaleJobs(): Promise<number> {
  const { data, error } = await supabase
    .from(JOBS)
    .update({ status: "failed", error: "server เริ่มใหม่ระหว่างที่ job ทำงาน", finished_at: new Date().toISOString() })
    .in("status", ACTIVE_STATUSES)
    .select("job_id");
  if (error) throw error;
  return data?.length ?? 0;
}

// ---------- ImportStore (ให้ runImportJob ใช้) / ResolveStore (ให้ resolveItem ใช้) ----------

export const supabaseImportStore: ImportStore = {
  async isCancelRequested(jobId) {
    const { data, error } = await supabase.from(JOBS).select("cancel_requested").eq("job_id", jobId).single();
    if (error) throw error;
    return !!data?.cancel_requested;
  },

  async findPlaceIdByGooglePlaceId(googlePlaceId) {
    const { data, error } = await supabase
      .from("places")
      .select("place_id")
      .eq("google_place_id", googlePlaceId)
      .maybeSingle();
    if (error) throw error;
    return data?.place_id ?? null;
  },

  // insert เท่านั้น (ไม่ upsert) — google_place_id ซ้ำจะ error แทนการเขียนทับ (D-30)
  async insertPlace(record: PlaceRecord) {
    const { data, error } = await supabase.from("places").insert(record).select("place_id").single();
    if (error) throw new Error(`บันทึก places ไม่สำเร็จ: ${error.message}`);
    return data.place_id as string;
  },

  async insertPlaceTypes(placeId, types) {
    if (types.length === 0) return;
    const { error } = await supabase
      .from("place_types")
      .insert(types.map((apiTypeId) => ({ place_id: placeId, api_type_id: apiTypeId, source: "google" })));
    if (error) throw error;
  },

  async addItem(item) {
    const { error } = await supabase.from(ITEMS).insert(item);
    if (error) throw error;
  },

  async updateProgress(jobId, counters: ImportCounters) {
    const { error } = await supabase.from(JOBS).update(counters).eq("job_id", jobId);
    if (error) throw error;
  },

  async finishJob(jobId, status: JobFinalStatus, message) {
    const { error } = await supabase
      .from(JOBS)
      .update({ status, error: message, finished_at: new Date().toISOString() })
      .eq("job_id", jobId);
    if (error) throw error;
  },
};

export const supabaseResolveStore: ResolveStore = {
  findPlaceIdByGooglePlaceId: supabaseImportStore.findPlaceIdByGooglePlaceId,
  insertPlace: supabaseImportStore.insertPlace,
  insertPlaceTypes: supabaseImportStore.insertPlaceTypes,

  // อัปเดตเฉพาะแถวที่ยังรอตรวจ — กันกดซ้ำ/สองแท็บตัดสินแถวเดียวกัน
  async markResolved(itemId, placeId, message) {
    const { data, error } = await supabase
      .from(ITEMS)
      .update({ status: "resolved", place_id: placeId, message })
      .eq("item_id", itemId)
      .like("status", "needs_review_%")
      .select("item_id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  },
};
