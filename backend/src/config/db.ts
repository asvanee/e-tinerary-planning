import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// โหลดค่าจาก .env
dotenv.config();

// สร้าง client Supabase
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// client ใช้ครั้งเดียวสำหรับ signUp/signInWithPassword — ห้ามใช้ client หลัก
// เพราะ session จะติดค้างใน memory แล้วทำให้ query ทุก request ใช้ JWT ของผู้ใช้แทน service role (T22)
export function createAuthClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

// เช็คว่าเชื่อมต่อ Supabase สำเร็จหรือไม่
export async function checkDbConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("places")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("❌ เชื่อมต่อ Supabase ไม่สำเร็จ:", error.message);
      return false;
    }

    console.log("✅ เชื่อมต่อ Supabase สำเร็จ");
    return true;
  } catch (err: any) {
    console.error("❌ เชื่อมต่อ Supabase ไม่สำเร็จ:", err.message);
    return false;
  }
}