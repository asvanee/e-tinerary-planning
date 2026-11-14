import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPinned,
  UserPlus,
  Loader2,
  TriangleAlert,
  CircleCheck,
} from "lucide-react";
import PasswordField from "../../../system/auth/PasswordField";
import { inputClass, labelClass } from "../../../system/auth/authFormClasses";

// หน้าสมัครสมาชิก: ส่งข้อมูลให้ backend สำเร็จแล้วไปหน้าแจ้งยืนยันอีเมล (/confirm-email) · มีลิงก์ไปหน้า login (/login)
export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [isEmailDuplicate, setIsEmailDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || "";

  const showError = (text: string) => {
    setIsError(true);
    setShakeKey((k) => k + 1);
    setMessage(text);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setIsEmailDuplicate(false);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();

      if (res.ok) {
        setIsError(false);
        setMessage(data.message);
        navigate("/confirm-email");
      } else {
        showError(data.message);
        setIsEmailDuplicate(res.status === 409);
      }
    } catch {
      showError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsSubmitting(false);
    }
  };



  const linkClass =
    "font-semibold text-[color:var(--deep)] underline underline-offset-2 hover:text-[color:var(--navy)] transition-colors duration-200 cursor-pointer";

  return (
    <div className="font-sarabun min-h-screen flex items-center justify-center px-4 py-6 bg-[color:var(--cream)]">
      <div className="fade-in w-full max-w-3xl bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-6 sm:px-12 py-8">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[color:var(--line)]">
          <MapPinned
            size={40}
            strokeWidth={1.5}
            className="shrink-0 text-[color:var(--sky)]"
          />
          <div>
            <h2 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
              สมัครสมาชิก
            </h2>
            <p className="text-[color:var(--deep)] text-sm mt-0.5">
              สร้างบัญชีใหม่
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className={labelClass}>ชื่อผู้ใช้</label>
              <input
                id="username"
                autoComplete="username"
                autoFocus
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className={labelClass}>อีเมล</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
              />
            </div>

            <PasswordField value={password} onChange={setPassword} autoComplete="new-password" />

            {/* Message (เต็มความกว้าง) */}
            {message && (
              <div
                key={shakeKey}
                role="alert"
                className={`${isError ? "animate-shake" : ""} md:col-span-2 flex flex-col items-center gap-1 text-center text-sm rounded-xl px-4 py-3 bg-white border ${
                  isError
                    ? "text-[color:var(--danger)] border-[color:var(--danger)]"
                    : "text-[color:var(--success)] border-[color:var(--success)]"
                }`}
              >
                <p className="flex items-center justify-center gap-2">
                  {isError ? (
                    <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0" />
                  ) : (
                    <CircleCheck size={18} strokeWidth={1.75} className="shrink-0" />
                  )}
                  <span>{message}</span>
                </p>
                {isEmailDuplicate && (
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className={linkClass}
                  >
                    คลิกที่นี่เพื่อเข้าสู่ระบบ
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Submit + Footer: แถวเดียวบนจอกว้าง */}
          <div className="mt-6 flex flex-col gap-4 md:flex-row-reverse md:items-center md:justify-between">
            <button
              type="submit"
              disabled={isSubmitting}
              className="font-prompt font-medium w-full md:w-auto md:px-10 min-h-12 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
                  กำลังสมัคร...
                </>
              ) : (
                <>
                  <UserPlus size={20} strokeWidth={1.75} />
                  สมัครสมาชิก
                </>
              )}
            </button>

            <p className="text-center md:text-left text-sm text-[color:var(--muted)]">
              มีบัญชีอยู่แล้ว?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className={linkClass}
              >
                เข้าสู่ระบบ
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}