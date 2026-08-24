import { useNavigate } from "react-router-dom";
import "./welcome.css";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="font-sarabun relative min-h-screen flex items-center justify-center overflow-hidden bg-[#fcedd3]">

      {/* Background blobs */}
      <div className="blob-1 absolute -top-20 -left-20 w-80 h-80 rounded-full bg-[#102a6b] opacity-50 blur-[70px] pointer-events-none" />
      <div className="blob-2 absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-[#015185] opacity-40 blur-[70px] pointer-events-none" />
      <div className="blob-3 absolute bottom-20 left-20 w-60 h-60 rounded-full bg-[#5990c0] opacity-50 blur-[60px] pointer-events-none" />
      <div className="blob-4 absolute top-16 right-24 w-52 h-52 rounded-full bg-[#102a6b] opacity-30 blur-[60px] pointer-events-none" />

      {/* Card */}
      <div className="animate-slide-up-1 relative z-10 w-[90%] max-w-md text-center px-12 py-14 rounded-[36px] border border-white/80 shadow-2xl bg-white/70 backdrop-blur-2xl">

        {/* Logo */}
        <img
          src="/images/logo.png"
          alt="E-tinerary Logo"
          className="animate-slide-up-2 w-32 h-32 object-contain mx-auto mb-5"
        />

        {/* Title */}
        <h1 className="animate-slide-up-2 font-prompt font-extrabold text-4xl text-[#102a6b] mb-2">
          ยินดีต้อนรับ!
        </h1>

        <p className="animate-slide-up-3 text-[#015185] text-base mb-10">
          เริ่มต้นการเดินทางของคุณกับเรา
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-4">

          {/* Register */}
          <button
            onClick={() => navigate("/register")}
            className="animate-slide-up-4 font-prompt font-semibold w-full py-4 rounded-2xl text-white bg-gradient-to-r from-[#102a6b] to-[#5990c0] shadow-[0_6px_20px_rgba(16,42,107,0.5)] hover:shadow-[0_10px_28px_rgba(16,42,107,0.65)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
          >
            ✨ สมัครสมาชิก
          </button>

          {/* Login */}
          <button
            onClick={() => navigate("/login")}
            className="animate-slide-up-5 font-prompt font-semibold w-full py-4 rounded-2xl text-white bg-gradient-to-r from-[#5990c0] to-[#015185] shadow-[0_6px_20px_rgba(89,144,192,0.4)] hover:shadow-[0_10px_28px_rgba(89,144,192,0.55)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
          >
            🔑 เข้าสู่ระบบ
          </button>

        </div>

        {/* Dots */}
        <div className="animate-slide-up-6 flex justify-center gap-2 mt-8">
          <div className="w-2 h-2 rounded-full bg-[#102a6b]" />
          <div className="w-2 h-2 rounded-full bg-[#5990c0]" />
          <div className="w-2 h-2 rounded-full bg-[#015185]" />
          <div className="w-2 h-2 rounded-full bg-[#fcedd3]" />
        </div>

      </div>
    </div>
  );
}