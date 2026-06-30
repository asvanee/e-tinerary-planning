import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/hooks/useAuth";
import Navbar from "../../components/Navbar";
import "./Home.css";

const demoPlaces = [
  { name: "ตลาดน้ำอัมพวา", location: "สมุทรสงคราม", emoji: "🛶" },
  { name: "เขาใหญ่", location: "นครราชสีมา", emoji: "🏞️" },
  { name: "ภูเก็ต", location: "ภูเก็ต", emoji: "🏝️" },
  { name: "เชียงใหม่", location: "เชียงใหม่", emoji: "🌄" },
];

export default function Home() {
  const { user } = useAuth();
  const username = user?.username;
  const navigate = useNavigate();

  return (
    <div className="font-sarabun relative min-h-screen bg-[#fcedd3] overflow-hidden">

      {/* Background blobs */}
      <div className="blob-1 absolute -top-20 -left-20 w-80 h-80 rounded-full bg-[#5990c0] opacity-20 blur-[80px] pointer-events-none" />
      <div className="blob-2 absolute bottom-0 -right-16 w-72 h-72 rounded-full bg-[#015185] opacity-20 blur-[80px] pointer-events-none" />
      <div className="blob-3 absolute bottom-32 left-20 w-60 h-60 rounded-full bg-[#cea273] opacity-20 blur-[70px] pointer-events-none" />

      {/* Navbar */}
      <Navbar />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6 text-center">

        {/* Greeting */}
        <div className="animate-slide-up-1 mb-4 text-6xl">🌍</div>

        <h2 className="animate-slide-up-2 font-prompt font-extrabold text-4xl text-[#102a6b] mb-3">
          วางแผนเที่ยวกับเรา
        </h2>

        <p className="animate-slide-up-3 text-[#015185] text-lg mb-8">
          ยินดีต้อนรับ{" "}
          <span className="font-prompt font-bold text-[#102a6b]">
            {username || "นักท่องเที่ยว"}
          </span>{" "}
          ✈️ ลองดูตัวอย่างสถานที่น่าสนใจสำหรับคุณ
        </p>

        {/* Demo places */}
        <div className="animate-slide-up-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10 w-full max-w-3xl">
          {demoPlaces.map((place, idx) => (
            <div
              key={idx}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-md border border-[#5990c0]/20 hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="text-4xl mb-2">{place.emoji}</div>
              <div className="font-prompt font-bold text-[#102a6b] text-base">{place.name}</div>
              <div className="text-sm text-[#5990c0] mt-1">{place.location}</div>
            </div>
          ))}
        </div>

        {/* Start planning button */}
        <button
          onClick={() => navigate("/trip/create")}
          className="animate-slide-up-4 font-prompt font-bold px-8 py-4 rounded-2xl bg-gradient-to-r from-[#102a6b] to-[#015185] text-white shadow-[0_6px_20px_rgba(1,81,133,0.4)] hover:shadow-[0_10px_28px_rgba(1,81,133,0.55)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 text-base"
        >
          ✈️ เริ่มวางแผนเที่ยว
        </button>

        {/* Dots */}
        <div className="animate-slide-up-3 flex justify-center gap-2 mt-10">
          <div className="w-2 h-2 rounded-full bg-[#102a6b]" />
          <div className="w-2 h-2 rounded-full bg-[#cea273]" />
          <div className="w-2 h-2 rounded-full bg-[#015185]" />
          <div className="w-2 h-2 rounded-full bg-[#5990c0]" />
        </div>
      </div>
    </div>
  );
}