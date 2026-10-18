import { AttractionRow } from "../attractionTypes";

// เบอร์โทร: เก็บแค่ตัวเลข ต้องยาวอย่างน้อย 9 หลักถึงจะใช้จับคู่ได้
export function normalizePhone(value?: string): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  return digits.length >= 9 ? digits : null;
}

// เว็บไซต์: เหลือแค่ hostname ตัด www. ออก
export function normalizeWebsite(value?: string): string | null {
  if (!value) return null;
  try {
    const url = value.trim().toLowerCase();
    const withProtocol = url.startsWith("http") ? url : `https://${url}`;
    const { hostname } = new URL(withProtocol);
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// decode HTML numeric entity ที่หลุดมาใน CSV เช่น &#8217; (apostrophe)
function decodeHtmlEntities(value: string): string {
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// ตัดทุกอย่างที่ไม่ใช่ตัวอักษร/ตัวเลข (รองรับ unicode รวมภาษาไทย) แล้วทำเป็นตัวพิมพ์เล็ก
export function normalizeName(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

// ยอมให้ชื่อ "ตรงกัน" แค่ 2 เคส: normalize แล้วเหมือนกันเป๊ะ หรือชื่อหนึ่งครอบอีกชื่อและยาวต่างกันไม่เกิน 6
// ไม่ใช้ fuzzy edit-distance เพราะชื่อไทยที่ขึ้นต้นเหมือนกัน (หาด.../ถ้ำ.../วัด...) ได้ similarity สูงลวงตา
const NAME_CONTAINMENT_MAX_LENGTH_DIFF = 6;

export function namesStrictlyMatch(nameA: string, nameB: string): boolean {
  const a = normalizeName(nameA);
  const b = normalizeName(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) {
    return Math.abs(a.length - b.length) <= NAME_CONTAINMENT_MAX_LENGTH_DIFF;
  }
  return false;
}

// "lat, lng" → พิกัด หรือ null ถ้าพัง (short link, ค่าขยะ)
export function parseCoords(row: AttractionRow): { lat: number; lng: number } | null {
  const parts = (row.ATT_LOCATION || "").split(",").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function displayName(row: AttractionRow): string {
  return row.ATT_NAME_TH || row.ATT_NAME_EN || row.ATT_ID;
}

// record ทดสอบ/ขยะ (เช่น "ทดสอบอัพเดทผ่าน API. 17:51") ห้ามถูกเลือกเป็นตัวแทนกลุ่ม
// ไม่งั้นสถานที่จริงที่ถูก merge เข้าไปจะหายเงียบ (เจอที่เชียงใหม่: record ทดสอบแทนที่ "ผาช่อ")
const JUNK_NAME_PATTERN = /ทดสอบ|test\b|api\b/i;

export function isJunkName(row: AttractionRow): boolean {
  return JUNK_NAME_PATTERN.test(displayName(row));
}
