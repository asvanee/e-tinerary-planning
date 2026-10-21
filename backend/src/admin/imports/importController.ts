import { Response } from "express";
import { AuthRequest } from "../../features/auth/authMiddleware";
import { getProvinceRows } from "../pipeline/attractionCsv";
import { parseCoords } from "../pipeline/dedupe/normalize";
import { createGooglePlacesClient } from "../pipeline/import/googlePlaces";
import { ImportItemStatus, runImportJob } from "../pipeline/import/importJob";
import { ImportRow, prepareImportRows } from "../pipeline/import/importRows";
import { buildProvinceReview } from "../pipeline/review/buildReview";
import { listDecisions } from "../provinces/decisionQueries";
import {
  createRunningJob,
  findActiveJob,
  getJob,
  ImportJob,
  listItems,
  listJobs,
  provinceImportState,
  requestCancel,
  supabaseImportStore,
} from "./importQueries";

const MAX_LIMIT_ROWS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_STATUSES = new Set<ImportItemStatus>([
  "imported",
  "needs_review_mismatch",
  "needs_review_not_found",
  "needs_review_duplicate",
  "error",
]);

// รันได้ครั้งละ 1 job ต่อ process (D-24) — เช็คคู่กับสถานะใน DB
let jobRunningInProcess = false;

interface ImportPlan {
  province: string;
  csvRows: number;
  importRows: number; // จำนวนสถานที่หลังตัดสินใจแล้ว (ทั้งจังหวัด)
  alreadyDone: number; // มีผลจาก job ก่อนหน้าแล้ว (ข้าม)
  toProcess: number; // จำนวนที่ job นี้จะทำ (หลัง limit)
  invalidLocation: number; // ในชุดที่จะทำ: พิกัด CSV ใช้ไม่ได้ (ไม่เรียก Google)
  googleRequests: { findPlace: number; detailsMax: number };
  pendingDecisions: number;
  placesInProvince: number;
  foreignPlaces: number;
  activeJob: ImportJob | null;
  blockers: string[];
  rows: ImportRow[]; // ไม่ส่งให้ client
}

function parseLimit(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_LIMIT_ROWS) return { ok: false };
  return { ok: true, value: n };
}

// null = ไม่มีจังหวัดนี้ใน CSV
async function buildPlan(province: string, limit: number | null): Promise<ImportPlan | null> {
  const csvRows = await getProvinceRows(province);
  if (csvRows.length === 0) return null;

  const [decisions, state, activeJob] = await Promise.all([
    listDecisions(province),
    provinceImportState(province),
    findActiveJob(),
  ]);

  const pendingDecisions = buildProvinceReview(province, csvRows, decisions).summary.pending;
  const allRows = prepareImportRows(csvRows, decisions);
  const remaining = allRows.filter((r) => !state.doneAttIds.has(r.attId));
  const rows = limit === null ? remaining : remaining.slice(0, limit);
  const invalidLocation = rows.filter((r) => !parseCoords(r.row)).length;

  const blockers: string[] = [];
  if (!process.env.GOOGLE_PLACES_API_KEY) blockers.push("ยังไม่ได้ตั้งค่า GOOGLE_PLACES_API_KEY ใน backend/.env");
  if (pendingDecisions > 0) blockers.push(`ยังมี ${pendingDecisions} กลุ่ม/แถวในหน้ารีวิวที่ยังไม่ได้ตัดสินใจ`);
  if (activeJob || jobRunningInProcess) blockers.push("มีงานนำเข้าอื่นกำลังทำงานอยู่");
  if (state.foreignPlaces > 0) {
    blockers.push(`จังหวัดนี้มีข้อมูลเดิมใน places ${state.foreignPlaces} แถวที่ไม่ได้มาจากการนำเข้าระบบนี้ ต้องลบก่อน`);
  }
  if (rows.length === 0) blockers.push("ไม่มีสถานที่ที่ต้องนำเข้าแล้ว");

  const findPlace = rows.length - invalidLocation;
  return {
    province,
    csvRows: csvRows.length,
    importRows: allRows.length,
    alreadyDone: allRows.length - remaining.length,
    toProcess: rows.length,
    invalidLocation,
    googleRequests: { findPlace, detailsMax: findPlace },
    pendingDecisions,
    placesInProvince: state.placesInProvince,
    foreignPlaces: state.foreignPlaces,
    activeJob,
    blockers,
    rows,
  };
}

function publicPlan({ rows: _rows, ...plan }: ImportPlan) {
  return plan;
}

