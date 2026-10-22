import type { AttractionRow, GroupReasonType, RowIssueType } from "./reviewTypes";

// ช่องที่แสดงเสมอในการ์ด (ช่องอื่นใน MERGE_FIELDS แสดงเมื่อค่าไม่ตรงกัน)
export const KEY_FIELDS = [
  "ATT_NAME_TH",
  "ATT_NAME_EN",
  "ATT_LOCATION",
  "ATT_TEL",
  "ATT_WEBSITE",
  "DISTRICT_NAME_TH",
  "ATT_TYPE_LABEL",
  "ATT_STATUS",
];

// ช่องที่ merge เลือกค่าได้ = ช่องที่ใช้ตอนนำเข้าจริง (D-31)
// ⚠️ ต้องตรงกับ backend admin/pipeline/import/placeRecord.ts::IMPORT_FIELDS (backend ตรวจซ้ำ)
export const MERGE_FIELDS = [
  "ATT_NAME_TH",
  "ATT_NAME_EN",
  "ATT_LOCATION",
  "ATT_TEL",
  "ATT_WEBSITE",
  "ATT_ADDRESS",
  "ATT_ADDRESS_ALLEY",
  "ATT_ADDRESS_ROAD",
  "SUBDISTRICT_NAME_TH",
  "DISTRICT_NAME_TH",
  "ATT_POSTCODE",
  "ATT_TYPE_LABEL",
  "ATT_CATEGORY_LABEL",
  "ATT_DETAIL_TH",
  "ATT_FACEBOOK",
  "ATT_INSTAGRAM",
  "ATT_TIKTOK",
  "ATT_YOUTUBE",
  "ATT_LINE",
];

const FIELD_LABELS: Record<string, string> = {
  ATT_NAME_TH: "ชื่อ (ไทย)",
  ATT_NAME_EN: "ชื่อ (อังกฤษ)",
  ATT_LOCATION: "พิกัด",
  ATT_TEL: "เบอร์โทร",
  ATT_WEBSITE: "เว็บไซต์",
  ATT_FACEBOOK: "Facebook",
  ATT_INSTAGRAM: "Instagram",
  ATT_TIKTOK: "TikTok",
  ATT_YOUTUBE: "YouTube",
  ATT_LINE: "LINE",
  ATT_EMAIL: "อีเมล",
  ATT_ADDRESS: "ที่อยู่",
  ATT_ADDRESS_ALLEY: "ซอย",
  ATT_ADDRESS_ROAD: "ถนน",
  SUBDISTRICT_NAME_TH: "ตำบล",
  DISTRICT_NAME_TH: "อำเภอ",
  ATT_POSTCODE: "รหัสไปรษณีย์",
  ATT_TYPE_LABEL: "ประเภท",
  ATT_CATEGORY_LABEL: "หมวด",
  ATT_START_END: "เวลาเปิด-ปิด",
  ATT_DETAIL_TH: "รายละเอียด",
  ATT_FEE_TH: "ค่าเข้า",
  ATT_STATUS: "สถานะ ททท.",
  ATT_STATUS_REMARK: "หมายเหตุสถานะ",
  ATT_UPDATED_DATE: "อัปเดตล่าสุด",
};

export const fieldLabel = (column: string) => FIELD_LABELS[column] ?? column;

export function displayName(row: AttractionRow | undefined): string {
  if (!row) return "(ไม่พบข้อมูล)";
  return row.ATT_NAME_TH?.trim() || row.ATT_NAME_EN?.trim() || row.ATT_ID;
}

export function parseLatLng(value: string | undefined): { lat: number; lng: number } | null {
  const parts = (value ?? "").split(",").map((p) => p.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// ลิงก์เปิดตำแหน่งใน Google Maps — ถ้าพิกัดพังแต่เป็นลิงก์ Google Maps (short link) ใช้ลิงก์นั้นตรงๆ
const GOOGLE_MAPS_LINK = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)\//i;
export function mapsUrl(row: AttractionRow | undefined): string | null {
  const coords = parseLatLng(row?.ATT_LOCATION);
  if (coords) return `https://www.google.com/maps?q=${coords.lat},${coords.lng}`;
  const raw = row?.ATT_LOCATION?.trim() ?? "";
  return GOOGLE_MAPS_LINK.test(raw) ? raw : null;
}

export const REASON_LABELS: Record<GroupReasonType, string> = {
  contact_confirmed: "contact ตรง + ยืนยันได้",
  contact_unconfirmed: "contact ตรง แต่ยืนยันไม่ได้",
  similar_name: "ชื่อคล้ายกัน",
  near_points: "พิกัดใกล้กันมาก",
};

export const ISSUE_LABELS: Record<RowIssueType, string> = {
  invalid_location: "พิกัดใช้ไม่ได้",
  outside_thailand: "พิกัดอยู่นอกประเทศไทย",
  far_from_province: "พิกัดห่างจากจังหวัดผิดปกติ",
  junk_name: "ชื่อดูเป็นข้อมูลทดสอบ",
  missing_name: "ไม่มีชื่อ",
  status_not_active: "สถานะใน ททท. ไม่ปกติ",
};
