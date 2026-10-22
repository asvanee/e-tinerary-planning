// type ของ response จาก backend/src/admin/imports/ (importController.ts, importQueries.ts)
// และ backend/src/admin/pipeline/import/importJob.ts — แก้ฝั่งหนึ่งต้องแก้อีกฝั่งด้วย

export type ImportJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface ImportJob {
  job_id: string;
  province: string;
  status: ImportJobStatus;
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

export type ImportItemStatus =
  | "imported"
  | "needs_review_mismatch"
  | "needs_review_not_found"
  | "needs_review_duplicate"
  | "error"
  | "resolved"; // admin ตัดสินแถวที่รอตรวจแล้ว (P4c)

export interface ImportItem {
  item_id: string;
  job_id: string;
  att_id: string;
  status: ImportItemStatus;
  google_place_id: string | null;
  place_id: string | null;
  candidate: { name: string | null; formatted_address: string | null; lat: number | null; lng: number | null } | null;
  distance_m: number | null;
  message: string | null;
  created_at: string;
  csv_name: string | null;
  csv_location: string | null;
}

// GET /provinces/:province/import/preview
export interface ImportPreview {
  province: string;
  csvRows: number;
  importRows: number;
  alreadyDone: number;
  toProcess: number;
  invalidLocation: number;
  googleRequests: { findPlace: number; detailsMax: number };
  pendingDecisions: number;
  placesInProvince: number;
  foreignPlaces: number;
  activeJob: ImportJob | null;
  blockers: string[];
}

// GET /imports/:jobId/items
export interface ImportItemsPage {
  page: number;
  total: number;
  items: ImportItem[];
}
