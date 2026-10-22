import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../system/auth/useAuth";
import LoginForm from "../../../system/auth/LoginForm";
import type { LoginResult } from "../../../system/auth/LoginForm";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Supabase พาผู้ใช้กลับมาหน้านี้หลังยืนยันอีเมล พร้อม session ใน URL hash
  // (#access_token=...&refresh_token=...&type=signup หรือ #error=... เมื่อลิงก์หมดอายุ)
  // frontend login ผ่าน backend ไม่ได้ใช้ token นี้ จึงล้าง hash ทิ้งทันที
  // กัน token ค้างบนแถบ URL และในปุ่ม Back (#26)
  useEffect(() => {
    if (/access_token=|refresh_token=|error=/.test(location.hash)) {
      navigate(location.pathname + location.search, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  const handleSuccess = ({ user, session }: LoginResult) => {
    login(user, session);
    // role ตรงนี้ใช้เลือกหน้าปลายทางเท่านั้น สิทธิ์จริงตรวจที่ backend (requireAdmin) ทุก request
    navigate(user?.role === "admin" ? "/admin" : "/home");
    return null;
  };

  const linkClass =
    "font-semibold text-[color:var(--deep)] underline underline-offset-2 hover:text-[color:var(--navy)] transition-colors duration-200 cursor-pointer";

  return (
    <LoginForm
      title="เข้าสู่ระบบ"
      subtitle="ยินดีต้อนรับกลับมา"
      onSuccess={handleSuccess}
      footer={
        <>
          {/* Register */}
          <p className="text-center text-sm text-[color:var(--muted)] mt-6">
            ยังไม่มีบัญชี?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className={linkClass}
            >
              สมัครสมาชิก
            </button>
          </p>

          {/* Admin login */}
          <p className="text-center text-sm mt-3">
            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="text-[color:var(--muted)] underline underline-offset-2 hover:text-[color:var(--navy)] transition-colors duration-200 cursor-pointer"
            >
              เข้าสู่ระบบสำหรับผู้ดูแลระบบ
            </button>
          </p>
        </>
      }
    />
  );
}
