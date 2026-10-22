import type { ImportItemStatus } from "./importTypes";

// ป้ายสถานะผลการนำเข้ารายสถานที่ (ตารางผลและส่วนรอตรวจ)
export const ITEM_STATUS_LABELS: Record<ImportItemStatus, string> = {
  imported: "นำเข้าแล้ว",
  needs_review_mismatch: "Google ไม่ตรง",
  needs_review_not_found: "ไม่พบใน Google",
  needs_review_duplicate: "ซ้ำกับที่มีอยู่",
  error: "ผิดพลาด",
  resolved: "ตัดสินแล้ว",
};

export const ITEM_STATUS_CLASS: Record<ImportItemStatus, string> = {
  imported: "bg-emerald-50 text-emerald-800",
  needs_review_mismatch: "bg-amber-50 text-amber-800",
  needs_review_not_found: "bg-amber-50 text-amber-800",
  needs_review_duplicate: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-[color:var(--danger)]",
  resolved: "bg-[color:var(--sky-soft)] text-[color:var(--navy)]",
};
