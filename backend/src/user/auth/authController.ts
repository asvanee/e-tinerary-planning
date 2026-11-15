import { Request, Response } from "express";
import { supabase, createAuthClient } from "../../config/db";

// สมัครสมาชิก รับ username, email, password จาก body
// สร้างบัญชีใน Supabase Auth ก่อน แล้วค่อยบันทึกโปรไฟล์ลงตาราง users
export const register = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  try {
    const { data, error } = await createAuthClient().auth.signUp({
      email,
      password,
      options: {
        // ลิงก์ในอีเมลยืนยันจะพาไปหน้านี้ (ตอนนี้ตั้งเป็น localhost)
        emailRedirectTo: "http://localhost:5173/email-confirmed",
        data: { username },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        return res.status(409).json({ message: "อีเมลนี้มีบัญชีอยู่แล้ว" });
      }
      console.error("Register signUp error:", error.message);
      return res.status(400).json({ message: "สมัครสมาชิกไม่สำเร็จ กรุณาตรวจสอบอีเมลและรหัสผ่านอีกครั้ง" });
    }

    // อีเมลซ้ำบางครั้ง Supabase ไม่คืน error แต่ส่ง identities ว่างมาแทน
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return res.status(409).json({ message: "อีเมลนี้มีบัญชีอยู่แล้ว" });
    }

    const { error: insertError } = await supabase.from("users").insert([
      {
        user_id: data.user?.id,
        username,
        email,
        role: "user",
        is_active: true,
        email_verified: false,
        created_at: new Date(),
      },
    ]);

    if (insertError) {
      if (
        insertError.message.includes("duplicate key") ||
        insertError.message.includes("users_email_key") ||
        insertError.code === "23505"
      ) {
        return res.status(409).json({ message: "อีเมลนี้มีบัญชีอยู่แล้ว" });
      }
      console.error("Register insert user error:", insertError.message);
      return res.status(500).json({ message: "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    }

    res.json({
      message: "สมัครสมาชิกสำเร็จ! กรุณายืนยัน email ของคุณก่อนเข้าสู่ระบบ.",
    });
  } catch (err) {
    console.error("Register exception:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในระบบ" });
  }
};

// เข้าสู่ระบบ รับ email, password จาก body · ต้องยืนยันอีเมลแล้ว
// คืนโปรไฟล์จากตาราง users กับ session และบันทึกเวลา login ล่าสุด
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
      }
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return res.status(403).json({ message: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" });
      }
      if (error.message.toLowerCase().includes("too many requests")) {
        return res.status(429).json({ message: "ลองใหม่อีกครั้งในภายหลัง" });
      }
      console.error("Login signIn error:", error.message);
      return res.status(400).json({ message: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
    }
    const user = data.user;

    if (!user?.email_confirmed_at) {
      return res.status(403).json({
        message: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) console.error("Get profile error:", profileError);

    await supabase
      .from("users")
      .update({ last_login: new Date() })
      .eq("user_id", user.id);

    res.json({
      message: "Login สำเร็จ",
      user: profile,
      session: data.session,
    });
  } catch (err) {
    console.error("Login exception:", err);
    res.status(500).json({ message: "เกิดข้อผิดพลาดภายในระบบ" });
  }
};

// ออกจากระบบ รับ token จาก header Authorization แล้วเพิกถอน session นั้น
export const logout = async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    await supabase.auth.admin.signOut(token);
  }
  res.json({ message: "Logout สำเร็จ" });
};
