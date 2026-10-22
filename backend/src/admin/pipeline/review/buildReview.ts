import { AttractionRow } from "../attractionTypes";
import { applyLocationOverrides } from "../dedupe/applyRules";
import { dedupeRows, pickRepresentative } from "../dedupe/dedupeRows";
import { coveredPairs, decisionsToRules, eachPair, pairKey } from "./decisionRules";
import { detectRowIssues, distanceMeters, findNearPointGroups, findSimilarNameGroups, provinceCenter, NEAR_POINTS_METERS } from "./detectors";
import { GroupReason, PlaceDecision, ProvinceReview, ReviewGroup, ReviewRow } from "./reviewTypes";

const ROW_DECISION_KINDS = new Set(["exclude", "ok", "fix_location"]);

// การตัดสินใจรายแถวล่าสุดของแต่ละ ATT_ID — เทียบ decided_at (decision_id เป็น uuid เรียงตามเวลาไม่ได้)
// เวลาเท่ากันให้ตัวที่อยู่หลังในรายการชนะ (listDecisions เรียงตาม decided_at)
function latestRowDecisions(decisions: PlaceDecision[]): Map<string, PlaceDecision> {
  const latest = new Map<string, PlaceDecision>();
  for (const d of decisions) {
    if (!ROW_DECISION_KINDS.has(d.kind)) continue;
    const prev = latest.get(d.att_ids[0]);
    if (!prev || Date.parse(d.decided_at) >= Date.parse(prev.decided_at)) latest.set(d.att_ids[0], d);
  }
  return latest;
}

/**
 * การตัดสินใจที่ใช้อยู่จริง — ใช้ร่วมกันระหว่างหน้า review และการนำเข้า (P4) ให้เห็นข้อมูลชุดเดียวกัน
 * - rowDecisions: exclude/ok/fix_location ล่าสุดของแต่ละ ATT_ID
 * - activeDecisions: merge/separate ทั้งหมด + การตัดสินใจรายแถวล่าสุดเท่านั้น (fix_location รุ่นเก่าไม่ถูกใช้)
 * - excluded: ATT_ID ที่ admin สั่งตัดทิ้ง
 */
export function resolveDecisions(decisions: PlaceDecision[]): {
  rowDecisions: Map<string, PlaceDecision>;
  activeDecisions: PlaceDecision[];
  excluded: Set<string>;
} {
  const rowDecisions = latestRowDecisions(decisions);
  const excluded = new Set(
    [...rowDecisions.values()].filter((d) => d.kind === "exclude").map((d) => d.att_ids[0])
  );
  const activeDecisions = decisions.filter(
    (d) => !ROW_DECISION_KINDS.has(d.kind) || rowDecisions.get(d.att_ids[0]) === d
  );
  return { rowDecisions, activeDecisions, excluded };
}

/**
 * วิเคราะห์สถานที่ของจังหวัดหนึ่งสำหรับหน้า review ของ admin (D-26)
 * - ตัดแถวที่ admin สั่ง exclude และใช้พิกัดที่ admin แก้ ก่อนตรวจ
 * - กลุ่มมาจาก 4 ตัวตรวจ (contact ยืนยันได้/ไม่ได้, ชื่อคล้าย, พิกัดใกล้แต่ชื่อต่าง) — 1 กลุ่มต่อ 1 ผลของตัวตรวจ
 * - กลุ่มถือว่า "ตัดสินแล้ว" เมื่อทุกคู่ที่ตัวตรวจจับได้อยู่ใน merge หรือ separate เดียวกัน
 *   (ถ้ามีแถวใหม่เข้ามาในกลุ่ม กลุ่มจะกลับไปรอตัดสินใจเอง)
 */
