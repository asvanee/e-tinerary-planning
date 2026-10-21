import { AttractionRow } from "../attractionTypes";
import { IMPORT_FIELDS } from "../import/placeRecord";
import { isInThailand } from "./detectors";
import { DecisionKind } from "./reviewTypes";

// แถวที่จะ insert ลง admin_place_decisions (decision_id / decided_at ให้ DB สร้าง)
export interface NewDecision {
  province: string;
  kind: DecisionKind;
  att_ids: string[];
  primary_att_id: string | null;
  field_sources: Record<string, string> | null;
  field_values: Record<string, string> | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  decided_by: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const MAX_FIELD_VALUE_LENGTH = 1000;

function readNote(v: unknown): Result<string | null> {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || v.length > 1000) return fail("หมายเหตุต้องเป็นข้อความไม่เกิน 1000 ตัวอักษร");
  return { ok: true, value: v.trim() || null };
}

// พิกัดต้องส่งมาคู่กัน และอยู่ในประเทศไทย
function readCoords(lat: unknown, lng: unknown, required: boolean): Result<{ lat: number; lng: number } | null> {
  if ((lat === undefined || lat === null) && (lng === undefined || lng === null)) {
    return required ? fail("กรุณาระบุพิกัด lat และ lng") : { ok: true, value: null };
  }
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fail("พิกัดต้องเป็นตัวเลขทั้ง lat และ lng");
  }
  if (!isInThailand({ lat, lng })) return fail("พิกัดต้องอยู่ในประเทศไทย");
  return { ok: true, value: { lat, lng } };
}

/**
 * การตัดสินใจของ 1 กลุ่มในหน้า review:
 *   { attIds: ทุกแถวในกลุ่ม, sets: [{ attIds, primaryAttId, fieldSources, lat?, lng? }], note? }
 * แต่ละ set = สถานที่จริง 1 ที่ที่รวม ≥ 2 แถว · แถวที่ไม่อยู่ใน set ใดถือว่าเป็นสถานที่แยก
 * ผลลัพธ์: merge 1 แถวต่อ set + separate 1 แถว (ทั้งกลุ่ม) ถ้ามีมากกว่า 1 สถานที่
 */
