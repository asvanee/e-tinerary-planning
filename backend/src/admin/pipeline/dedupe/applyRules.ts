import { AttractionRow } from "../attractionTypes";
import { DedupeResult, LocationOverride } from "./dedupeTypes";
import { pickRepresentative } from "./dedupeRows";

/**
 * แทน ATT_LOCATION ของแถวที่ระบุ (key = ATT_ID) ด้วยพิกัดที่คนยืนยันแล้ว — ใช้ก่อน dedupeRows()
 * เพื่อให้การยืนยันด้วยพิกัดใช้ค่าที่ถูกต้องตั้งแต่ต้น · คืน array ใหม่ ไม่แก้ rows เดิม
 */
export function applyLocationOverrides(
  rows: AttractionRow[],
  overrides: Record<string, LocationOverride>
): AttractionRow[] {
  if (Object.keys(overrides).length === 0) return rows;
  return rows.map((row) => {
    const override = overrides[row.ATT_ID];
    return override ? { ...row, ATT_LOCATION: `${override.lat}, ${override.lng}` } : row;
  });
}

/**
 * บังคับ merge กลุ่ม ATT_ID ที่คนยืนยันแล้วว่าเป็นที่เดียวกัน — ใช้หลัง dedupeRows()
 * เพราะบาง id ในกลุ่มอาจถูก auto-merge ไปแล้ว (เช็คตัวแทนปัจจุบันจาก representativeMap)
 * review cluster ที่ทุกแถวอยู่ใน force merge group แล้วจะถูกเอาออก
 */
export function applyForceMerges(result: DedupeResult, forceMergeGroups: string[][]): DedupeResult {
  let deduped = [...result.deduped];
  const representativeMap = { ...result.representativeMap };
  const mergedGroups = [...result.mergedGroups];
  const resolvedIds = new Set<string>();

  for (const group of forceMergeGroups) {
    group.forEach((id) => resolvedIds.add(id));

    const currentReps = [...new Set(group.map((id) => representativeMap[id] ?? id))];
    if (currentReps.length <= 1) continue; // auto-merge รวมให้ครบแล้ว

    const repRows = currentReps
      .map((id) => deduped.find((r) => r.ATT_ID === id))
      .filter((r): r is AttractionRow => !!r);
    if (repRows.length === 0) continue; // ATT_ID ในกฎไม่มีในข้อมูล — ข้ามไป

    const finalRep = pickRepresentative(repRows);
    const droppedIds = currentReps.filter((id) => id !== finalRep.ATT_ID);

    deduped = deduped.filter((r) => !droppedIds.includes(r.ATT_ID));
    for (const originalId of Object.keys(representativeMap)) {
      if (droppedIds.includes(representativeMap[originalId])) {
        representativeMap[originalId] = finalRep.ATT_ID;
      }
    }
    group.forEach((id) => {
      if (!(id in representativeMap)) representativeMap[id] = finalRep.ATT_ID;
    });

    mergedGroups.push({
      representativeAttId: finalRep.ATT_ID,
      droppedAttIds: droppedIds,
      matchedBy: ["manual"],
      confirmedBy: ["manual"],
    });
  }

  const reviewGroups = result.reviewGroups.filter(
    (group) => !group.rows.every((r) => resolvedIds.has(r.ATT_ID))
  );

  return { deduped, mergedGroups, reviewGroups, representativeMap };
}
