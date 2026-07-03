import { Router } from "express";
import { createTrip, getMyTrips } from "./tripController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

router.post("/", requireAuth, createTrip);
router.get("/", requireAuth, getMyTrips);

export default router;