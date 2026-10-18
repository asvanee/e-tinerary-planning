import { AttractionRow } from "../attractionTypes";

export type DecisionKind = "merge" | "separate" | "exclude" | "fix_location" | "ok";

// 1 แถวของตาราง admin_place_decisions (ดู docs/DATABASE_SCHEMA.md)
export interface PlaceDecision {
  decision_id: number;
  province: string;
  kind: DecisionKind;
  att_ids: string[];
  primary_att_id: string | null;
  field_sources: Record<string, string> | null; // ชื่อคอลัมน์ CSV → ATT_ID ที่ใช้ค่านั้น (merge)
  lat: number | null;
  lng: number | null;
  note: string | null;
  decided_by: string | null;
  decided_at: string;
}

export type GroupReasonType =
  | "contact_confirmed" // website/phone ตรง + พิกัดใกล้หรือชื่อตรง
  | "contact_unconfirmed" // website/phone ตรงแต่ยืนยันไม่ได้
  | "similar_name" // ชื่อเหมือน/คล้ายกัน
  | "near_points"; // พิกัดห่างกันไม่เกิน 50 m แต่ชื่อต่างกัน

export interface GroupReason {
  type: GroupReasonType;
  attIds: string[];
  detail: string;
}

export type GroupCategory = "likely_duplicate" | "needs_review";

export interface ReviewGroup {
  attIds: string[];
  category: GroupCategory;
  reasons: GroupReason[];
  suggestedPrimaryAttId: string;
  decided: boolean;
  decisionIds: number[];
}

export type RowIssueType =
  | "invalid_location"
  | "outside_thailand"
  | "far_from_province"
  | "junk_name"
  | "missing_name"
  | "status_not_active";

export interface RowIssue {
  type: RowIssueType;
  detail: string;
}

export interface ReviewRow {
  attId: string;
  issues: RowIssue[];
  decision: PlaceDecision | null; // exclude / ok / fix_location ล่าสุดของแถวนี้
}

export interface ProvinceReview {
  province: string;
  summary: {
    rows: number;
    excluded: number;
    likelyDuplicateGroups: number;
    needsReviewGroups: number;
    problemRows: number;
    pending: number; // กลุ่ม + แถวที่ยังไม่ได้ตัดสินใจ
  };
  groups: ReviewGroup[];
  problemRows: ReviewRow[];
  rows: Record<string, AttractionRow>; // เฉพาะแถวที่อยู่ในกลุ่มหรือมีปัญหา
  decisions: PlaceDecision[]; // การตัดสินใจที่ใช้อยู่ (ไม่รวม exclude/ok/fix_location รุ่นเก่าของแถวเดียวกัน)
}
