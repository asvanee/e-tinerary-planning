import { Response, NextFunction } from "express";
import { supabase } from "../config/db";
import { AuthRequest } from "../features/auth/authMiddleware";

// ใช้ต่อจาก requireAuth เสมอ — อ่าน role จากตาราง users ทุก request
// ห้ามเชื่อ user.role ที่ frontend เก็บใน localStorage (Known Issue #22)
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ message: "ไม่พบ token กรุณาเข้าสู่ระบบ" });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("role")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error("requireAdmin error:", error);
      return res.status(500).json({ message: "ไม่สามารถตรวจสอบสิทธิ์ได้" });
    }

    if (data?.role !== "admin") {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.status(500).json({ message: "ไม่สามารถตรวจสอบสิทธิ์ได้" });
  }
};
