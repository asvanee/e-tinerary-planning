import { AttractionRow } from "../attractionTypes";
import { applyLocationOverrides } from "../dedupe/applyRules";
import { runDedupe } from "../dedupe/runDedupe";
import { resolveDecisions } from "../review/buildReview";
import { decisionsToRules } from "../review/decisionRules";
import { IMPORT_FIELDS } from "./placeRecord";
import { PlaceDecision } from "../review/reviewTypes";

export interface ImportRow {
  attId: string; // ATT_ID ที่บันทึกเป็น places.att_id (แถวหลักของ merge)
  row: AttractionRow; // ค่าที่ใช้นำเข้า (หลังแก้พิกัดและเลือกค่าทีละช่องตามที่ admin ตัดสิน)
  mergedAttIds: string[]; // ATT_ID ทั้งหมดที่รวมเป็นสถานที่นี้ (รวม attId)
}

/**
 * แถวที่จะนำเข้าของจังหวัดหนึ่ง (D-26/D-30): CSV + การตัดสินใจของ admin
 * 1) ใช้การตัดสินใจชุดเดียวกับหน้า review (resolveDecisions) → กฎ dedupe → runDedupe
 * 2) กลุ่มที่ admin สั่ง merge: ใช้ primary_att_id เป็นแถวหลัก และเอาค่าแต่ละช่องจาก field_sources
 *    เฉพาะคอลัมน์ใน IMPORT_FIELDS (D-31 — การตัดสินใจเก่าที่เลือกช่องอื่นไว้ไม่มีผล) ช่องที่ไม่ได้เลือกใช้ค่าของแถวหลัก
 *    แล้วทับด้วยค่าที่ admin พิมพ์เอง (field_values — D-32) · พิกัดที่กรอกเองตอน merge อยู่ใน locationOverrides ของแถวหลักแล้ว
 * ลำดับผลลัพธ์ = ลำดับใน CSV ของแถวตัวแทน
 */
export function prepareImportRows(provinceRows: AttractionRow[], decisions: PlaceDecision[]): ImportRow[] {
  const { activeDecisions } = resolveDecisions(decisions);
  const rules = decisionsToRules(activeDecisions);
  const result = runDedupe(provinceRows, rules);

  // ค่าหลังแก้พิกัด (fix_location / พิกัดที่กรอกตอน merge) ของทุกแถว
  const fixedById = new Map(
    applyLocationOverrides(provinceRows, rules.locationOverrides).map((r) => [r.ATT_ID, r])
  );

  const representativeOf = (attId: string) => result.representativeMap[attId] ?? attId;

  // merge ของ admin ต่อแถวตัวแทน — กลุ่มหนึ่งควรมี merge เดียว ถ้ามีหลายอันใช้อันแรก (เรียงตาม decided_at)
  const mergeByRepresentative = new Map<string, PlaceDecision>();
  for (const d of activeDecisions) {
    if (d.kind !== "merge" || !d.primary_att_id) continue;
    const rep = representativeOf(d.att_ids[0]);
    if (!mergeByRepresentative.has(rep)) mergeByRepresentative.set(rep, d);
  }

  const membersByRepresentative = new Map<string, string[]>();
  for (const [attId, rep] of Object.entries(result.representativeMap)) {
    membersByRepresentative.set(rep, [...(membersByRepresentative.get(rep) ?? []), attId]);
  }

  return result.deduped.map((representative) => {
    const members = membersByRepresentative.get(representative.ATT_ID) ?? [representative.ATT_ID];
    const merge = mergeByRepresentative.get(representative.ATT_ID);
    const primary = merge && fixedById.get(merge.primary_att_id!);

    if (!merge || !primary) {
      return { attId: representative.ATT_ID, row: representative, mergedAttIds: members };
    }

    const row: AttractionRow = { ...primary };
    for (const [column, sourceAttId] of Object.entries(merge.field_sources ?? {})) {
      const source = fixedById.get(sourceAttId);
      if (source && column in source && IMPORT_FIELDS.includes(column)) row[column] = source[column];
    }
    for (const [column, value] of Object.entries(merge.field_values ?? {})) {
      if (IMPORT_FIELDS.includes(column) && column !== "ATT_LOCATION") row[column] = value;
    }
    return { attId: primary.ATT_ID, row, mergedAttIds: members.includes(primary.ATT_ID) ? members : [...members, primary.ATT_ID] };
  });
}
