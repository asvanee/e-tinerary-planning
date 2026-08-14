// เอาไว้เรียกใช้ feature ต่างๆของระบบ
import express from "express";
import cors from "cors";
// Import routes ของแต่ละ feature
// ex. import userRoutes from "./features/users/user.routes";


// Import itinerary routes
import itineraryRoutes from "./features/itinerary/itineraryRoutes";
const app = express();

// ใช้ route ของแต่ละ feature แบบรวมทั้ง feature 
// routes ย่อยของเเต่ละ feature เขียนใน ไฟล์ route ของ feature นั้นๆ
// app.use("/api/users", userRoutes);
app.use("/api/itineraries", itineraryRoutes);
// ตั้งชื่อ route ตามที่ต้องการ เช่น /api/users สำหรับ user feature

app.use(cors());
app.use(express.json());

export default app;
