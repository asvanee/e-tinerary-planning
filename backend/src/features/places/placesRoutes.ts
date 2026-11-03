import { Router } from "express";
import { getPlacesByIds } from "./placesController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

router.get("/", requireAuth, getPlacesByIds);

export default router;