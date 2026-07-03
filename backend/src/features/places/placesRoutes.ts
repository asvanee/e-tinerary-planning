import { Router } from "express";
import { getPlacesByIds } from "./placesController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

// GET /api/places?ids=uuid1,uuid2 - ต้อง login (เหมือน poi)
router.get("/", requireAuth, getPlacesByIds);

export default router;