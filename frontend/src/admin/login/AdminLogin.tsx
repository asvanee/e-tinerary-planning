import { useNavigate } from "react-router-dom";
import { useAuth } from "../../system/auth/useAuth";
import LoginForm from "../../system/auth/LoginForm";
import type { LoginResult } from "../../system/auth/LoginForm";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || "";

  // login สำเร็จแล้วถาม backend ว่าเป็น admin จริงไหม (อ่าน role จาก DB) ก่อนเก็บ session
  // ถ้าไม่ใช่ admin จะ signOut ฝั่ง server และไม่เก็บอะไรไว้ในเครื่อง
  const handleSuccess = async ({ user, session }: LoginResult) => {
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const res = await fetch(`${API_URL}/api/admin/me`, { headers });

    if (res.status === 200) {
      login(user, session);
      navigate("/admin");
      return null;
    }

    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: "POST", headers });
    } catch (error) {
      console.error("Logout error:", error);
    }

    return res.status === 403
      ? "บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ"
      : "ไม่สามารถตรวจสอบสิทธิ์ผู้ดูแลระบบได้ กรุณาลองใหม่";
  };

  return (
    <LoginForm
      title="ผู้ดูแลระบบ"
      subtitle="เข้าสู่ระบบสำหรับผู้ดูแลระบบ"
      onSuccess={handleSuccess}
      footer={
        <p className="text-center text-sm mt-6">
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="font-semibold text-[color:var(--deep)] underline underline-offset-2 hover:text-[color:var(--navy)] transition-colors duration-200 cursor-pointer"
          >
            กลับไปหน้าเข้าสู่ระบบผู้ใช้
          </button>
        </p>
      }
    />
  );
}
