import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export default function MyTrips() {
    const navigate = useNavigate();
    const { session } = useAuth();

    const [trips, setTrips] = useState<Trip[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // ✅ เพิ่มใหม่: state สำหรับปุ่มลบทริป
    // - confirmTripId: ทริปที่กำลังถามยืนยันการลบอยู่ (แสดง popup)
    // - deletingId: ทริปที่กำลังยิง DELETE request อยู่จริง (กันกดซ้ำ + โชว์ loading เฉพาะปุ่มนั้น)
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
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
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

    // ✅ เพิ่มใหม่: ลบทริปจริงผ่าน DELETE /api/trips/:tripId
    // ตอนลบสำเร็จ ตัดออกจาก state ตรงๆ (ไม่ refetch ใหม่ทั้งก้อน) เพื่อความไว
    async function handleDelete(tripId: string) {
        if (!session) return;

        setDeletingId(tripId);
        setError("");

        try {
            const res = await fetch(`/api/trips/${tripId}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.message || "ลบทริปไม่สำเร็จ");
                return;
            }

            setTrips((prev) => prev.filter((t) => t.trip_id !== tripId));
        } catch (err) {
            console.error("Delete trip error:", err);
            setError("ไม่สามารถเชื่อมต่อ server ได้");
        } finally {
            setDeletingId(null);
            setConfirmTripId(null);
        }
    }

    return (
        <div className="font-sarabun min-h-screen bg-[#fcedd3]">
            <Navbar />

            <div className="max-w-4xl mx-auto px-4 py-10">
                <button
                    onClick={() => navigate(-1)}
                    className="font-prompt text-sm font-semibold text-[#102a6b] flex items-center gap-1 mb-4 hover:-translate-x-0.5 transition-all duration-200"
                >
                    ← กลับ
                </button>

                <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg flex items-center justify-between">
                    <div>
                        <h2 className="font-prompt font-bold text-2xl text-white mb-1">
                            ทริปของฉัน
                        </h2>
                        <p className="text-[#5990c0] text-sm">
                            ดูทริปทั้งหมดที่คุณเคยวางแผนไว้
                        </p>
                    </div>
                    <button
                        onClick={() => navigate("/trip/create")}
                        className="font-prompt text-sm font-semibold px-4 py-2 rounded-full bg-[#cea273] text-[#102a6b] hover:bg-[#d4aa85] transition-all duration-200 shadow-md whitespace-nowrap"
                    >
                        ✈️ สร้างทริปใหม่
                    </button>
                </div>

                {loading && (
                    <div className="bg-white rounded-2xl shadow-lg px-8 py-16 text-center text-[#5990c0]">
                        กำลังโหลดข้อมูลทริป...
                    </div>
                )}

                {!loading && error && (
                    <div className="bg-white rounded-2xl shadow-lg px-8 py-16 text-center text-red-500">
                        {error}
                    </div>
                )}

                {!loading && !error && trips.length === 0 && (
                    <div className="bg-white rounded-2xl shadow-lg px-8 py-16 flex flex-col items-center gap-3 text-center">
                        <div className="text-5xl">🧳</div>
                        <h3 className="font-prompt font-bold text-lg text-[#102a6b]">
                            คุณยังไม่มีทริปที่บันทึกไว้
                        </h3>
                        <p className="text-sm text-[#5990c0]">
                            เริ่มวางแผนทริปแรกของคุณได้เลย
                        </p>
                        <button
                            onClick={() => navigate("/trip/create")}
                            className="mt-2 font-bold px-6 py-3 rounded-xl text-white bg-gradient-to-r from-[#102a6b] to-[#015185]"
                        >
                            สร้างทริปใหม่
                        </button>
                    </div>
                )}

                {!loading && !error && trips.length > 0 && (
                    <div className="flex flex-col gap-4">
                        {trips.map((trip) => (
                            <div
                                key={trip.trip_id}
                                onClick={() =>
                                    navigate(`/trip/${trip.trip_id}/detail`)
                                }
                                className="bg-white rounded-2xl shadow-lg px-6 py-5 cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-between gap-4"
                            >
                                <div className="flex-1">
                                    <h3 className="font-prompt font-bold text-lg text-[#102a6b] mb-1">
                                        📍 {trip.province || "-"}
                                        {trip.district ? ` / ${trip.district}` : ""}
                                    </h3>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#5990c0]">
                                        <span>
                                            📅 {trip.start_date} ถึง {trip.end_date}
                                        </span>
                                        <span>👥 {trip.number_of_people} คน</span>
                                        {trip.daily_budget !== null && (
                                            <span>
                                                💰 {Math.round(trip.daily_budget).toLocaleString()}{" "}
                                                บาท/วัน
                                                {trip.budget_type
                                                    ? ` (${BUDGET_TYPE_LABELS[trip.budget_type] || trip.budget_type})`
                                                    : ""}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* ✅ เพิ่มใหม่: ห่อ "ดูรายละเอียด" + ปุ่มลบไว้ด้วยกันฝั่งขวา */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="font-prompt text-sm font-semibold text-[#015185] whitespace-nowrap">
                                        ดูรายละเอียด →
                                    </span>

                                    <button
                                        onClick={(e) => {
                                            // กัน event ทะลุขึ้นไป trigger onClick ของการ์ด (navigate ไป recommendations)
                                            e.stopPropagation();
                                            setConfirmTripId(trip.trip_id);
                                        }}
                                        title="ลบทริปนี้"
                                        className="w-9 h-9 rounded-full bg-gray-50 hover:bg-red-100 text-gray-400 hover:text-red-600 flex items-center justify-center transition-colors"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ✅ เพิ่มใหม่: popup ยืนยันก่อนลบ — กันกดพลาดแล้วข้อมูลหายถาวร */}
            {confirmTripId && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={() => {
                        if (deletingId) return; // กันปิด popup ระหว่างกำลังลบอยู่
                        setConfirmTripId(null);
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white rounded-2xl shadow-xl px-6 py-6 max-w-sm w-full text-center"
                    >
                        <p className="font-prompt font-semibold text-[#102a6b] mb-1">
                            ลบทริปนี้เลยไหม?
                        </p>
                        <p className="text-sm text-[#5990c0] mb-5">
                            แผนการเดินทางทั้งหมดของทริปนี้จะถูกลบและกู้คืนไม่ได้
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setConfirmTripId(null)}
                                disabled={deletingId === confirmTripId}
                                className="px-5 py-2 rounded-xl font-semibold text-[#102a6b] bg-gray-100 disabled:opacity-60"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={() => handleDelete(confirmTripId)}
                                disabled={deletingId === confirmTripId}
                                className="px-5 py-2 rounded-xl font-semibold text-white bg-red-500 disabled:opacity-60"
                            >
                                {deletingId === confirmTripId ? "กำลังลบ..." : "ลบเลย"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}