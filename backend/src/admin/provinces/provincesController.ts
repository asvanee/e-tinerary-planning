import { Response } from "express";
import { AuthRequest } from "../../features/auth/authMiddleware";
import { getProvinceRows, listCsvProvinces } from "../pipeline/attractionCsv";
import { AttractionRow } from "../pipeline/attractionTypes";
import { buildProvinceReview } from "../pipeline/review/buildReview";
import { parseGroupDecision, parseRowDecision } from "../pipeline/review/decisionInput";
import { PlaceDecision } from "../pipeline/review/reviewTypes";
import {
  countDecisionsByProvince,
  countImportedByProvince,
  deleteDecisions,
  insertDecisions,
  listDecisions,
} from "./decisionQueries";

const GROUP_KINDS = new Set(["merge", "separate"]);
const ROW_KINDS = new Set(["exclude", "ok", "fix_location"]);

// แถวของจังหวัดจาก CSV (null = ไม่มีจังหวัดนี้ใน CSV)
async function loadProvince(province: unknown): Promise<{ name: string; rows: AttractionRow[] } | null> {
  if (typeof province !== "string" || !province.trim()) return null;
  const rows = await getProvinceRows(province.trim());
  return rows.length > 0 ? { name: province.trim(), rows } : null;
}

async function respondWithReview(res: Response, name: string, rows: AttractionRow[]) {
  const decisions = await listDecisions(name);
  res.json(buildProvinceReview(name, rows, decisions));
}

// GET /api/admin/provinces
export const getProvinces = async (_req: AuthRequest, res: Response) => {
  try {
    const [csvProvinces, imported, decided] = await Promise.all([
      listCsvProvinces(),
      countImportedByProvince(),
      countDecisionsByProvince(),
    ]);
    res.json({
      provinces: csvProvinces.map(({ province, rowCount }) => ({
        province,
        csvRows: rowCount,
        importedPlaces: imported.get(province) ?? 0,
        decisions: decided.get(province) ?? 0,
      })),
    });
  } catch (err) {
    console.error("getProvinces (admin) error:", err);
    res.status(500).json({ message: "ไม่สามารถโหลดรายชื่อจังหวัดได้" });
  }
};

// GET /api/admin/provinces/:province/review
export const getProvinceReview = async (req: AuthRequest, res: Response) => {
  try {
    const province = await loadProvince(req.params.province);
    if (!province) return res.status(404).json({ message: "ไม่พบจังหวัดนี้ในข้อมูลสถานที่" });
    await respondWithReview(res, province.name, province.rows);
  } catch (err) {
    console.error("getProvinceReview error:", err);
    res.status(500).json({ message: "ไม่สามารถวิเคราะห์ข้อมูลจังหวัดนี้ได้" });
  }
};

// การตัดสินใจ merge/separate ที่เป็นของกลุ่มนี้ (สมาชิกทุกตัวอยู่ในกลุ่ม)
// แถวเดียวอยู่ได้หลายกลุ่ม จึงห้ามลบการตัดสินใจของกลุ่มอื่นที่แค่มีสมาชิกซ้อนกัน
function groupDecisionIds(decisions: PlaceDecision[], attIds: string[]): string[] {
  const ids = new Set(attIds);
  return decisions
    .filter((d) => GROUP_KINDS.has(d.kind) && d.att_ids.every((id) => ids.has(id)))
    .map((d) => d.decision_id);
}

// PUT /api/admin/provinces/:province/groups — บันทึก (แทนที่) การตัดสินใจของกลุ่ม
export const putGroupDecision = async (req: AuthRequest, res: Response) => {
  try {
    const province = await loadProvince(req.params.province);
    if (!province) return res.status(404).json({ message: "ไม่พบจังหวัดนี้ในข้อมูลสถานที่" });

    const rowsById = new Map(province.rows.map((r) => [r.ATT_ID, r]));
    const parsed = parseGroupDecision(req.body, province.name, rowsById, req.user!.id);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    // insert ของใหม่ก่อนแล้วค่อยลบของเก่า — ถ้า insert ไม่สำเร็จ การตัดสินใจเดิมยังอยู่
    const previous = groupDecisionIds(await listDecisions(province.name), req.body.attIds);
    await insertDecisions(parsed.value);
    await deleteDecisions(previous);
    await respondWithReview(res, province.name, province.rows);
  } catch (err) {
    console.error("putGroupDecision error:", err);
    res.status(500).json({ message: "ไม่สามารถบันทึกการตัดสินใจได้" });
  }
};

// DELETE /api/admin/provinces/:province/groups — ยกเลิกการตัดสินใจของกลุ่ม (body: { attIds })
export const deleteGroupDecision = async (req: AuthRequest, res: Response) => {
  try {
    const province = await loadProvince(req.params.province);
    if (!province) return res.status(404).json({ message: "ไม่พบจังหวัดนี้ในข้อมูลสถานที่" });
    const attIds: unknown = req.body?.attIds;
    if (!Array.isArray(attIds) || attIds.length === 0 || !attIds.every((id) => typeof id === "string")) {
      return res.status(400).json({ message: "กรุณาระบุสถานที่ในกลุ่ม" });
    }

    await deleteDecisions(groupDecisionIds(await listDecisions(province.name), attIds));
    await respondWithReview(res, province.name, province.rows);
  } catch (err) {
    console.error("deleteGroupDecision error:", err);
    res.status(500).json({ message: "ไม่สามารถยกเลิกการตัดสินใจได้" });
  }
};

function rowDecisionIds(decisions: PlaceDecision[], attId: string): string[] {
  return decisions.filter((d) => ROW_KINDS.has(d.kind) && d.att_ids[0] === attId).map((d) => d.decision_id);
}

// PUT /api/admin/provinces/:province/rows/:attId — ตัดทิ้ง / แก้พิกัด / ปกติ
export const putRowDecision = async (req: AuthRequest, res: Response) => {
  try {
    const province = await loadProvince(req.params.province);
    if (!province) return res.status(404).json({ message: "ไม่พบจังหวัดนี้ในข้อมูลสถานที่" });
    const attId = req.params.attId;
    if (!attId || Array.isArray(attId)) return res.status(400).json({ message: "ไม่พบรหัสสถานที่" });

    const rowsById = new Map(province.rows.map((r) => [r.ATT_ID, r]));
    const parsed = parseRowDecision(req.body, province.name, attId, rowsById, req.user!.id);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    const previous = rowDecisionIds(await listDecisions(province.name), attId);
    await insertDecisions([parsed.value]);
    await deleteDecisions(previous);
    await respondWithReview(res, province.name, province.rows);
  } catch (err) {
    console.error("putRowDecision error:", err);
    res.status(500).json({ message: "ไม่สามารถบันทึกการตัดสินใจได้" });
  }
};

// DELETE /api/admin/provinces/:province/rows/:attId
export const deleteRowDecision = async (req: AuthRequest, res: Response) => {
  try {
    const province = await loadProvince(req.params.province);
    if (!province) return res.status(404).json({ message: "ไม่พบจังหวัดนี้ในข้อมูลสถานที่" });
    const attId = req.params.attId;
    if (!attId || Array.isArray(attId)) return res.status(400).json({ message: "ไม่พบรหัสสถานที่" });

    await deleteDecisions(rowDecisionIds(await listDecisions(province.name), attId));
    await respondWithReview(res, province.name, province.rows);
  } catch (err) {
    console.error("deleteRowDecision error:", err);
    res.status(500).json({ message: "ไม่สามารถยกเลิกการตัดสินใจได้" });
  }
};
