import express from "express";
import cors from "cors";
import authRoutes from "./features/auth/authRoutes";
import placesRoutes from "./features/places/placesRoutes";
import tripRoutes from "./features/trip/tripRoutes";
import categoriesRoutes from "./features/categories/categoriesRoutes";
import poiRoutes from "./features/poi/poiRoutes";
import itineraryRoutes from "./features/itinerary/itineraryRoutes";
import placeDropdownRoutes from "./features/places/dropdown/placeDropdownRoutes";
import adminRoutes from "./admin/adminRoutes";
import { checkDbConnection } from "./config/db";
import { failStaleJobs } from "./admin/imports/importQueries";

const PORT = process.env.PORT || 5000;
const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/places", placesRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/poi", poiRoutes);
app.use("/api/itinerary", itineraryRoutes);
app.use("/api/place-dropdown", placeDropdownRoutes); // แยกจาก /api/places โดยตั้งใจ — กัน path ชน
app.use("/api/admin", adminRoutes); // Admin Panel (R5, D-24) — ทุก route ผ่าน requireAuth + requireAdmin

async function startServer() {
  const isConnected = await checkDbConnection();
  if (!isConnected) {
    console.error("ไม่สามารถเริ่ม server ได้ เนื่องจากเชื่อมต่อ database ไม่สำเร็จ");
    process.exit(1);
  }

  // job นำเข้าที่ค้าง running จาก process ก่อนหน้าไม่มีใครรันต่อแล้ว → failed (R5 P4)
  try {
    const stale = await failStaleJobs();
    if (stale > 0) console.log(`ตั้งงานนำเข้าที่ค้างอยู่ ${stale} งานเป็น failed`);
  } catch (err) {
    console.error("failStaleJobs error:", err);
  }

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer();