import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClass, labelClass } from "./authFormClasses";

// ช่องกรอกรหัสผ่านพร้อมปุ่มแสดง/ซ่อนรหัส รับค่าที่พิมพ์ ฟังก์ชันเมื่อพิมพ์ และชนิด autoComplete
// (หน้า login ใช้ current-password, หน้าสมัครใช้ new-password)
export default function PasswordField({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="password" className={labelClass}>รหัสผ่าน</label>
      <div className="relative">
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className={`${inputClass} pr-12`}
        />
        {/* ปุ่มสลับแสดง/ซ่อนรหัสผ่าน */}
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
  );
}
