import { useNavigate } from "react-router-dom";
import { MailCheck } from "lucide-react";

export default function ConfirmEmail() {
  const navigate = useNavigate();

  return (
    <div className="font-sarabun min-h-screen flex items-center justify-center px-4 py-6 bg-[color:var(--cream)]">
      <div className="fade-in w-full max-w-md bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-6 sm:px-12 py-8 text-center">
        <MailCheck
          size={48}
          strokeWidth={1.5}
          className="mx-auto mb-4 text-[color:var(--sky)]"
        />

        <h2 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)] mb-2">
          ตรวจสอบอีเมลของคุณ
        </h2>

        <p className="text-[color:var(--deep)] text-sm leading-relaxed mb-6 pb-6 border-b border-[color:var(--line)]">
          ระบบได้ส่งอีเมลยืนยันไปยังบัญชีของคุณแล้ว
          <br />
          กรุณากดลิงก์ในอีเมลเพื่อเข้าสู่ระบบ
        </p>

        <button
          type="button"
          onClick={() => navigate("/")}
          className="font-prompt font-medium w-full min-h-12 flex items-center justify-center rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] transition-all duration-200"
        >
          กลับไปหน้าหลัก
        </button>
      </div>
    </div>
  );
}
