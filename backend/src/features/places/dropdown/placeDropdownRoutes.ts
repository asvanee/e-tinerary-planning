import { Router } from "express";
import { getProvinces, getDistricts } from "./placeDropdownController";

const router = Router();

// mount ที่ /api/place-dropdown ใน server.ts
router.get("/provinces", getProvinces);
router.get("/districts", getDistricts);

export default router;
