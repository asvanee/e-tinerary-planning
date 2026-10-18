import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "../system/auth/useAuth";

type AdminCheck = "checking" | "ok" | "unauthorized" | "forbidden" | "error";

// ครอบหน้า admin ทุกหน้า — ถาม backend (GET /api/admin/me) ทุกครั้งที่เข้า
// ไม่ใช้ user.role จาก localStorage ตัดสินสิทธิ์ (Known Issue #22)
export default function AdminRoute({ children }: { children: ReactNode }) {
  const { session, isLoading, logout } = useAuth();
  const [check, setCheck] = useState<AdminCheck>("checking");
  const [retryKey, setRetryKey] = useState(0);
  const API_URL = import.meta.env.VITE_API_URL || "";
  const token: string | undefined = session?.access_token;

  useEffect(() => {
    if (!token) return;
    let ignore = false;

    fetch(`${API_URL}/api/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (ignore) return;
        if (res.status === 200) setCheck("ok");
        else if (res.status === 401) setCheck("unauthorized");
        else if (res.status === 403) setCheck("forbidden");
        else setCheck("error");
      })
      .catch((error) => {
        console.error("Admin check error:", error);
        if (!ignore) setCheck("error");
      });

    return () => {
      ignore = true;
    };
  }, [API_URL, token, retryKey]);

  // token หมดอายุหรือใช้ไม่ได้ → ล้าง session ในเครื่องแล้วให้ login ใหม่
  useEffect(() => {
    if (check === "unauthorized") logout();
  }, [check, logout]);

  if (isLoading) return null;
  if (!token || check === "unauthorized") return <Navigate to="/admin/login" replace />;
  if (check === "forbidden") return <Navigate to="/home" replace />;

  if (check === "error") {
    return (
      <div className="font-sarabun min-h-screen flex flex-col items-center justify-center gap-4 px-4 bg-[color:var(--cream)]">
        <p role="alert" className="flex items-center gap-2 text-[color:var(--danger)] font-prompt font-medium">
          <TriangleAlert size={20} strokeWidth={1.75} />
          ไม่สามารถตรวจสอบสิทธิ์ผู้ดูแลระบบได้
        </p>
        <button
          type="button"
          onClick={() => {
            setCheck("checking");
            setRetryKey((k) => k + 1);
          }}
          className="font-prompt text-sm font-medium min-h-10 px-4 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] transition-all duration-200"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  if (check === "checking") {
    return (
      <div className="font-sarabun min-h-screen flex items-center justify-center gap-2 bg-[color:var(--cream)] text-[color:var(--navy)] font-prompt">
        <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  return <>{children}</>;
}
