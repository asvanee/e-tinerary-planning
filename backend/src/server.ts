import express from "express";
import cors from "cors";
import authRoutes from "./features/auth/authRoutes";
import placesRoutes from "./features/places/placesRoutes";
import tripRoutes from "./features/trip/tripRoutes";
import categoriesRoutes from "./features/categories/categoriesRoutes";
import poiRoutes from "./features/poi/poiRoutes";
import itineraryRoutes from "./features/itinerary/itineraryRoutes"; // ← เพิ่ม (mount ที่ /api/itinerary — ปรับ path ให้ตรงตำแหน่งไฟล์จริงถ้าไม่ได้อยู่ใน features/itinerary/)
import placeDropdownRoutes from "./features/places/dropdown/placeDropdownRoutes"; // ← เพิ่ม (ปรับ path ให้ตรงตำแหน่งไฟล์จริง)
import { checkDbConnection } from "./config/db";

const PORT = process.env.PORT || 5000;
const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/places", placesRoutes);
app.use("/api/trips", tripRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/poi", poiRoutes);
app.use("/api/itinerary", itineraryRoutes); // ← เพิ่ม (buildDraft: POST /trips/:tripId/draft, confirmItinerary: PUT /trips/:tripId)
app.use("/api/place-dropdown", placeDropdownRoutes); // ← เพิ่ม (แยกจาก /api/places เดิมโดยตั้งใจ — กัน path ชน)

async function startServer() {
  const isConnected = await checkDbConnection();
  if (!isConnected) {
    console.error("ไม่สามารถเริ่ม server ได้ เนื่องจากเชื่อมต่อ database ไม่สำเร็จ");
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

startServer();