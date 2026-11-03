import { Router } from "express";
import {
  createTrip,
  getMyTrips,
  getTripById,
  updateTrip,
  updateTripCategories,
  deleteTrip,
} from "./tripController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

// ทุก route ต้อง login · controller กรอง user_id เองเพื่อตรวจเจ้าของ
router.post("/", requireAuth, createTrip);
router.get("/", requireAuth, getMyTrips);
router.get("/:tripId", requireAuth, getTripById);
router.put("/:tripId", requireAuth, updateTrip);
router.put("/:tripId/addcategories", requireAuth, updateTripCategories);
router.delete("/:tripId", requireAuth, deleteTrip);

export default router;
