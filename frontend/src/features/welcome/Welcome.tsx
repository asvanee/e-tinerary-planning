import { useNavigate } from "react-router-dom";
import { UserPlus, LogIn, MapPin, Route, CalendarDays } from "lucide-react";

/*
  สีอ้างจากตัวแปรใน global.css (--navy, --deep, --sky, --cream ฯลฯ)
  ค่าหลังจุลภาคคือ fallback ถ้า global.css ยังไม่ถูกโหลด หน้าจะยังเห็นสีปกติ
*/

const features = [
  { icon: MapPin, label: "แนะนำสถานที่" },
  { icon: Route, label: "จัดเส้นทาง" },
  { icon: CalendarDays, label: "วางแผนทริป" },
];

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="font-sarabun min-h-screen flex items-center justify-center px-4 bg-[color:var(--cream,#fcedd3)]">
      <div className="fade-in w-full max-w-sm text-center bg-white rounded-2xl border border-[color:var(--line,rgba(89,144,192,0.25))] [box-shadow:var(--shadow,0_2px_12px_rgba(16,42,107,0.08))] px-8 py-10">
        {/* Logo */}
        <img
          src="/images/logo.png"
          alt="E-tinerary Logo"
          className="w-24 h-24 object-contain mx-auto mb-5"
        />

        {/* Title */}
        <h1 className="font-prompt font-semibold text-3xl text-[color:var(--navy,#102a6b)] mb-2">
          ยินดีต้อนรับ
        </h1>
        <p className="text-[color:var(--deep,#015185)] text-base mb-8">
          เริ่มต้นการเดินทางของคุณกับเรา
        </p>

        {/* Features */}
        <ul className="flex justify-center gap-6 mb-8 pb-8 border-b border-[color:var(--line,rgba(89,144,192,0.25))]">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex flex-col items-center gap-2">
              <Icon size={22} strokeWidth={1.75} className="text-[color:var(--sky,#5990c0)]" />
              <span className="text-sm text-[color:var(--muted,#4b5f7a)]">{label}</span>
            </li>
          ))}
        </ul>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate("/register")}
            className="font-prompt font-medium w-full min-h-12 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy,#102a6b)] hover:bg-[color:var(--navy-dark,#0c2054)] active:scale-[0.98] transition-all duration-200"
          >
            <UserPlus size={20} strokeWidth={1.75} />
            สมัครสมาชิก
          </button>

          <button
            onClick={() => navigate("/login")}
            className="font-prompt font-medium w-full min-h-12 flex items-center justify-center gap-2 rounded-xl text-[color:var(--navy,#102a6b)] bg-transparent border-2 border-[color:var(--sky,#5990c0)] hover:bg-[color:var(--sky-soft,rgba(89,144,192,0.1))] active:scale-[0.98] transition-all duration-200"
          >
            <LogIn size={20} strokeWidth={1.75} />
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    </div>
  );
}