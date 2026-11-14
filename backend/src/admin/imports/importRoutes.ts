import { Router } from "express";
import { cancelImportJob, getImportItems, getImportJob, resolveImportItem } from "./importController";

// /api/admin/imports — endpoint ที่ผูกกับจังหวัด (preview / เริ่มนำเข้า / ประวัติ) อยู่ใน provincesRoutes.ts
const router = Router();

router.get("/:jobId", getImportJob);
router.post("/:jobId/cancel", cancelImportJob);
router.get("/:jobId/items", getImportItems);
router.post("/items/:itemId/resolve", resolveImportItem);

export default router;