export function buildProvinceReview(
  province: string,
  allRows: AttractionRow[],
  decisions: PlaceDecision[]
): ProvinceReview {
  const { rowDecisions, activeDecisions, excluded } = resolveDecisions(decisions);
  const rules = decisionsToRules(activeDecisions);
  const rows = applyLocationOverrides(
    allRows.filter((r) => !excluded.has(r.ATT_ID)),
    rules.locationOverrides
  );
  const rowById = new Map(rows.map((r, i) => [r.ATT_ID, { row: r, index: i }]));

  // --- ตัวตรวจกลุ่ม ---
  const reasons: GroupReason[] = [];
  const dedupe = dedupeRows(rows);
  const contactPairs = new Set<string>();
  for (const g of dedupe.mergedGroups) {
    const ids = [g.representativeAttId, ...g.droppedAttIds];
    eachPair(ids, (a, b) => contactPairs.add(pairKey(a, b)));
    reasons.push({
      type: "contact_confirmed",
      attIds: ids,
      detail: `${g.matchedBy.join("/")} ตรงกัน และยืนยันด้วย${g.confirmedBy.includes("location") ? "พิกัดห่างไม่เกิน 500 m" : "ชื่อที่ตรงกัน"}`,
    });
  }
  for (const g of dedupe.reviewGroups) {
    const ids = g.rows.map((r) => r.ATT_ID);
    eachPair(ids, (a, b) => contactPairs.add(pairKey(a, b)));
    reasons.push({
      type: "contact_unconfirmed",
      attIds: ids,
      detail: `${g.matchedBy.join("/")} ตรงกัน แต่พิกัด/ชื่อยืนยันไม่ได้ — อาจเป็น contact ของหน่วยงานกลาง`,
    });
  }
  const sameContact = (a: AttractionRow, b: AttractionRow) => contactPairs.has(pairKey(a.ATT_ID, b.ATT_ID));

  for (const ids of findSimilarNameGroups(rows, sameContact)) {
    const meters = ids.length === 2 ? distanceMeters(rowById.get(ids[0])!.row, rowById.get(ids[1])!.row) : null;
    reasons.push({
      type: "similar_name",
      attIds: ids,
      detail: `ชื่อเหมือนหรือคล้ายกัน${meters !== null ? ` (ห่างกัน ${formatDistance(meters)})` : ""} แต่ไม่มี contact ร่วมกัน`,
    });
  }
  for (const ids of findNearPointGroups(rows, sameContact)) {
    reasons.push({
      type: "near_points",
      attIds: ids,
      detail: `พิกัดห่างกันไม่เกิน ${NEAR_POINTS_METERS} m แต่ชื่อต่างกัน — ตอนนำเข้า Google อาจคืนสถานที่เดียวกัน`,
    });
  }

  // --- 1 กลุ่มต่อ 1 ผลของตัวตรวจ (ไม่รวมข้ามตัวตรวจ — ถ้ารวมจะต่อกันเป็นทอดจนกลุ่มใหญ่เกินตัดสินใจได้
  //     เช่นเชียงใหม่ 91 แถว) แถวเดียวจึงอาจอยู่ได้หลายกลุ่ม ---
  const covered = coveredPairs(activeDecisions);
  const groups: ReviewGroup[] = reasons
    .map((reason) => {
      const attIds = [...reason.attIds].sort((a, b) => rowById.get(a)!.index - rowById.get(b)!.index);
      const decisionIds = new Set<string>();
      let decided = true;
      eachPair(attIds, (a, b) => {
        const ids = covered.get(pairKey(a, b));
        if (ids) ids.forEach((id) => decisionIds.add(id));
        else decided = false;
      });
      return {
        attIds,
        category: reason.type === "contact_confirmed" ? ("likely_duplicate" as const) : ("needs_review" as const),
        reasons: [{ ...reason, attIds }],
        suggestedPrimaryAttId: pickRepresentative(attIds.map((id) => rowById.get(id)!.row)).ATT_ID,
        decided,
        decisionIds: [...decisionIds].sort(),
      };
    })
    .sort((a, b) => rowById.get(a.attIds[0])!.index - rowById.get(b.attIds[0])!.index);

  // --- ปัญหารายแถว (ตรวจจากพิกัดหลังแก้แล้ว · แถวที่ exclude ตรวจจากข้อมูลเดิม) ---
  const center = provinceCenter(allRows);
  const fixedById = new Map(rows.map((r) => [r.ATT_ID, r]));
  const problemRows: ReviewRow[] = [];
  for (const original of allRows) {
    const issues = detectRowIssues(fixedById.get(original.ATT_ID) ?? original, center);
    const decision = rowDecisions.get(original.ATT_ID) ?? null;
    if (issues.length > 0 || decision) problemRows.push({ attId: original.ATT_ID, issues, decision });
  }

  const referenced = new Set<string>([
    ...groups.flatMap((g) => g.attIds),
    ...problemRows.map((r) => r.attId),
  ]);
  const rowsOut: Record<string, AttractionRow> = {};
  for (const r of allRows) if (referenced.has(r.ATT_ID)) rowsOut[r.ATT_ID] = r;

  const pendingRows = problemRows.filter((r) => r.issues.length > 0 && !r.decision).length;
  return {
    province,
    summary: {
      rows: allRows.length,
      excluded: excluded.size,
      likelyDuplicateGroups: groups.filter((g) => g.category === "likely_duplicate").length,
      needsReviewGroups: groups.filter((g) => g.category === "needs_review").length,
      problemRows: problemRows.filter((r) => r.issues.length > 0).length,
      pending: groups.filter((g) => !g.decided).length + pendingRows,
    },
    groups,
    problemRows,
    rows: rowsOut,
    decisions: activeDecisions,
  };
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
