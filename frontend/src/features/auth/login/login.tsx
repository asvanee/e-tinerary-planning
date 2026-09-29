import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LogIn, Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const { login } = useAuth();

  const API_URL = import.meta.env.VITE_API_URL || "";

  const showError = (text: string) => {
    setMessage(text);
    setShakeKey((k) => k + 1);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.status === 200) {
        login(data.user, data.session);
        navigate("/home");
      } else {
        showError(data.message);
      }
    } catch (error) {
      console.error("Login error:", error);
      showError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full min-h-12 px-4 py-3 rounded-xl border border-[color:var(--line)] bg-white text-[color:var(--text)] placeholder:text-[color:var(--muted)] placeholder:opacity-60 focus:outline-none focus:border-[color:var(--navy)] focus:ring-4 focus:ring-[color:var(--line)] transition-all duration-200";

  const labelClass = "font-prompt text-sm font-medium text-[color:var(--navy)]";

  const linkClass =
    "font-semibold text-[color:var(--deep)] underline underline-offset-2 hover:text-[color:var(--navy)] transition-colors duration-200 cursor-pointer";

  return (
    <div className="font-sarabun min-h-screen flex items-center justify-center px-4 py-6 bg-[color:var(--cream)]">
      <div className="fade-in w-full max-w-md bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-8 sm:px-12 py-8">
        {/* Header */}
        <div className="text-center mb-6">
          <img
            src="/images/logo.png"
            alt="E-tinerary Logo"
            className="w-24 h-24 object-contain mx-auto mb-3"
          />
          <h2 className="font-prompt font-semibold text-3xl text-[color:var(--navy)]">
            เข้าสู่ระบบ
          </h2>
          <p className="text-[color:var(--deep)] text-sm mt-1">
            ยินดีต้อนรับกลับมา
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className={labelClass}>อีเมล</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputClass}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className={labelClass}>รหัสผ่าน</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`${inputClass} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[color:var(--muted)] hover:text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] transition-colors duration-200"
              >
                {showPassword ? (
                  <EyeOff size={20} strokeWidth={1.75} />
                ) : (
                  <Eye size={20} strokeWidth={1.75} />
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {message && (
            <p
              key={shakeKey}
              role="alert"
              className="animate-shake flex items-center justify-center gap-2 text-center text-sm rounded-xl px-4 py-3 bg-white border text-[color:var(--danger)] border-[color:var(--danger)]"
            >
              <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0" />
              <span>{message}</span>
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="font-prompt font-medium w-full min-h-12 mt-1 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
                กำลังเข้าสู่ระบบ...
              </>
            ) : (
              <>
                <LogIn size={20} strokeWidth={1.75} />
                เข้าสู่ระบบ
              </>
            )}
          </button>
        </form>

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
      </div>
    </div>
  );
}