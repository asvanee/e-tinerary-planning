import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { errorMessage } from "../utils/errorMessage";

dotenv.config();

// client หลักใช้ service role (ข้าม RLS) — query ข้อมูลผู้ใช้ต้องกรอง user_id เอง
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// client แยกสำหรับ signUp/signInWithPassword — กัน session ผู้ใช้ไปค้างใน client หลัก
export function createAuthClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
}

// เช็คว่าต่อ Supabase ได้ไหม (ใช้ตอนเปิด server)
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
  } catch (err) {
    console.error("❌ เชื่อมต่อ Supabase ไม่สำเร็จ:", errorMessage(err));
    return false;
  }
}