export function parseGroupDecision(
  body: unknown,
  province: string,
  provinceRows: Map<string, AttractionRow>,
  userId: string
): Result<NewDecision[]> {
  if (!isRecord(body)) return fail("รูปแบบข้อมูลไม่ถูกต้อง");
  const { attIds, sets } = body;
  if (!isStringArray(attIds) || attIds.length < 2) return fail("กลุ่มต้องมีอย่างน้อย 2 สถานที่");
  if (new Set(attIds).size !== attIds.length) return fail("ATT_ID ในกลุ่มซ้ำกัน");
  if (attIds.some((id) => !provinceRows.has(id))) return fail("มีสถานที่ที่ไม่อยู่ในจังหวัดนี้");
  if (!Array.isArray(sets)) return fail("รูปแบบข้อมูลไม่ถูกต้อง");
  const note = readNote(body.note);
  if (!note.ok) return note;

  const group = new Set(attIds);
  const used = new Set<string>();
  const decisions: NewDecision[] = [];

  for (const set of sets) {
    if (!isRecord(set) || !isStringArray(set.attIds) || set.attIds.length < 2) {
      return fail("การรวมแต่ละครั้งต้องมีอย่างน้อย 2 สถานที่");
    }
    if (set.attIds.some((id) => !group.has(id) || used.has(id))) {
      return fail("สถานที่ที่รวมต้องอยู่ในกลุ่มนี้ และรวมได้ครั้งเดียว");
    }
    set.attIds.forEach((id) => used.add(id));
    if (typeof set.primaryAttId !== "string" || !set.attIds.includes(set.primaryAttId)) {
      return fail("กรุณาเลือกแถวหลักจากสถานที่ที่รวม");
    }

    // เลือกได้เฉพาะคอลัมน์ที่ใช้ตอนนำเข้า (D-31) · คอลัมน์ที่ไม่ส่งมาใช้ค่าของแถวหลัก
    const fieldSources: Record<string, string> = {};
    if (set.fieldSources !== undefined) {
      if (!isRecord(set.fieldSources)) return fail("รูปแบบการเลือกข้อมูลไม่ถูกต้อง");
      const columns = provinceRows.get(set.primaryAttId)!;
      for (const [column, source] of Object.entries(set.fieldSources)) {
        if (!(column in columns) || column === "ATT_ID") return fail(`ไม่รู้จักช่องข้อมูล ${column}`);
        if (!IMPORT_FIELDS.includes(column)) return fail(`ช่อง ${column} ไม่ได้ใช้ตอนนำเข้า เลือกค่าไม่ได้`);
        if (typeof source !== "string" || !set.attIds.includes(source)) {
          return fail(`ช่อง ${column} ต้องเลือกจากสถานที่ที่รวม`);
        }
        if (source !== set.primaryAttId) fieldSources[column] = source;
      }
    }

    // ค่าที่พิมพ์เอง (D-32) — ช่องที่นำเข้าเท่านั้น ยกเว้นพิกัด (ใช้ lat/lng) · ค่าว่าง = ล้างช่องนั้น
    const fieldValues: Record<string, string> = {};
    if (set.fieldValues !== undefined) {
      if (!isRecord(set.fieldValues)) return fail("รูปแบบค่าที่พิมพ์เองไม่ถูกต้อง");
      for (const [column, value] of Object.entries(set.fieldValues)) {
        if (!IMPORT_FIELDS.includes(column) || column === "ATT_LOCATION") {
          return fail(`ช่อง ${column} พิมพ์ค่าเองไม่ได้`);
        }
        if (typeof value !== "string" || value.length > MAX_FIELD_VALUE_LENGTH) {
          return fail(`ค่าที่พิมพ์ในช่อง ${column} ต้องเป็นข้อความไม่เกิน ${MAX_FIELD_VALUE_LENGTH} ตัวอักษร`);
        }
        if (column in fieldSources) return fail(`ช่อง ${column} เลือกจากแถวอื่นหรือพิมพ์เองได้อย่างใดอย่างหนึ่ง`);
        fieldValues[column] = value.trim();
      }
    }

    const coords = readCoords(set.lat, set.lng, false);
    if (!coords.ok) return coords;
    if (coords.value && fieldSources.ATT_LOCATION) {
      return fail("เลือกพิกัดจากแถวอื่นหรือกรอกพิกัดเองได้อย่างใดอย่างหนึ่ง");
    }

    decisions.push({
      province,
      kind: "merge",
      att_ids: [...set.attIds],
      primary_att_id: set.primaryAttId,
      field_sources: Object.keys(fieldSources).length > 0 ? fieldSources : null,
      field_values: Object.keys(fieldValues).length > 0 ? fieldValues : null,
      lat: coords.value?.lat ?? null,
      lng: coords.value?.lng ?? null,
      note: note.value,
      decided_by: userId,
    });
  }

  const places = sets.length + attIds.filter((id) => !used.has(id)).length;
  if (places > 1) {
    decisions.push({
      province,
      kind: "separate",
      att_ids: [...attIds],
      primary_att_id: null,
      field_sources: null,
      field_values: null,
      lat: null,
      lng: null,
      note: note.value,
      decided_by: userId,
    });
  }
  return { ok: true, value: decisions };
}

/** การตัดสินใจรายแถว: { kind: "exclude" | "ok" | "fix_location", lat?, lng?, note? } */
export function parseRowDecision(
  body: unknown,
  province: string,
  attId: string,
  provinceRows: Map<string, AttractionRow>,
  userId: string
): Result<NewDecision> {
  if (!provinceRows.has(attId)) return fail("ไม่พบสถานที่นี้ในจังหวัดที่เลือก");
  if (!isRecord(body)) return fail("รูปแบบข้อมูลไม่ถูกต้อง");
  const { kind } = body;
  if (kind !== "exclude" && kind !== "ok" && kind !== "fix_location") return fail("ประเภทการตัดสินใจไม่ถูกต้อง");
  const note = readNote(body.note);
  if (!note.ok) return note;
  const coords = readCoords(body.lat, body.lng, kind === "fix_location");
  if (!coords.ok) return coords;
  if (kind !== "fix_location" && coords.value) return fail("ระบุพิกัดได้เฉพาะตอนแก้พิกัด");

  return {
    ok: true,
    value: {
      province,
      kind,
      att_ids: [attId],
      primary_att_id: null,
      field_sources: null,
      field_values: null,
      lat: coords.value?.lat ?? null,
      lng: coords.value?.lng ?? null,
      note: note.value,
      decided_by: userId,
    },
  };
}
