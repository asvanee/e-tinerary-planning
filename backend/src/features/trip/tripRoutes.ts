import { Router } from "express";
import { createTrip, getMyTrips, getTripById, deleteTrip } from "./tripController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

router.post("/", requireAuth, createTrip);
router.get("/", requireAuth, getMyTrips);
// ✅ เพิ่มใหม่: ดึงทริปเดี่ยว — ต้องอยู่หลัง GET "/" เสมอ (ตำแหน่งไม่กระทบกันเพราะ pattern
// ต่างกัน แต่เรียงตามลำดับ CRUD ทั่วไปให้อ่านง่าย)
router.get("/:tripId", requireAuth, getTripById);

router.delete("/:tripId", requireAuth, deleteTrip);

export default router;