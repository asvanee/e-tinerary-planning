// type ของ response จาก backend/src/admin/pipeline/review/reviewTypes.ts (แก้ฝั่งหนึ่งต้องแก้อีกฝั่งด้วย)

export type AttractionRow = Record<string, string>;

export type DecisionKind = "merge" | "separate" | "exclude" | "fix_location" | "ok";

export interface PlaceDecision {
  decision_id: string; // uuid
  province: string;
  kind: DecisionKind;
  att_ids: string[];
  primary_att_id: string | null;
  field_sources: Record<string, string> | null;
  field_values: Record<string, string> | null; // ค่าที่ admin พิมพ์เองตอน merge (D-32)
  lat: number | null;
  lng: number | null;
  note: string | null;
  decided_by: string | null;
  decided_at: string;
}

export type GroupReasonType = "contact_confirmed" | "contact_unconfirmed" | "similar_name" | "near_points";

export interface ReviewGroup {
  attIds: string[];
  category: "likely_duplicate" | "needs_review";
  reasons: { type: GroupReasonType; attIds: string[]; detail: string }[];
  suggestedPrimaryAttId: string;
  decided: boolean;
  decisionIds: string[];
}

export type RowIssueType =
  | "invalid_location"
  | "outside_thailand"
  | "far_from_province"
  | "junk_name"
  | "missing_name"
  | "status_not_active";

export interface ReviewRow {
  attId: string;
  issues: { type: RowIssueType; detail: string }[];
  decision: PlaceDecision | null;
}

export interface ProvinceReview {
  province: string;
  summary: {
    rows: number;
    excluded: number;
    likelyDuplicateGroups: number;
    needsReviewGroups: number;
    problemRows: number;
    pending: number;
  };
  groups: ReviewGroup[];
  problemRows: ReviewRow[];
  rows: Record<string, AttractionRow>;
  decisions: PlaceDecision[];
}

export interface ProvinceSummary {
  province: string;
  csvRows: number;
  importedPlaces: number;
  decisions: number;
}

// body ของ PUT /provinces/:province/groups
export interface MergeSetInput {
  attIds: string[];
  primaryAttId: string;
  fieldSources?: Record<string, string>;
  fieldValues?: Record<string, string>; // ช่องที่พิมพ์เอง (ห้ามซ้ำกับ fieldSources · พิกัดใช้ lat/lng)
  lat?: number;
  lng?: number;
}
export interface GroupDecisionInput {
  attIds: string[];
  sets: MergeSetInput[];
  note?: string;
}

// body ของ PUT /provinces/:province/rows/:attId
export interface RowDecisionInput {
  kind: "exclude" | "ok" | "fix_location";
  lat?: number;
  lng?: number;
  note?: string;
}
