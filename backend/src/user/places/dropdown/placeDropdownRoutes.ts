import { Router } from "express";
import { getProvinces, getDistricts } from "./placeDropdownController";

const router = Router();

router.get("/provinces", getProvinces);
router.get("/districts", getDistricts);

export default router;
