import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./login.css";
<img
  src="/images/logo.png"
  alt="E-tinerary Logo"
  className="animate-slide-up-2 w-28 h-28 object-contain mx-auto mb-5"
/>

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [shakeKey, setShakeKey] = useState(0);

  const navigate = useNavigate();
  const { login } = useAuth();

  const API_URL = import.meta.env.VITE_API_URL || "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await res.json();

      if (res.status === 200) {
        login(data.user, data.session);
        navigate("/home");
      } else {
        setMessage(data.message);
        setShakeKey((k) => k + 1);
      }
    } catch (error) {
      console.error("Login error:", error);
      setMessage("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
      setShakeKey((k) => k + 1);
    }
  };

  return (
    <div className="font-sarabun relative min-h-screen flex items-center justify-center overflow-hidden bg-[#fcedd3]">

      {/* Background blobs */}
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-[#5990c0] opacity-30 blur-[70px] pointer-events-none" />

      <div className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-[#015185] opacity-25 blur-[70px] pointer-events-none" />

      <div className="absolute top-16 right-24 w-52 h-52 rounded-full bg-[#102a6b] opacity-20 blur-[60px] pointer-events-none" />

      {/* Login Card */}
      <div className="animate-slide-up-1 relative z-10 w-[90%] max-w-md px-12 py-14 rounded-[36px] border border-[#5990c0]/30 shadow-2xl bg-white/80 backdrop-blur-xl">

        {/* Header */}
        <div className="text-center mb-10">

          {/* Logo */}
          <img
            src="/images/logo.png"
            alt="E-tinerary Logo"
            className="animate-slide-up-2 w-28 h-28 object-contain mx-auto mb-5"
          />

          <h2 className="animate-slide-up-2 font-prompt font-extrabold text-3xl text-[#102a6b]">
            เข้าสู่ระบบ
          </h2>

          <p className="animate-slide-up-3 text-[#5990c0] text-sm mt-1">
            ยินดีต้อนรับกลับมา!
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* Email */}
          <div className="animate-slide-up-3 flex flex-col gap-1">
            <label className="font-prompt text-sm font-semibold text-[#102a6b]">
              อีเมล
            </label>

            <input
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-[#5990c0]/40 bg-white text-[#102a6b] placeholder-[#5990c0]/60 focus:outline-none focus:ring-2 focus:ring-[#015185] transition-all duration-200"
            />
          </div>

          {/* Password */}
          <div className="animate-slide-up-4 flex flex-col gap-1">
            <label className="font-prompt text-sm font-semibold text-[#102a6b]">
              รหัสผ่าน
            </label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-[#5990c0]/40 bg-white text-[#102a6b] placeholder-[#5990c0]/60 focus:outline-none focus:ring-2 focus:ring-[#015185] transition-all duration-200"
            />
          </div>

          {/* Error message */}
          {message && (
            <p
              key={shakeKey}
              className="animate-shake text-center text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-2"
            >
              ⚠️ {message}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="animate-slide-up-5 font-prompt font-semibold w-full py-4 mt-2 rounded-2xl text-white bg-gradient-to-r from-[#102a6b] to-[#015185] shadow-[0_6px_20px_rgba(1,81,133,0.4)] hover:shadow-[0_10px_28px_rgba(1,81,133,0.6)] hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200"
          >
            เข้าสู่ระบบ
          </button>
        </form>

        {/* Register */}
        <p className="animate-slide-up-6 text-center text-sm text-[#5990c0] mt-6">
          ยังไม่มีบัญชี?{" "}
          <span
            onClick={() => navigate("/register")}
            className="font-semibold text-[#015185] underline underline-offset-2 cursor-pointer hover:text-[#102a6b] transition-colors duration-200"
          >
            สมัครสมาชิก
          </span>
        </p>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-8">
          <div className="w-2 h-2 rounded-full bg-[#102a6b]" />
          <div className="w-2 h-2 rounded-full bg-[#015185]" />
          <div className="w-2 h-2 rounded-full bg-[#5990c0]" />
          <div className="w-2 h-2 rounded-full bg-[#cfe5f6]" />
        </div>

      </div>
    </div>
  );
}