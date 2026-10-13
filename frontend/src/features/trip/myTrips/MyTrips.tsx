import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plane,
  MapPin,
  CalendarDays,
  Users,
  Wallet,
  ChevronRight,
  Trash2,
  Compass,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../auth/hooks/useAuth";

interface Trip {
  trip_id: string;
  province: string | null;
  district: string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  number_of_people: number;
  total_budget: number | null;
  budget_type: string | null;
  daily_budget: number | null;
  available_time_per_day: number | null;
  created_at: string;
}

const BUDGET_TYPE_LABELS: Record<string, string> = {
  TOTAL: "งบรวมทั้งทริป",
  PER_PERSON_TOTAL: "งบต่อคน",
  PER_DAY: "งบต่อวัน",
};

// "2026-10-05" -> "5 ต.ค. 2569" (ถ้าแปลงไม่ได้ แสดงค่าดิบ)
function formatDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MyTrips() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(""); // โหลดรายการไม่สำเร็จ
  const [deleteError, setDeleteError] = useState(""); // ลบไม่สำเร็จ (ไม่ซ่อนรายการ)

  // confirmTripId: ทริปที่กำลังถามยืนยันการลบ / deletingId: ทริปที่กำลังลบจริง
  const [confirmTripId, setConfirmTripId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrips = async () => {
      if (!session) {
        navigate("/login");
        return;
      }
      try {
        const res = await fetch("/api/trips", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.message || "ไม่สามารถโหลดข้อมูลทริปได้");
          return;
        }

        setTrips(data.trips || []);
      } catch (err) {
        console.error("Fetch trips error:", err);
        setError("ไม่สามารถเชื่อมต่อ server ได้");
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, [session, navigate]);

  // ปิด popup ด้วยปุ่ม Esc (ยกเว้นระหว่างกำลังลบ)
  useEffect(() => {
    if (!confirmTripId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deletingId) setConfirmTripId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmTripId, deletingId]);

  // ลบทริปผ่าน DELETE /api/trips/:tripId แล้วตัดออกจาก state ตรง ๆ
  async function handleDelete(tripId: string) {
    if (!session) return;

    setDeletingId(tripId);
    setDeleteError("");

    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        setDeleteError(data.message || "ลบทริปไม่สำเร็จ");
        return;
      }

      setTrips((prev) => prev.filter((t) => t.trip_id !== tripId));
    } catch (err) {
      console.error("Delete trip error:", err);
      setDeleteError("ไม่สามารถเชื่อมต่อ server ได้");
    } finally {
      setDeletingId(null);
      setConfirmTripId(null);
    }
  }

  const cardClass =
    "bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)]";

  const primaryBtn =
    "font-prompt font-medium min-h-12 px-6 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] transition-all duration-200";

  return (
    <div className="font-sarabun min-h-screen bg-[color:var(--cream)]">
      <Navbar />

      <div className="fade-in max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="font-prompt text-sm font-medium text-[color:var(--navy)] flex items-center gap-1.5 mb-5 min-h-10 hover:text-[color:var(--deep)] transition-colors duration-200"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          กลับ
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="font-prompt font-semibold text-3xl text-[color:var(--navy)]">
              ทริปของฉัน
            </h1>
            <p className="text-[color:var(--deep)] text-sm mt-1">
              ดูทริปทั้งหมดที่คุณเคยวางแผนไว้
            </p>
          </div>
          <button
            onClick={() => navigate("/trip/create")}
            className={`${primaryBtn} w-full sm:w-auto whitespace-nowrap`}
          >
            <Plane size={20} strokeWidth={1.75} />
            สร้างทริปใหม่
          </button>
        </div>

        {/* ลบไม่สำเร็จ: แจ้งเตือนแต่ยังเห็นรายการ */}
        {deleteError && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 text-sm rounded-xl px-4 py-3 bg-white border text-[color:var(--danger)] border-[color:var(--danger)]"
          >
            <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0" />
            <span>{deleteError}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className={`${cardClass} px-8 py-16 flex items-center justify-center gap-3 text-[color:var(--muted)]`}
          >
            <Loader2
              size={20}
              strokeWidth={1.75}
              className="animate-spin text-[color:var(--sky)]"
            />
            กำลังโหลดข้อมูลทริป...
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div
            role="alert"
            className={`${cardClass} px-8 py-16 flex flex-col items-center gap-3 text-center text-[color:var(--danger)]`}
          >
            <TriangleAlert size={28} strokeWidth={1.5} />
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && trips.length === 0 && (
          <div
            className={`${cardClass} px-8 py-16 flex flex-col items-center gap-3 text-center`}
          >
            <Compass
              size={40}
              strokeWidth={1.5}
              className="text-[color:var(--sky)]"
            />
            <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">
              คุณยังไม่มีทริปที่บันทึกไว้
            </h2>
            <p className="text-sm text-[color:var(--muted)]">
              เริ่มวางแผนทริปแรกของคุณได้เลย
            </p>
            <button
              onClick={() => navigate("/trip/create")}
              className={`${primaryBtn} mt-2`}
            >
              <Plane size={20} strokeWidth={1.75} />
              สร้างทริปใหม่
            </button>
          </div>
        )}

        {/* Trip list */}
        {!loading && !error && trips.length > 0 && (
          <ul className="flex flex-col gap-3">
            {trips.map((trip) => (
              <li
                key={trip.trip_id}
                className={`${cardClass} flex items-stretch hover:border-[color:var(--sky)] transition-colors duration-200`}
              >
                {/* พื้นที่หลักของการ์ด: กดเพื่อดูรายละเอียด */}
                <button
                  onClick={() => navigate(`/trip/${trip.trip_id}/detail`)}
                  className="flex-1 min-w-0 flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-5 rounded-l-2xl"
                >
                  <div className="min-w-0">
                    <h3 className="font-prompt font-medium text-lg text-[color:var(--navy)] mb-2 flex items-center gap-2">
                      <MapPin
                        size={20}
                        strokeWidth={1.75}
                        className="shrink-0 text-[color:var(--sky)]"
                      />
                      <span className="truncate">
                        {trip.province || "-"}
                        {trip.district ? ` / ${trip.district}` : ""}
                      </span>
                    </h3>

                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[color:var(--muted)]">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays size={16} strokeWidth={1.75} />
                        {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users size={16} strokeWidth={1.75} />
                        {trip.number_of_people} คน
                      </span>
                      {trip.daily_budget !== null && (
                        <span className="flex items-center gap-1.5">
                          <Wallet size={16} strokeWidth={1.75} />
                          {Math.round(trip.daily_budget).toLocaleString()} บาท/วัน
                          {trip.budget_type
                            ? ` (${BUDGET_TYPE_LABELS[trip.budget_type] || trip.budget_type})`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 flex items-center gap-1 font-prompt text-sm font-medium text-[color:var(--deep)]">
                    <span className="hidden sm:inline">ดูรายละเอียด</span>
                    <ChevronRight size={20} strokeWidth={1.75} />
                  </span>
                </button>

                {/* ปุ่มลบ แยกจากพื้นที่กดของการ์ด */}
                <div className="flex items-center pr-3 sm:pr-4 pl-1">
                  <button
                    onClick={() => setConfirmTripId(trip.trip_id)}
                    aria-label="ลบทริปนี้"
                    title="ลบทริปนี้"
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--danger)] hover:bg-[color:var(--sky-soft)] transition-colors duration-200"
                  >
                    <Trash2 size={20} strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Popup ยืนยันก่อนลบ */}
      {confirmTripId && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => {
            if (deletingId) return; // กันปิดระหว่างกำลังลบ
            setConfirmTripId(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-6 py-6 max-w-sm w-full text-center"
          >
            <TriangleAlert
              size={32}
              strokeWidth={1.5}
              className="mx-auto mb-3 text-[color:var(--danger)]"
            />
            <p
              id="delete-title"
              className="font-prompt font-semibold text-lg text-[color:var(--navy)] mb-1"
            >
              ลบทริปนี้เลยไหม?
            </p>
            <p className="text-sm text-[color:var(--muted)] mb-6">
              แผนการเดินทางทั้งหมดของทริปนี้จะถูกลบและกู้คืนไม่ได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmTripId(null)}
                disabled={deletingId === confirmTripId}
                className="font-prompt font-medium flex-1 min-h-12 rounded-xl text-[color:var(--navy)] border-2 border-[color:var(--sky)] hover:bg-[color:var(--sky-soft)] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleDelete(confirmTripId)}
                disabled={deletingId === confirmTripId}
                className="font-prompt font-medium flex-1 min-h-12 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--danger)] hover:opacity-90 disabled:opacity-60 disabled:pointer-events-none transition-all duration-200"
              >
                {deletingId === confirmTripId ? (
                  <>
                    <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} strokeWidth={1.75} />
                    ลบเลย
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}