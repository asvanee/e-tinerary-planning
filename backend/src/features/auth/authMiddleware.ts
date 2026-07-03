import { Request, Response, NextFunction } from "express";
import { supabase } from "../../config/db";

export interface AuthRequest extends Request {
  user?: { id: string; email?: string };
}

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