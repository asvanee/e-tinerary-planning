import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CircleCheck, TriangleAlert } from "lucide-react";

export default function EmailConfirmed() {
  const navigate = useNavigate();
  const location = useLocation();

  // จำผลจาก URL hash ไว้ก่อนล้าง: Supabase ใส่ error= มาเมื่อลิงก์หมดอายุหรือถูกใช้ไปแล้ว
  const [isError] = useState(() => /error=/.test(location.hash));

  // token ใน hash ไม่ได้ใช้ (login ผ่าน backend) จึงล้างทิ้งกันค้างบนแถบ URL และปุ่ม Back
  useEffect(() => {
    if (location.hash) {
      navigate(location.pathname + location.search, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  return (
    <div className="font-sarabun min-h-screen flex items-center justify-center px-4 py-6 bg-[color:var(--cream)]">
      <div className="fade-in w-full max-w-md bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-6 sm:px-12 py-8 text-center">
        {isError ? (
          <TriangleAlert
            size={48}
            strokeWidth={1.5}
            className="mx-auto mb-4 text-[color:var(--danger)]"
          />
        ) : (
          <CircleCheck
            size={48}
            strokeWidth={1.5}
            className="mx-auto mb-4 text-[color:var(--success)]"
          />
        )}

        <h2 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)] mb-2">
          {isError ? "ลิงก์ไม่ถูกต้องหรือหมดอายุ" : "ยืนยันอีเมลสำเร็จ"}
        </h2>

        <p className="text-[color:var(--deep)] text-sm leading-relaxed mb-6 pb-6 border-b border-[color:var(--line)]">
          {isError
            ? "ลิงก์ยืนยันอีเมลนี้ใช้ไม่ได้แล้ว ลองเข้าสู่ระบบ หากยังไม่ได้ยืนยันให้สมัครสมาชิกใหม่อีกครั้ง"
            : "บัญชีของคุณพร้อมใช้งานแล้ว เข้าสู่ระบบเพื่อเริ่มวางแผนการท่องเที่ยวได้เลย"}
        </p>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="font-prompt font-medium w-full min-h-12 flex items-center justify-center rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] transition-all duration-200"
        >
          เข้าสู่ระบบ
        </button>

        <button
          type="button"
          onClick={() => navigate("/")}
          className="font-prompt font-medium w-full min-h-12 mt-3 flex items-center justify-center rounded-xl text-[color:var(--navy)] border border-[color:var(--line)] bg-white hover:bg-[color:var(--sky-soft)] active:scale-[0.98] transition-all duration-200"
        >
          กลับไปหน้าหลัก
        </button>
      </div>
    </div>
  );
}
