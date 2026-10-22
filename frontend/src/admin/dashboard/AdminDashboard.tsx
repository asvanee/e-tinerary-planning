import type { LucideIcon } from "lucide-react";
import { CloudDownload, Tags } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../system/auth/useAuth";

interface AdminTool {
  title: string;
  description: string;
  icon: LucideIcon;
  to?: string; // ไม่มี = ยังไม่เปิดใช้
}

// เครื่องมือตาม D-24/D-26 — ตรวจสถานที่ซ้ำและนำเข้าทำทีละจังหวัด (เลือกจากหน้ารายชื่อจังหวัด)
const TOOLS: AdminTool[] = [
  {
    title: "ตรวจสอบสถานที่และนำเข้าข้อมูล",
    description: "ตรวจสอบสถานที่ใน CSV + นำเข้าพร้อมข้อมูลจาก Google",
    icon: CloudDownload,
    to: "/admin/provinces",
  },
  {
    title: "Category Mapping",
    description: "ย้ายป้ายประเภทของ ททท. ไปหมวดอื่น และแก้ชื่อ กลุ่ม ในร่ม/กลางแจ้ง ค่าเข้าชมของหมวด",
    icon: Tags,
    to: "/admin/categories",
  },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const username = user?.username || "ผู้ดูแลระบบ";

  return (
    <div className="fade-in">
      <h1 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
        สวัสดี, {username}
      </h1>
      <p className="text-[color:var(--deep)] mt-1">
        จัดการข้อมูลสถานที่ของระบบ E-tinerary
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
        {TOOLS.map(({ title, description, icon: Icon, to }) => (
          <button
            key={title}
            type="button"
            disabled={!to}
            onClick={() => to && navigate(to)}
            className="relative text-left flex flex-col gap-3 p-5 rounded-2xl bg-white border border-[color:var(--line)] [box-shadow:var(--shadow)] transition-colors enabled:hover:bg-[color:var(--sky-soft)] enabled:cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {!to && (
              <span className="absolute top-4 right-4 font-prompt text-xs font-medium px-2 py-1 rounded-full bg-[color:var(--sky-soft)] text-[color:var(--navy)]">
                เร็วๆ นี้
              </span>
            )}
            <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-[color:var(--sky-soft)] text-[color:var(--navy)]">
              <Icon size={22} strokeWidth={1.75} />
            </span>
            <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">
              {title}
            </h2>
            <p className="text-sm text-[color:var(--muted)]">{description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
