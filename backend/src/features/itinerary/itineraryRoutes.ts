import { Router } from "express";
import {
  buildDraft,
  confirmItinerary,
  getAutoTripPlacesTest,
  getSavedItinerary,
  buildAutoTripController,
} from "./itineraryController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

// 1. สร้างร่างเส้นทาง (ยังไม่บันทึก)
router.post("/trips/:tripId/draft", requireAuth, buildDraft);

// 2. ดึงแผนที่ยืนยันแล้ว (อ่านอย่างเดียว) — ใช้กับหน้า TripDetail
router.get("/trips/:tripId", requireAuth, getSavedItinerary);

// 3. ยืนยันแผน (re-validate ซ้ำฝั่ง backend แล้ว insert ลง itineraries)
router.put("/trips/:tripId", requireAuth, confirmItinerary);

// 4. ทดสอบดึงสถานที่สำหรับ Auto Trip
router.get("/trips/:tripId/auto-places", requireAuth, getAutoTripPlacesTest);

// 5. ✅ เพิ่มใหม่: จัดทริปอัตโนมัติ (Auto Trip Engine)
router.post("/trips/:tripId/auto", requireAuth, buildAutoTripController);

export default router;