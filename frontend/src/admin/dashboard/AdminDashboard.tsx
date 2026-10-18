import type { LucideIcon } from "lucide-react";
import { MapPin, Copy, Tags } from "lucide-react";
import { useAuth } from "../../system/auth/useAuth";

interface AdminTool {
  title: string;
  description: string;
  icon: LucideIcon;
}

// เครื่องมือตาม D-23 — ยังไม่เปิดใช้ (ทำใน R5 P3–P5)
const TOOLS: AdminTool[] = [
  {
    title: "เพิ่มจังหวัด",
    description: "เลือกจังหวัดจาก attraction.csv ตรวจผลแบบ dry-run แล้วนำเข้าสถานที่",
    icon: MapPin,
  },
  {
    title: "จัดการสถานที่ซ้ำ",
    description: "ยืนยันหรือยกเลิกการรวมสถานที่ซ้ำ และแก้พิกัดที่ผิด",
    icon: Copy,
  },
  {
    title: "Category Mapping",
    description: "กำหนดการจับคู่ประเภทจาก Google กับหมวดหมู่ของระบบ",
    icon: Tags,
  },
];

export default function AdminDashboard() {
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
        {TOOLS.map(({ title, description, icon: Icon }) => (
          <div
            key={title}
            aria-disabled="true"
            className="relative flex flex-col gap-3 p-5 rounded-2xl bg-white border border-[color:var(--line)] [box-shadow:var(--shadow)] opacity-70 cursor-not-allowed"
          >
            <span className="absolute top-4 right-4 font-prompt text-xs font-medium px-2 py-1 rounded-full bg-[color:var(--sky-soft)] text-[color:var(--navy)]">
              เร็วๆ นี้
            </span>
            <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-[color:var(--sky-soft)] text-[color:var(--navy)]">
              <Icon size={22} strokeWidth={1.75} />
            </span>
            <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">
              {title}
            </h2>
            <p className="text-sm text-[color:var(--muted)]">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
