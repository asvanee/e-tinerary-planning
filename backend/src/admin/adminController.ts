import { Response } from "express";
import { AuthRequest } from "../features/auth/authMiddleware";

// GET /api/admin/me — ถ้ามาถึงตรงนี้ได้ แปลว่าผ่าน requireAuth + requireAdmin แล้ว
// frontend ใช้เช็คสิทธิ์ก่อนแสดงหน้า admin (AdminRoute, AdminLogin)
export const getAdminMe = (_req: AuthRequest, res: Response) => {
  res.json({ isAdmin: true });
};
