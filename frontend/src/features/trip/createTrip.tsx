import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar";
import "./createTrip.css";

const PROVINCES = [
    "กรุงเทพมหานคร", "กระบี่", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร",
    "ขอนแก่น", "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท",
    "ชัยภูมิ", "ชุมพร", "เชียงราย", "เชียงใหม่", "ตรัง",
    "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม",
    "นครราชสีมา", "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส",
    "น่าน", "บึงกาฬ", "บุรีรัมย์", "ปทุมธานี", "ประจวบคีรีขันธ์",
    "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", "พะเยา", "พังงา",
    "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์",
    "แพร่", "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน",
    "ยโสธร", "ยะลา", "ร้อยเอ็ด", "ระนอง", "ระยอง",
    "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย",
    "ศรีสะเกษ", "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ",
    "สมุทรสงคราม", "สมุทรสาคร", "สระแก้ว", "สระบุรี", "สิงห์บุรี",
    "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", "สุรินทร์", "หนองคาย",
    "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", "อุตรดิตถ์",
    "อุทัยธานี", "อุบลราชธานี",
];

const TAGS = [
    "art", "temple", "nature", "museum", "beach",
    "mountain", "food", "culture", "shopping", "nightlife",
    "adventure", "relaxation",
];

const BUDGET_TYPES = [
    { value: "TOTAL", label: "งบรวมทั้งทริป" },
    { value: "PER_PERSON", label: "งบต่อคน" },
];

export default function CreateTrip() {
    const navigate = useNavigate();

    const [province, setProvince] = useState("");
    const [city, setCity] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [startTime, setStartTime] = useState("");
    const [numberOfPeople, setNumberOfPeople] = useState("");
    const [totalBudget, setTotalBudget] = useState("");
    const [budgetType, setBudgetType] = useState("");
    const [availableTimePerDay, setAvailableTimePerDay] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");

    const toggleTag = (tag: string) => {
        setTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    const addCustomTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && tagInput.trim()) {
            const newTag = tagInput.trim().toLowerCase();
            if (!tags.includes(newTag)) setTags((prev) => [...prev, newTag]);
            setTagInput("");
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!province && !city) {
            alert("กรุณาเลือกจังหวัดหรืออำเภออย่างน้อย 1 อย่าง");
            return;
        }

        let finalBudget = totalBudget ? Number(totalBudget) : null;
        const people = Number(numberOfPeople);

        if (budgetType === "PER_PERSON" && finalBudget && people) {
            finalBudget = finalBudget * people;
        }

        const payload = {
            province: province || null,
            city: city || null,
            start_date: startDate,
            end_date: endDate,
            start_time: startTime,
            number_of_people: people,
            total_budget: finalBudget,
            budget_type: budgetType,
            available_time_per_day: availableTimePerDay
                ? Number(availableTimePerDay)
                : null,
            tags,
        };

        console.log("DATA READY FOR BACKEND:", payload);
        localStorage.setItem("tripPreferences", JSON.stringify(payload));

        navigate("/trip/all", { state: { tripPreferences: payload } });
    };

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
                            >
                                <option value="">เลือกจังหวัด...</option>
                                {PROVINCES.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className={labelClass}>📍 อำเภอ / ตำบล</label>
                            <input
                                type="text"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="เช่น เมืองนครปฐม"
                                className={inputClass}
                            />
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
                                <label className={labelClass}>ประเภทงบ</label>
                                <select
                                    value={budgetType}
                                    onChange={(e) => setBudgetType(e.target.value)}
                                    className={inputClass}
                                >
                                    <option value="">เลือกประเภท...</option>
                                    {BUDGET_TYPES.map((b) => (
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
                            <input
                                type="text"
                                placeholder="พิมพ์แล้วกด Enter เพื่อเพิ่ม"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={addCustomTag}
                                className={inputClass + " mb-3"}
                            />
                            <div className="flex flex-wrap gap-2">
                                {TAGS.map((tag) => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => toggleTag(tag)}
                                        className={`px-3 py-1 rounded-full border ${tags.includes(tag) ? "bg-[#015185] text-white" : ""
                                            }`}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
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
        </div>
    );
}