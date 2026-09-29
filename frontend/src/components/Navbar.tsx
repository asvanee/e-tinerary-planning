import { useNavigate, useLocation } from "react-router-dom";
import { Home, FolderOpen, Plane, LogOut } from "lucide-react";
import { useAuth } from "../features/auth/hooks/useAuth";

export default function Navbar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const API_URL = import.meta.env.VITE_API_URL || "";
  const { logout, session, user } = useAuth();

  const username = user?.username || "ผู้ใช้";

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
      logout(); // clear context
      navigate("/");
    }
  };

  const btnBase =
    "font-prompt text-sm font-medium min-h-10 min-w-10 px-3 md:px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]";
  const btnGhost =
    "text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)]";
  const btnActive = "bg-[color:var(--sky-soft)]";
  const btnPrimary =
    "text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)]";

  return (
    <nav className="font-sarabun sticky top-0 z-50 w-full h-16 px-4 sm:px-6 flex items-center justify-between bg-white border-b border-[color:var(--line)]">
      {/* Logo */}
      <button
        onClick={() => navigate("/home")}
        aria-label="ไปหน้าหลัก"
        className="flex items-center gap-2 cursor-pointer"
      >
        <img
          src="/images/logo.png"
          alt="E-tinerary Logo"
          className="h-10 w-auto object-contain"
        />
        <span className="hidden sm:inline font-prompt font-semibold text-lg text-[color:var(--navy)]">
          E-tinerary
        </span>
      </button>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Home */}
        <button
          onClick={() => navigate("/home")}
          aria-label="หน้าหลัก"
          className={`${btnBase} ${btnGhost} ${pathname === "/home" ? btnActive : ""
            }`}
        >
          <Home size={20} strokeWidth={1.75} />
          <span className="hidden md:inline">หน้าหลัก</span>
        </button>
        {/* My trips */}
        <button
          onClick={() => navigate("/trips")}
          aria-label="ทริปของฉัน"
          className={`${btnBase} ${btnGhost} ${pathname === "/trips" ? btnActive : ""}`}
        >
          <FolderOpen size={20} strokeWidth={1.75} />
          <span className="hidden md:inline">ทริปของฉัน</span>
        </button>

        {/* Create trip */}
        <button
          onClick={() => navigate("/trip/create")}
          aria-label="สร้างทริป"
          className={`${btnBase} ${btnPrimary}`}
        >
          <Plane size={20} strokeWidth={1.75} />
          <span className="hidden md:inline">สร้างทริป</span>
        </button>

        {/* User */}
        <div
          className="flex items-center gap-2 pl-2 ml-1 sm:ml-2 border-l border-[color:var(--line)]"
          title={username}
        >
          <span className="w-9 h-9 rounded-full flex items-center justify-center bg-[color:var(--sky-soft)] text-[color:var(--navy)] font-prompt font-semibold text-sm">
            {username.charAt(0).toUpperCase()}
          </span>
          <span className="hidden lg:inline font-prompt text-sm font-medium text-[color:var(--navy)] max-w-32 truncate">
            {username}
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          aria-label="ออกจากระบบ"
          className={`${btnBase} ${btnGhost}`}
        >
          <LogOut size={20} strokeWidth={1.75} />
          <span className="hidden md:inline">ออกจากระบบ</span>
        </button>
      </div>
    </nav>
  );
}