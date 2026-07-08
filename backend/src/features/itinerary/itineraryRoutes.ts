import { Router } from "express";
import { buildDraft, confirmItinerary, getSavedItinerary } from "./itineraryController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

// สร้างร่างเส้นทาง (ยังไม่บันทึก)
router.post("/trips/:tripId/draft", requireAuth, buildDraft);

// ✅ เพิ่มใหม่: ดึงแผนที่ยืนยันแล้ว (อ่านอย่างเดียว) — ใช้กับหน้า TripDetail
router.get("/trips/:tripId", requireAuth, getSavedItinerary);

// ยืนยันแผน (re-validate ซ้ำฝั่ง backend แล้ว insert ลง itineraries)
router.put("/trips/:tripId", requireAuth, confirmItinerary);

export default router;