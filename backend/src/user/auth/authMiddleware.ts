import { Request, Response, NextFunction } from "express";
import { supabase } from "../../config/db";

export interface AuthRequest extends Request {
  user?: { id: string; email?: string };
}

// ตรวจ token ใน header Authorization (Bearer) กับ Supabase
// ผ่านแล้วใส่ id/email ของผู้ใช้ไว้ใน req.user แล้วไปต่อ · ไม่ผ่านตอบ 401
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "ไม่พบ token กรุณาเข้าสู่ระบบ" });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ message: "Token ไม่ถูกต้องหรือหมดอายุ" });
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
};