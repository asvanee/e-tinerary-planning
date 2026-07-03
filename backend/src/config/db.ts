import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// โหลดค่าจาก .env
dotenv.config();

// สร้าง client Supabase
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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