function provinceParam(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jobIdParam(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

// GET /api/admin/provinces/:province/import/preview?limit=N — ไม่เรียก Google
export const getImportPreview = async (req: AuthRequest, res: Response) => {
  try {
    const province = provinceParam(req.params.province);
    const limit = parseLimit(req.query.limit);
    if (!limit.ok) return res.status(400).json({ message: `จำนวนแถวต้องเป็นจำนวนเต็ม 1–${MAX_LIMIT_ROWS}` });
    const plan = province ? await buildPlan(province, limit.value) : null;
    if (!plan) return res.status(404).json({ message: "ไม่พบจังหวัดนี้ในข้อมูลสถานที่" });
    res.json(publicPlan(plan));
  } catch (err) {
    console.error("getImportPreview error:", err);
    res.status(500).json({ message: "ไม่สามารถเตรียมข้อมูลการนำเข้าได้" });
  }
};

// POST /api/admin/provinces/:province/import — body: { limit_rows?: number } · ตรวจเงื่อนไขซ้ำทั้งหมดก่อนเริ่ม
export const startImport = async (req: AuthRequest, res: Response) => {
  try {
    const province = provinceParam(req.params.province);
    const limit = parseLimit(req.body?.limit_rows);
    if (!limit.ok) return res.status(400).json({ message: `จำนวนแถวต้องเป็นจำนวนเต็ม 1–${MAX_LIMIT_ROWS}` });
    if (jobRunningInProcess) return res.status(409).json({ message: "มีงานนำเข้าอื่นกำลังทำงานอยู่" });

    const plan = province ? await buildPlan(province, limit.value) : null;
    if (!plan) return res.status(404).json({ message: "ไม่พบจังหวัดนี้ในข้อมูลสถานที่" });
    if (plan.blockers.length > 0) {
      return res.status(409).json({ message: plan.blockers[0], blockers: plan.blockers });
    }
    if (jobRunningInProcess) return res.status(409).json({ message: "มีงานนำเข้าอื่นกำลังทำงานอยู่" });

    jobRunningInProcess = true;
    let job: ImportJob;
    try {
      job = await createRunningJob({
        province: plan.province,
        limit_rows: limit.value,
        total: plan.rows.length,
        started_by: req.user!.id,
      });
    } catch (err) {
      jobRunningInProcess = false;
      throw err;
    }

    // รันเบื้องหลัง — หน้าเว็บ poll ความคืบหน้าจาก GET /api/admin/imports/:jobId
    runImportJob({
      jobId: job.job_id,
      rows: plan.rows,
      google: createGooglePlacesClient(process.env.GOOGLE_PLACES_API_KEY!),
      store: supabaseImportStore,
    }).finally(() => {
      jobRunningInProcess = false;
    });

    res.status(202).json({ job });
  } catch (err) {
    console.error("startImport error:", err);
    res.status(500).json({ message: "ไม่สามารถเริ่มการนำเข้าได้" });
  }
};

// GET /api/admin/provinces/:province/imports — ประวัติ job ของจังหวัด (ล่าสุดก่อน)
export const getProvinceImports = async (req: AuthRequest, res: Response) => {
  try {
    const province = provinceParam(req.params.province);
    if (!province) return res.status(400).json({ message: "ไม่พบชื่อจังหวัด" });
    res.json({ jobs: await listJobs(province) });
  } catch (err) {
    console.error("getProvinceImports error:", err);
    res.status(500).json({ message: "ไม่สามารถโหลดประวัติการนำเข้าได้" });
  }
};

// GET /api/admin/imports/:jobId — ความคืบหน้า
export const getImportJob = async (req: AuthRequest, res: Response) => {
  try {
    const jobId = jobIdParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ message: "รหัสงานนำเข้าไม่ถูกต้อง" });
    const job = await getJob(jobId);
    if (!job) return res.status(404).json({ message: "ไม่พบงานนำเข้านี้" });
    res.json({ job });
  } catch (err) {
    console.error("getImportJob error:", err);
    res.status(500).json({ message: "ไม่สามารถโหลดสถานะงานนำเข้าได้" });
  }
};

// POST /api/admin/imports/:jobId/cancel — job หยุดก่อนเริ่มแถวถัดไป
export const cancelImportJob = async (req: AuthRequest, res: Response) => {
  try {
    const jobId = jobIdParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ message: "รหัสงานนำเข้าไม่ถูกต้อง" });
    const job = await requestCancel(jobId);
    if (!job) return res.status(409).json({ message: "งานนำเข้านี้ไม่ได้ทำงานอยู่" });
    res.json({ job });
  } catch (err) {
    console.error("cancelImportJob error:", err);
    res.status(500).json({ message: "ไม่สามารถยกเลิกงานนำเข้าได้" });
  }
};

// GET /api/admin/imports/:jobId/items?status=&page= — ผลรายสถานที่ (หน้าละ 100 แถว, page เริ่มที่ 0)
export const getImportItems = async (req: AuthRequest, res: Response) => {
  try {
    const jobId = jobIdParam(req.params.jobId);
    if (!jobId) return res.status(400).json({ message: "รหัสงานนำเข้าไม่ถูกต้อง" });

    const status = req.query.status;
    if (status !== undefined && !(typeof status === "string" && ITEM_STATUSES.has(status as ImportItemStatus))) {
      return res.status(400).json({ message: "สถานะที่กรองไม่ถูกต้อง" });
    }
    const page = req.query.page === undefined ? 0 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 0) return res.status(400).json({ message: "เลขหน้าไม่ถูกต้อง" });

    const result = await listItems(jobId, (status as ImportItemStatus | undefined) ?? null, page);
    res.json({ page, ...result });
  } catch (err) {
    console.error("getImportItems error:", err);
    res.status(500).json({ message: "ไม่สามารถโหลดผลการนำเข้าได้" });
  }
};
