import { Router } from "express";
import {
  deleteGroupDecision,
  deleteRowDecision,
  getProvinceReview,
  getProvinces,
  putGroupDecision,
  putRowDecision,
} from "./provincesController";
import { getImportPreview, getPendingImports, getProvinceImports, startImport } from "../imports/importController";

// mount ใต้ adminRoutes (/api/admin/provinces) — ผ่าน requireAuth + requireAdmin แล้ว
const router = Router();

router.get("/", getProvinces);
router.get("/:province/review", getProvinceReview);
router.put("/:province/groups", putGroupDecision);
router.delete("/:province/groups", deleteGroupDecision);
router.put("/:province/rows/:attId", putRowDecision);
router.delete("/:province/rows/:attId", deleteRowDecision);

// นำเข้า (R5 P4)
router.get("/:province/import/preview", getImportPreview);
router.post("/:province/import", startImport);
router.get("/:province/imports", getProvinceImports);
router.get("/:province/import/pending", getPendingImports);

export default router;
