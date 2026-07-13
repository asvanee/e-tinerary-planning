import { Router } from "express";
import {
  createTrip,
  getMyTrips,
  getTripById,
  updateTrip,
  deleteTrip,
} from "./tripController";
import { requireAuth } from "../auth/authMiddleware";

const router = Router();

router.post("/", requireAuth, createTrip);
router.get("/", requireAuth, getMyTrips);
// ✅ เพิ่มใหม่: ดึงทริปเดี่ยว — ต้องอยู่หลัง GET "/" เสมอ (ตำแหน่งไม่กระทบกันเพราะ pattern
// ต่างกัน แต่เรียงตามลำดับ CRUD ทั่วไปให้อ่านง่าย)
router.get("/:tripId", requireAuth, getTripById);

// ✅ เพิ่มใหม่: แก้ไขทริป — ใช้ตำแหน่งเดียวกับ GET/:tripId และ DELETE/:tripId
// (pattern เดียวกันทั้งไฟล์ ตรวจสิทธิ์ด้วย requireAuth แล้วปล่อยให้ controller เช็ค
// eq("trip_id", ...).eq("user_id", ...) เองอีกชั้น)
router.put("/:tripId", requireAuth, updateTrip);

router.delete("/:tripId", requireAuth, deleteTrip);

export default router;