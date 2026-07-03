import { Router } from "express";
import { getProvinces, getDistricts } from "./placeDropdownController";

const router = Router();

// mount ที่ /api/place-dropdown ใน server.ts -> full paths:
// GET /api/place-dropdown/provinces
// GET /api/place-dropdown/districts
// (ตั้งใจแยกจาก /api/places เดิม เพราะ features/places/placesRoutes.ts
// mount ที่ /api/places อยู่แล้ว — ดู PROJECT_BRIEF หัวข้อ 3.12)
router.get("/provinces", getProvinces);
router.get("/districts", getDistricts);

export default router;