import { Request, Response } from "express";
import { supabase, createAuthClient } from "../../config/db";

// Register
export const register = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  try {
    // 1️⃣ สร้าง user ใน Supabase Auth ก่อน
    const { data, error } = await createAuthClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: "http://localhost:5173/login",
        data: { username },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        return res.status(409).json({ message: "อีเมลนี้มีบัญชีอยู่แล้ว" });
      }
      return res.status(400).json({ message: error.message });
    }

    // Supabase บางครั้งไม่ return error แต่ส่ง identities: [] แทน
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return res.status(409).json({ message: "อีเมลนี้มีบัญชีอยู่แล้ว" });
    }

    // 2️⃣ บันทึก profile ลง users table หลังจาก Auth สำเร็จแล้วเท่านั้น
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
      return res.status(500).json({ message: insertError.message });
    }

    res.json({
      message: "สมัครสมาชิกสำเร็จ! กรุณายืนยัน email ของคุณก่อนเข้าสู่ระบบ.",
    });
  } catch (err) {
    res.status(500).json({ message: (err as { message?: string } | null)?.message });
  }
};


// Login
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // Supabase Auth login
    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // แปล Supabase error เป็นภาษาไทย
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        return res.status(400).json({ message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
      }
      if (error.message.toLowerCase().includes("email not confirmed")) {
        return res.status(403).json({ message: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ" });
      }
      if (error.message.toLowerCase().includes("too many requests")) {
        return res.status(429).json({ message: "ลองใหม่อีกครั้งในภายหลัง" });
      }
      return res.status(400).json({ message: error.message });
    }
    const user = data.user;

    // ตรวจสอบ email_verified
    if (!user?.email_confirmed_at) {
      return res.status(403).json({
        message: "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ",
      });
    }

    // ดึง profile จากตาราง users มาส่งกลับ (ไม่ upsert)
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profileError) console.log("Get profile error:", profileError);

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
    res.status(500).json({ message: (err as { message?: string } | null)?.message });
  }
};
export const logout = async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    await supabase.auth.admin.signOut(token); // บอก Supabase ว่า signOut
  }
  res.json({ message: "Logout สำเร็จ" });
};
