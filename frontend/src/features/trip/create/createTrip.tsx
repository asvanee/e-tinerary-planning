import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../auth/hooks/useAuth";
import LocationPinPicker from "../../trip/create/components/LocationPinPicker"; // ปรับ path ตามตำแหน่งจริงที่วางไฟล์
import "./createTrip.css";

// ✅ เอา PROVINCES hardcode 77 จังหวัดออกแล้ว — ดึงจาก /api/places-dropdown/provinces แทน
// เพราะข้อมูลจริงตอนนี้มีแค่กรุงเทพฯ จังหวัดเดียว ถ้าให้เลือกจังหวัดที่ยังไม่มีข้อมูล
// จะได้ 0 ที่แบบเงียบๆ เหมือนบั๊กที่เคยเจอกับ district (ดู PROJECT_BRIEF หัวข้อ 3.11)

const BUDGET_SCOPES = [
    { value: "GROUP", label: "งบรวมทั้งกลุ่ม" },
    { value: "PER_PERSON", label: "งบต่อคน" },
];

const BUDGET_PERIODS = [
    { value: "TOTAL_TRIP", label: "ตลอดทั้งทริป" },
    { value: "PER_DAY", label: "ต่อวัน" },
];

interface Category {
    category_id: number;
    category_name: string;
}

interface TripSummary {
    dailyBudget: number | null;
    perPersonPerDay: number | null;
    people: number;
    tripDays: number;
}

