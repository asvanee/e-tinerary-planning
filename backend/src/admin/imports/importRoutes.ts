import { Router } from "express";
import { cancelImportJob, getImportItems, getImportJob } from "./importController";

// mount ใต้ adminRoutes (/api/admin/imports) — ผ่าน requireAuth + requireAdmin แล้ว
// endpoint ที่ผูกกับจังหวัด (preview / เริ่มนำเข้า / ประวัติ) อยู่ใน provincesRoutes.ts
const router = Router();

router.get("/:jobId", getImportJob);
router.post("/:jobId/cancel", cancelImportJob);
router.get("/:jobId/items", getImportItems);

export default router;
