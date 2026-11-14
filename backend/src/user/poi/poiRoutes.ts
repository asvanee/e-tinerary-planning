import { Router } from "express";
import { calculatePoi } from "./poiController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

router.post("/trips/:tripId/calculate-poi", requireAuth, calculatePoi);

export default router;