export default function CreateTrip() {
    const navigate = useNavigate();
    const { session } = useAuth();

    const [province, setProvince] = useState("");
    const [provinces, setProvinces] = useState<string[]>([]);
    const [provincesLoading, setProvincesLoading] = useState(true);
    // ✅ เปลี่ยนชื่อ field จาก city เป็น district ทั้งระบบแล้ว (frontend + payload +
    // tripController.ts + poiPlaceQueries.ts + DB column trips.district) กันความสับสน
    // เพราะค่านี้คือ "อำเภอ/เขต" ไม่ใช่ "เมือง" ตามความหมายเดิมของชื่อ city
    const [district, setDistrict] = useState("");
    const [districts, setDistricts] = useState<string[]>([]);
    const [districtsLoading, setDistrictsLoading] = useState(false);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [numberOfPeople, setNumberOfPeople] = useState("");
    const [totalBudget, setTotalBudget] = useState("");
    const [budgetScope, setBudgetScope] = useState("");
    const [budgetPeriod, setBudgetPeriod] = useState("");
    const [availableTimePerDay, setAvailableTimePerDay] = useState("");

    // ✅ จุดเริ่มต้น (ปักหมุดเอง) สำหรับคำนวณ distance score
    const [startLat, setStartLat] = useState<number | null>(null);
    const [startLng, setStartLng] = useState<number | null>(null);
    const [startAddress, setStartAddress] = useState<string | null>(null);
    const [pinConfirmed, setPinConfirmed] = useState(false);

    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);

    // ✅ state สำหรับ success modal
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdTrip, setCreatedTrip] = useState<any>(null);
    const [summary, setSummary] = useState<TripSummary | null>(null);
    // ✅ เพิ่มใหม่: เตือนกรณีบันทึก category ไม่สำเร็จ (backend best-effort, ไม่ rollback trip หลัก)
    const [categoryWarning, setCategoryWarning] = useState(false);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await fetch("/api/categories");
                const data = await res.json();
                setCategories(data.categories || []);
            } catch (err) {
                console.error("Fetch categories error:", err);
            } finally {
                setCategoriesLoading(false);
            }
        };
        fetchCategories();
    }, []);

    // ✅ ดึงรายชื่อจังหวัดจริงจาก DB แทน hardcode 77 จังหวัด — กันเลือกจังหวัดที่ยัง
    // ไม่มีข้อมูลใน places แล้วได้ 0 ที่แบบเงียบๆ ตอนคำนวณ POI score
    useEffect(() => {
        const fetchProvinces = async () => {
            try {
                const res = await fetch("/api/place-dropdown/provinces");
                const data = await res.json();
                setProvinces(data.provinces || []);
            } catch (err) {
                console.error("Fetch provinces error:", err);
                setProvinces([]);
            } finally {
                setProvincesLoading(false);
            }
        };
        fetchProvinces();
    }, []);

    // ✅ ดึงรายชื่อ district จริงจาก DB แทน free-text เดิม — ดึงใหม่ทุกครั้งที่
    // province เปลี่ยน (province ว่าง = คืน district ทั้งหมดที่มีในระบบ)
    useEffect(() => {
        const fetchDistricts = async () => {
            setDistrictsLoading(true);
            try {
                const query = province
                    ? `?province=${encodeURIComponent(province)}`
                    : "";
                const res = await fetch(`/api/place-dropdown/districts${query}`);
                const data = await res.json();
                setDistricts(data.districts || []);
            } catch (err) {
                console.error("Fetch districts error:", err);
                setDistricts([]);
            } finally {
                setDistrictsLoading(false);
            }
        };
        fetchDistricts();
        setDistrict("");
    }, [province]);
    const toggleCategory = (categoryId: number) => {
        setSelectedCategoryIds((prev) =>
            prev.includes(categoryId)
                ? prev.filter((id) => id !== categoryId)
                : [...prev, categoryId]
        );
    };

    // ✅ callback จาก LocationPinPicker — เรียกเฉพาะตอนกด "ยืนยันปักหมุด" เท่านั้น
    const handlePinConfirm = (lat: number, lng: number, address: string | null) => {
        setStartLat(lat);
        setStartLng(lng);
        setStartAddress(address);
        setPinConfirmed(true);
    };

    const calculateTripDays = (start: string, end: string): number => {
        if (!start || !end) return 1;
        const diff = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
        return Math.max(1, Math.round(diff) + 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!province && !district) {
            alert("กรุณาเลือกจังหวัดหรืออำเภออย่างน้อย 1 อย่าง");
            return;
        }

        // ✅ บังคับให้ยืนยันปักหมุดก่อน เพราะไม่มี fallback อื่นแล้ว
        if (!pinConfirmed || startLat === null || startLng === null) {
            alert("กรุณาปักหมุดจุดเริ่มต้น แล้วกด \"ยืนยันปักหมุด\" ก่อนสร้างทริป");
            return;
        }

        if (!session) {
            alert("กรุณาเข้าสู่ระบบก่อนสร้างทริป");
            navigate("/login");
            return;
        }

        if (totalBudget && (!budgetScope || !budgetPeriod)) {
            alert("กรุณาเลือกขอบเขตและช่วงเวลาของงบประมาณให้ครบ");
            return;
        }

        const people = Number(numberOfPeople);
        const tripDays = calculateTripDays(startDate, endDate);
        const rawBudget = totalBudget ? Number(totalBudget) : null;

        let dailyBudget: number | null = null;
        let normalizedTotalBudget: number | null = rawBudget;

        if (rawBudget) {
            // ✅ รองรับ 4 case จาก scope (GROUP/PER_PERSON) x period (TOTAL_TRIP/PER_DAY)
            if (budgetScope === "GROUP" && budgetPeriod === "TOTAL_TRIP") {
                dailyBudget = rawBudget / tripDays;
                normalizedTotalBudget = rawBudget;
            } else if (budgetScope === "GROUP" && budgetPeriod === "PER_DAY") {
                dailyBudget = rawBudget;
                normalizedTotalBudget = rawBudget * tripDays;
            } else if (budgetScope === "PER_PERSON" && budgetPeriod === "TOTAL_TRIP") {
                normalizedTotalBudget = rawBudget * people;
                dailyBudget = normalizedTotalBudget / tripDays;
            } else if (budgetScope === "PER_PERSON" && budgetPeriod === "PER_DAY") {
                dailyBudget = rawBudget * people;
                normalizedTotalBudget = dailyBudget * tripDays;
            }
        }

        if (dailyBudget !== null && dailyBudget < 300) {
            const confirmed = confirm(
                `งบประมาณต่อวันอยู่ที่ประมาณ ${Math.round(dailyBudget).toLocaleString()} บาท อาจไม่เพียงพอสำหรับบางสถานที่ ต้องการดำเนินการต่อหรือไม่?`
            );
            if (!confirmed) return;
        }

        const payload = {
            province: province || null,
            district: district || null,
            start_date: startDate,
            end_date: endDate,
            start_time: startTime,
            number_of_people: people,
            total_budget: normalizedTotalBudget,
            budget_scope: budgetScope || null,
            budget_period: budgetPeriod || null,
            daily_budget: dailyBudget,
            available_time_per_day: availableTimePerDay
                ? Number(availableTimePerDay)
                : null,
            category_ids: selectedCategoryIds,
            // ✅ จุดเริ่มต้นสำหรับคำนวณ distance score
            start_lat: startLat,
            start_lng: startLng,
            start_address: startAddress,
        };

        try {
            const res = await fetch("/api/trips", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(payload),
            });

            const result = await res.json();

            if (!res.ok) {
                alert(result.message || "เกิดข้อผิดพลาดในการสร้างทริป");
                return;
            }

            // ✅ เก็บข้อมูลสรุปไว้แสดงใน modal แทนการ navigate ทันที
            setCreatedTrip(result.trip);
            setSummary({
                dailyBudget,
                perPersonPerDay: dailyBudget !== null ? dailyBudget / people : null,
                people,
                tripDays,
            });
            // ✅ backend อาจสร้าง trip สำเร็จ แต่บันทึก category ไม่สำเร็จ (best-effort)
            setCategoryWarning(!!result.categoryWarning);
            setShowSuccessModal(true);
        } catch (err) {
            console.error("Create trip error:", err);
            alert("ไม่สามารถเชื่อมต่อ server ได้");
        }
    };

    const selectedCategoryNames = categories
        .filter((c) => selectedCategoryIds.includes(c.category_id))
        .map((c) => c.category_name);

    const budgetTypeLabel =
        budgetScope && budgetPeriod
            ? `${BUDGET_SCOPES.find((b) => b.value === budgetScope)?.label} / ${BUDGET_PERIODS.find((b) => b.value === budgetPeriod)?.label}`
            : "-";

    const inputClass =
        "w-full px-4 py-3 rounded-xl border border-[#5990c0]/40 bg-white text-[#102a6b] placeholder-[#5990c0]/60 focus:outline-none focus:ring-2 focus:ring-[#015185] transition-all duration-200 font-sarabun";

    const labelClass =
        "font-prompt text-sm font-semibold text-[#102a6b] flex items-center gap-2 mb-1";

    return (
        <div className="font-sarabun min-h-screen bg-[#fcedd3]">
            <Navbar />

            <div className="max-w-2xl mx-auto px-4 py-10">

                <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg">
                    <h2 className="font-prompt font-bold text-2xl text-white mb-1">
                        วางแผนการเดินทาง
                    </h2>
                    <p className="text-[#5990c0] text-sm">
                        กรอกรายละเอียดเพื่อวางแผนทริปของคุณ
                    </p>
                </div>

                <div className="bg-white rounded-2xl shadow-lg px-8 py-8">
                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                        <div>
                            <label className={labelClass}>📍 จังหวัด</label>
                            <select
                                value={province}
                                onChange={(e) => setProvince(e.target.value)}
                                required
                                className={inputClass}
                                disabled={provincesLoading}
                            >
                                <option value="">
                                    {provincesLoading ? "กำลังโหลด..." : "เลือกจังหวัด..."}
                                </option>
                                {provinces.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <p className="text-xs text-[#5990c0]/80 mt-1 font-sarabun">
                                แสดงเฉพาะจังหวัดที่มีสถานที่แนะนำในระบบแล้วเท่านั้น
                            </p>
                        </div>

                        <div>
                            <label className={labelClass}>📍 อำเภอ / เขต</label>
                            <select
                                value={district}
                                onChange={(e) => setDistrict(e.target.value)}
                                className={inputClass}
                                disabled={districtsLoading || districts.length === 0}
                            >
                                <option value="">
                                    {districtsLoading
                                        ? "กำลังโหลด..."
                                        : districts.length === 0
                                        ? "ไม่พบอำเภอ/เขตในระบบ"
                                        : "เลือกอำเภอ/เขต..."}
                                </option>
                                {districts.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            <p className="text-xs text-[#5990c0]/80 mt-1 font-sarabun">
                                รายชื่อดึงจากสถานที่จริงในระบบ เพื่อให้แนะนำสถานที่ในพื้นที่นี้ได้ถูกต้อง
                            </p>
                        </div>

                        {/* ✅ ส่วนปักหมุดจุดเริ่มต้น */}
                        <div>
                            <label className={labelClass}>
                                📌 จุดเริ่มต้นการเดินทาง (เช่น โรงแรมที่พัก)
                            </label>
                            <LocationPinPicker
                                initialLat={startLat}
                                initialLng={startLng}
                                onConfirm={handlePinConfirm}
                            />
                            <p className="text-xs text-[#5990c0]/80 mt-1 font-sarabun">
                                ใช้คำนวณระยะทางไปยังสถานที่แนะนำในทริปของคุณ
                            </p>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className={labelClass}>📅 วันที่เริ่มต้น</label>
                                <input type="date" required className={inputClass}
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className={labelClass}>📅 วันที่สิ้นสุด</label>
                                <input type="date" required className={inputClass}
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)} />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className={labelClass}>⏰ เวลาเริ่มต้น</label>
                                <input type="time" required className={inputClass}
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className={labelClass}>👥 จำนวนผู้เดินทาง</label>
                                <input type="number" min={1} required className={inputClass}
                                    value={numberOfPeople}
                                    onChange={(e) => setNumberOfPeople(e.target.value)} />
                            </div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className={labelClass}>💰 งบประมาณ (บาท)</label>
                                <input type="number" min={0} className={inputClass}
                                    value={totalBudget}
                                    onChange={(e) => setTotalBudget(e.target.value)} />
                            </div>
                            <div className="flex-1">
                                <label className={labelClass}>ขอบเขตงบ</label>
                                <select
                                    value={budgetScope}
                                    onChange={(e) => setBudgetScope(e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="">เลือกขอบเขต...</option>
                                    {BUDGET_SCOPES.map((b) => (
                                        <option key={b.value} value={b.value}>{b.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className={labelClass}>ช่วงเวลา</label>
                                <select
                                    value={budgetPeriod}
                                    onChange={(e) => setBudgetPeriod(e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="">เลือกช่วงเวลา...</option>
                                    {BUDGET_PERIODS.map((b) => (
                                        <option key={b.value} value={b.value}>{b.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>🕐 เวลาว่างต่อวัน (ชั่วโมง)</label>
                            <input type="number" min={1} max={24} className={inputClass}
                                value={availableTimePerDay}
                                onChange={(e) => setAvailableTimePerDay(e.target.value)} />
                        </div>

                        <div>
                            <label className={labelClass}>🏷️ ความสนใจ</label>
                            {categoriesLoading ? (
                                <p className="text-sm text-[#5990c0]">กำลังโหลดหมวดหมู่...</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {categories.map((cat) => (
                                        <button
                                            key={cat.category_id}
                                            type="button"
                                            onClick={() => toggleCategory(cat.category_id)}
                                            className={`px-3 py-1 rounded-full border ${
                                                selectedCategoryIds.includes(cat.category_id)
                                                    ? "bg-[#015185] text-white"
                                                    : ""
                                            }`}
                                        >
                                            {cat.category_name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="font-bold w-full py-4 rounded-xl text-white bg-gradient-to-r from-[#102a6b] to-[#015185]"
                        >
                            วางแผนการเดินทาง 🗺️
                        </button>

                    </form>
                </div>
            </div>

            {showSuccessModal && summary && createdTrip && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full px-6 py-7 font-sarabun">
                        <div className="text-center mb-5">
                            <div className="text-5xl mb-2">✅</div>
                            <h3 className="font-prompt font-bold text-xl text-[#102a6b]">
                                บันทึกข้อมูลทริปเรียบร้อยแล้ว
                            </h3>
                        </div>

                        {/* ✅ เตือนถ้า backend insert trip_categories ไม่สำเร็จ (best-effort, ไม่ rollback trip) */}
                        {categoryWarning && (
                            <div className="bg-amber-50 border border-amber-300 text-amber-800 text-xs rounded-lg px-3 py-2 mb-4">
                                ⚠️ บันทึกหมวดหมู่ความสนใจไม่สำเร็จ ทริปของคุณยังถูกสร้างเรียบร้อย
                                แต่อาจไม่มีหมวดหมู่ผูกไว้ — สามารถแก้ไขเพิ่มเติมภายหลังได้
                            </div>
                        )}

                        <div className="bg-[#fcedd3]/50 rounded-xl px-5 py-4 mb-5 flex flex-col gap-2 text-sm text-[#102a6b]">
                            <div className="flex justify-between">
                                <span className="text-[#5990c0]">จังหวัด / อำเภอ</span>
                                <span className="font-semibold">
                                    {province || "-"} {district ? `/ ${district}` : ""}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#5990c0]">ช่วงวันที่</span>
                                <span className="font-semibold">{startDate} ถึง {endDate}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#5990c0]">จำนวนวัน</span>
                                <span className="font-semibold">{summary.tripDays} วัน</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#5990c0]">เวลาเริ่มต้น</span>
                                <span className="font-semibold">{startTime}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#5990c0]">จำนวนผู้เดินทาง</span>
                                <span className="font-semibold">{summary.people} คน</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[#5990c0]">เวลาว่างต่อวัน</span>
                                <span className="font-semibold">{availableTimePerDay || "-"} ชม.</span>
                            </div>

                            <div className="border-t border-[#5990c0]/30 my-1 pt-2">
                                <div className="flex justify-between">
                                    <span className="text-[#5990c0]">ประเภทงบประมาณ</span>
                                    <span className="font-semibold">{budgetTypeLabel}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#5990c0]">งบต่อวัน</span>
                                    <span className="font-semibold">
                                        {summary.dailyBudget !== null
                                            ? `${Math.round(summary.dailyBudget).toLocaleString()} บาท`
                                            : "-"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[#5990c0]">งบต่อวันต่อคน</span>
                                    <span className="font-semibold">
                                        {summary.perPersonPerDay !== null
                                            ? `${Math.round(summary.perPersonPerDay).toLocaleString()} บาท`
                                            : "-"}
                                    </span>
                                </div>
                            </div>

                            {selectedCategoryNames.length > 0 && (
                                <div className="border-t border-[#5990c0]/30 mt-1 pt-2">
                                    <span className="text-[#5990c0]">ความสนใจที่เลือก</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {selectedCategoryNames.map((name) => (
                                            <span
                                                key={name}
                                                className="px-2 py-0.5 rounded-full bg-[#015185]/10 text-[#015185] text-xs"
                                            >
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => navigate(`/trip/${createdTrip.trip_id}/recommendations`)}
                            className="font-bold w-full py-3 rounded-xl text-white bg-gradient-to-r from-[#102a6b] to-[#015185]"
                        >
                            ดูสถานที่ที่ตรงใจ →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}