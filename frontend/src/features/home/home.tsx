import { useNavigate } from "react-router-dom";
import {
  Plane,
  CalendarDays,
  SlidersHorizontal,
  Route,
  Sailboat,
  Trees,
  Waves,
  Mountain,
} from "lucide-react";
import { useAuth } from "../auth/hooks/useAuth";
import Navbar from "../../components/navbar";

const steps = [
  {
    icon: CalendarDays,
    title: "ระบุปลายทางและวันเดินทาง",
    desc: "เลือกจังหวัด วันเริ่ม-วันสิ้นสุด และจำนวนคนที่ไปด้วยกัน",
  },
  {
    icon: SlidersHorizontal,
    title: "เลือกความสนใจและงบประมาณ",
    desc: "บอกหมวดหมู่ที่ชอบและงบที่ตั้งไว้ เราจะใช้จัดอันดับสถานที่",
  },
  {
    icon: Route,
    title: "รับแผนเที่ยวรายวัน",
    desc: "ได้สถานที่แนะนำพร้อมเส้นทางเรียงตามลำดับในแต่ละวัน",
  },
];

const demoPlaces = [
  { name: "ตลาดน้ำอัมพวา", location: "สมุทรสงคราม", icon: Sailboat },
  { name: "เขาใหญ่", location: "นครราชสีมา", icon: Trees },
  { name: "ภูเก็ต", location: "ภูเก็ต", icon: Waves },
  { name: "เชียงใหม่", location: "เชียงใหม่", icon: Mountain },
];

export default function Home() {
  const { user } = useAuth();
  const username = user?.username;
  const navigate = useNavigate();

  return (
    <div className="font-sarabun min-h-screen bg-[color:var(--cream)]">
      <Navbar />

      <main className="min-h-[calc(100vh-64px)] flex items-center px-4 sm:px-8 py-8">
        <div className="fade-in w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-10 items-center">
          {/* ซ้าย: ทักทาย + เริ่มวางแผน + ขั้นตอน */}
          <section className="lg:col-span-3">
            <p className="text-sm text-[color:var(--deep)] mb-2">
              สวัสดี{" "}
              <span className="font-prompt font-semibold text-[color:var(--navy)]">
                {username || "นักท่องเที่ยว"}
              </span>
            </p>

            <h1 className="font-prompt font-semibold text-3xl sm:text-4xl text-[color:var(--navy)] mb-3">
              วางแผนเที่ยวกับเรา
            </h1>

            <p className="text-[color:var(--muted)] text-base max-w-xl mb-6">
              ระบุปลายทาง วันเดินทาง และงบประมาณ
              แล้วเราจะแนะนำสถานที่และจัดเส้นทางให้ในแต่ละวัน
            </p>

            <button
              onClick={() => navigate("/trip/create")}
              className="font-prompt font-medium w-full sm:w-auto sm:px-10 min-h-12 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] transition-all duration-200"
            >
              <Plane size={20} strokeWidth={1.75} />
              เริ่มวางแผนเที่ยว
            </button>

            <ol className="mt-8 pt-6 border-t border-[color:var(--line)] flex flex-col gap-4">
              {steps.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-[color:var(--line)]">
                    <Icon
                      size={20}
                      strokeWidth={1.75}
                      className="text-[color:var(--sky)]"
                    />
                  </span>
                  <div>
                    <p className="font-prompt font-medium text-[color:var(--navy)]">
                      {title}
                    </p>
                    <p className="text-sm text-[color:var(--muted)] mt-0.5">
                      {desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* ขวา: ตัวอย่างสถานที่ */}
          <aside className="lg:col-span-2">
            <h2 className="font-prompt text-xs font-medium tracking-wide text-[color:var(--muted)] mb-3">
              ตัวอย่างสถานที่ท่องเที่ยว
            </h2>

            <div className="grid grid-cols-2 gap-3">
              {demoPlaces.map(({ name, location, icon: Icon }) => (
                <div
                  key={name}
                  className="bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] p-5"
                >
                  <Icon
                    size={28}
                    strokeWidth={1.5}
                    className="text-[color:var(--sky)] mb-3"
                  />
                  <p className="font-prompt font-medium text-[color:var(--navy)]">
                    {name}
                  </p>
                  <p className="text-sm text-[color:var(--muted)] mt-0.5">
                    {location}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}