import { Router } from "express";
import {
  buildDraft,
  confirmItinerary,
  getSavedItinerary,
  getAutoTripPlacesTest,
  buildAutoTripController,
} from "./itineraryController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

// ร่างแผน (ยังไม่บันทึก)
router.post("/trips/:tripId/draft", requireAuth, buildDraft);

// แผนที่ยืนยันแล้ว (หน้ารายละเอียดทริป)
router.get("/trips/:tripId", requireAuth, getSavedItinerary);

// ยืนยันแผน — คำนวณซ้ำฝั่ง backend แล้วบันทึก
router.put("/trips/:tripId", requireAuth, confirmItinerary);

// สถานที่ที่ Auto Trip จะใช้ (เช็คก่อนเปิดหน้า Auto Trip)
router.get("/trips/:tripId/auto-places", requireAuth, getAutoTripPlacesTest);

// จัดแผนอัตโนมัติ
router.post("/trips/:tripId/auto", requireAuth, buildAutoTripController);

export default router;