import { useNavigate } from "react-router-dom";
import { useAuth } from "../features/auth/hooks/useAuth";
import "./navbar.css";

export default function Navbar() {
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "";
  const { logout, session, user } = useAuth(); // ดึง user จาก useAuth เลย

  const username = user?.username || "ผู้ใช้"; // fallback เผื่อยังไม่มีค่า

  const handleLogout = async () => {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    });
    logout(); // clear context
    navigate("/"); // กลับหน้า login/home
  };

  return (
    <nav className="animate-slide-down font-sarabun sticky top-0 z-50 w-full px-6 py-3 flex items-center justify-between bg-[#102a6b]/95 backdrop-blur-xl border-b border-[#5990c0]/30 shadow-md">

      {/* Logo */}
      <div
        className="animate-fade-in-1 flex items-center gap-2 cursor-pointer"
        onClick={() => navigate("/home")}
      >
        {/* ใช้รูปแทน emoji */}
        <img
          src="/images/logo.png"
          alt="E-tinerary Logo"
          className="object-contain max-h-15"
        />
        <span className="font-prompt font-extrabold text-lg text-white">
          E-tinerary Planing Trip
        </span>
      </div>

      {/* Right side */}
      <div className="animate-fade-in-2 flex items-center gap-3">

        {/* My trips button */}
        <button
          onClick={() => navigate("/trips")}
          className="font-prompt text-sm font-semibold px-4 py-2 rounded-full border border-white/30 text-white bg-white/10 hover:bg-white/20 hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
        >
          🗂️ ทริปของฉัน
        </button>

        {/* Create trip button */}
        <button
          onClick={() => navigate("/trip/create")}
          className="font-prompt text-sm font-semibold px-4 py-2 rounded-full bg-[#cea273] text-[#102a6b] hover:bg-[#d4aa85] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 shadow-md"
        >
          ✈️ สร้างทริป
        </button>

        {/* User badge */}
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#cea273] to-[#5990c0] flex items-center justify-center text-white text-xs font-bold font-prompt">
            {username.charAt(0).toUpperCase()}
          </div>
          <span className="font-prompt text-sm font-semibold text-white">
            {username}
          </span>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="font-prompt text-sm font-semibold px-4 py-1.5 rounded-full border border-white/30 text-white bg-white/10 hover:bg-white/20 hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
        >
          ออกจากระบบ
        </button>
      </div>
    </nav>
  );
}