import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Home, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../system/auth/useAuth";

// โครงหน้าของฝั่ง admin (header ของตัวเอง ไม่ใช้ Navbar ของผู้ใช้)
export default function AdminLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "";
  const { logout, session, user } = useAuth();

  const username = user?.username || "ผู้ดูแลระบบ";

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
    } catch (error) {
      // ต่อให้เรียก server ไม่สำเร็จ ก็ต้องออกจากระบบฝั่งเครื่องได้
      console.error("Logout error:", error);
    } finally {
      logout();
      navigate("/admin/login");
    }
  };

  const btnBase =
    "font-prompt text-sm font-medium min-h-10 min-w-10 px-3 md:px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)]";

  return (
    <div className="font-sarabun min-h-screen bg-[color:var(--cream)]">
      <header className="sticky top-0 z-50 w-full h-16 px-4 sm:px-6 flex items-center justify-between bg-white border-b border-[color:var(--line)]">
        <button
          onClick={() => navigate("/admin")}
          aria-label="ไปหน้าหลักผู้ดูแลระบบ"
          className="flex items-center gap-2 cursor-pointer"
        >
          <img
            src="/images/logo.png"
            alt="E-tinerary Logo"
            className="h-10 w-auto object-contain"
          />
          <span className="flex items-center gap-1.5 font-prompt font-semibold text-lg text-[color:var(--navy)]">
            <ShieldCheck size={20} strokeWidth={1.75} />
            <span className="hidden sm:inline">Admin Panel</span>
          </span>
        </button>

        <div className="flex items-center gap-1 sm:gap-2">
          <span className="hidden md:inline font-prompt text-sm font-medium text-[color:var(--navy)] max-w-40 truncate px-2">
            {username}
          </span>

          <button
            onClick={() => navigate("/home")}
            aria-label="กลับหน้าผู้ใช้"
            className={btnBase}
          >
            <Home size={20} strokeWidth={1.75} />
            <span className="hidden md:inline">กลับหน้าผู้ใช้</span>
          </button>

          <button
            onClick={handleLogout}
            aria-label="ออกจากระบบ"
            className={btnBase}
          >
            <LogOut size={20} strokeWidth={1.75} />
            <span className="hidden md:inline">ออกจากระบบ</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}
