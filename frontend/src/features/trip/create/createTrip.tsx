import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../auth/hooks/useAuth";
import LocationPinPicker from "../../trip/create/components/LocationPinPicker"; // ปรับ path ตามตำแหน่งจริงที่วางไฟล์
import type { ReactNode } from "react";
import {
    ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleCheck, Heart, Loader2,
    MapPin, MapPinned, Pencil, Plane, Route, Save, TriangleAlert, Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";


// ✅ เอา PROVINCES hardcode 77 จังหวัดออกแล้ว — ดึงจาก /api/place-dropdown/provinces แทน
// (ตั้งใจตั้งชื่อ path แยกจาก /api/places เดิม — ดู placeDropdownRoutes.ts)
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

// ✅ เพิ่มใหม่: เช็คไม่ให้ end_time (start_time + available_time_per_day) ข้ามเที่ยงคืน
// สอดคล้องกับ validateNoMidnightCrossing ฝั่ง backend (tripController.ts) — ทาง (ก)
// ตามมติใน itineraries_feature_status.md ทำหน้าที่แค่เตือน user เร็วๆ ก่อนยิง API เท่านั้น
// (backend ยังคง validate ซ้ำเป็นด่านสุดท้ายเสมอ ไม่เชื่อ client ตรงๆ)
function getMidnightCrossingError(
    startTime: string,
    availableTimePerDay: number | null
): string | null {
    if (availableTimePerDay === null) return null;

    if (Number.isNaN(availableTimePerDay) || availableTimePerDay <= 0) {
        return "เวลาว่างต่อวันต้องเป็นตัวเลขมากกว่า 0";
    }

    const match = /^(\d{1,2}):(\d{2})$/.exec(startTime);
    if (!match) {
        return "กรุณากรอกเวลาเริ่มต้นให้ถูกต้อง";
    }

    const startMinutes = Number(match[1]) * 60 + Number(match[2]);
    const endMinutes = startMinutes + availableTimePerDay * 60;

    if (endMinutes > 24 * 60) {
        return "เวลาเริ่มต้นรวมกับเวลาว่างต่อวันข้ามเที่ยงคืน กรุณาปรับเวลาเริ่มต้นให้เร็วขึ้น หรือลดเวลาว่างต่อวันลง";
    }

    return null;
}

const inputClass =
    "w-full min-h-12 px-4 py-3 rounded-xl border border-[color:var(--line)] bg-white text-[color:var(--text)] placeholder:text-[color:var(--muted)] placeholder:opacity-60 focus:outline-none focus:border-[color:var(--navy)] focus:ring-4 focus:ring-[color:var(--line)] disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200";

const selectClass = `${inputClass} appearance-none pr-11`;

const labelClass = "font-prompt text-sm font-medium text-[color:var(--navy)]";

const hintClass = "text-xs text-[color:var(--muted)]";

function Section({
    icon: Icon,
    title,
    children,
}: {
    icon: LucideIcon;
    title: string;
    children: ReactNode;
}) {
    return (
        <section className="pt-6 border-t border-[color:var(--line)] first:pt-0 first:border-t-0">
            <h3 className="font-prompt font-semibold text-lg text-[color:var(--navy)] flex items-center gap-2 mb-4">
                <Icon size={20} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
                {title}
            </h3>
            {children}
        </section>
    );
}

function Field({
    id,
    label,
    hint,
    children,
}: {
    id: string;
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className={labelClass}>{label}</label>
            {children}
            {hint && <p className={hintClass}>{hint}</p>}
        </div>
    );
}

function SelectWrap({ children }: { children: ReactNode }) {
    return (
        <div className="relative">
            {children}
            <ChevronDown
                size={18}
                strokeWidth={1.75}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--deep)]"
            />
        </div>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4">
            <dt className="text-[color:var(--muted)]">{label}</dt>
            <dd className="font-semibold text-[color:var(--navy)] text-right">{value}</dd>
        </div>
    );
}

const STEPS = ["จังหวัดปลายทางและจุดเริ่มต้น", "วันเวลาและจำนวนคน", "งบและความสนใจ"];

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
    return (
        <ol className="flex items-center gap-2 mb-6" aria-label="ขั้นตอนการกรอก">
            {STEPS.map((label, i) => {
                const done = i < step;
                const active = i === step;
                return (
                    <li key={label} className="flex items-center gap-2 flex-1 last:flex-none">
                        <button
                            type="button"
                            disabled={i > step}
                            onClick={() => onJump(i)}
                            aria-current={active ? "step" : undefined}
                            className="flex items-center gap-2 min-h-10 rounded-full disabled:cursor-default"
                        >
                            <span
                                className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-full border text-sm font-prompt font-medium transition-colors duration-200 ${
                                    active || done
                                        ? "bg-[color:var(--navy)] border-[color:var(--navy)] text-white"
                                        : "bg-white border-[color:var(--line)] text-[color:var(--muted)]"
                                }`}
                            >
                                {done ? <Check size={16} strokeWidth={2} /> : i + 1}
                            </span>
                            <span
                                className={`font-prompt text-sm ${
                                    active
                                        ? "font-medium text-[color:var(--navy)]"
                                        : "hidden sm:inline text-[color:var(--muted)]"
                                }`}
                            >
                                {label}
                            </span>
                        </button>
                        {i < STEPS.length - 1 && (
                            <span
                                className={`h-px flex-1 ${
                                    done ? "bg-[color:var(--navy)]" : "bg-[color:var(--line)]"
                                }`}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

export default function CreateTrip() {
    const navigate = useNavigate();
    const { session } = useAuth();


    const location = useLocation();
    const { tripId } = useParams();

    //const isEdit = !!tripId; //ถ้า isEdit === true ให้โหลดข้อมูลจาก GET /api/trips/:tripId


const editMode = !!tripId;
    const trip = location.state?.trip;

    console.log("editMode =", editMode);
console.log("trip =", trip);

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

    // ✅ ใหม่: ปุ่มติ๊ก "ต้องการกำหนดงบประมาณไหม" — default ไม่ติ๊ก (ไม่จำกัดงบ)
    // ติ๊กแล้วค่อยเด้งช่องกรอกงบ/ขอบเขต/ช่วงเวลาให้กรอก (บังคับกรอกครบเฉพาะตอนติ๊ก)
    const [useBudget, setUseBudget] = useState(false);
    const [totalBudget, setTotalBudget] = useState("");
    const [budgetScope, setBudgetScope] = useState("");
    const [budgetPeriod, setBudgetPeriod] = useState("");
    const [availableTimePerDay, setAvailableTimePerDay] = useState("");

    // ✅ จุดเริ่มต้น (ปักหมุดเอง) สำหรับคำนวณ distance score
    const [startLat, setStartLat] = useState<number | null>(null);
    const [startLng, setStartLng] = useState<number | null>(null);
    const [startAddress, setStartAddress] = useState<string | null>(null);
    const [pinConfirmed, setPinConfirmed] = useState(false);

    // ✅ เพิ่มใหม่: กันบั๊ก district หายตอน refresh หน้า edit
    // เดิมเช็คว่า province ที่โหลดมาตรงกับ location.state?.trip.province ไหม แต่ state นี้
    // หายไปทันทีถ้า refresh หน้า/เข้าลิงก์ตรง ทำให้ district ที่เพิ่งโหลดมาจาก API ถูกเคลียร์ทิ้ง
    // เปลี่ยนมาใช้ ref ธรรมดา: set true ก่อนเซ็ต province จาก loadTrip() เท่านั้น
    // ถ้า effect ด้านล่างเห็น flag นี้เป็น true ให้ "ข้าม" การเคลียร์ district ไปหนึ่งรอบ
    const skipDistrictResetRef = useRef(false);

    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);

    // ✅ state สำหรับ success modal
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [createdTrip, setCreatedTrip] = useState<any>(null);
    const [summary, setSummary] = useState<TripSummary | null>(null);
    // ✅ เพิ่มใหม่: เตือนกรณีบันทึก category ไม่สำเร็จ (backend best-effort, ไม่ rollback trip หลัก)
    const [categoryWarning, setCategoryWarning] = useState(false);

    // error แบบ inline (แทน alert) + loading ตอนกดบันทึก
    const [formError, setFormError] = useState("");
    const [shakeKey, setShakeKey] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // แบ่งฟอร์มเป็นขั้น (เฉพาะ UI ไม่กระทบ state/payload เดิม)
    const [step, setStep] = useState(0);
    const stepRef = useRef<HTMLDivElement>(null);
    const showError = (text: string) => {
        setFormError(text);
        setShakeKey((k) => k + 1);
    };

    useEffect(() => {
  if (!editMode || !tripId || !session) return;

  const loadTrip = async () => {
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message);
      }

      const trip = data.trip;

      // ✅ บอก effect ที่ดึง district ว่ารอบนี้ province ถูกตั้งค่าจากการโหลดข้อมูลเดิม
      // ไม่ใช่ user เลือกเอง อย่าเพิ่งเคลียร์ district ที่กำลังจะ set ด้านล่าง
      skipDistrictResetRef.current = true;

      setProvince(trip.province ?? "");
      setDistrict(trip.district ?? "");

      setStartDate(trip.start_date ?? "");
      setEndDate(trip.end_date ?? "");
      setStartTime(trip.start_time ?? "");

      setNumberOfPeople(
        String(trip.number_of_people ?? "")
      );

      setUseBudget(trip.use_budget ?? false);

      setTotalBudget(
        trip.total_budget != null
          ? String(trip.total_budget)
          : ""
      );

      setBudgetScope(trip.budget_scope ?? "");
      setBudgetPeriod(trip.budget_period ?? "");

      setAvailableTimePerDay(
        trip.available_time_per_day != null
          ? String(trip.available_time_per_day)
          : ""
      );

      setStartLat(trip.start_lat);
      setStartLng(trip.start_lng);
      setStartAddress(trip.start_address);

      if (trip.start_lat && trip.start_lng) {
        setPinConfirmed(true);
      }
    } catch (err) {
      console.error(err);
      // ✅ เพิ่มใหม่: เดิมเงียบไปเฉยๆ ถ้าโหลดข้อมูลทริปเดิมไม่สำเร็จ user จะเห็นฟอร์มว่างเปล่า
      // โดยไม่รู้สาเหตุ — แจ้งเตือนให้สอดคล้องกับจุดอื่นในไฟล์นี้ที่ alert ตอน fetch fail
      alert("ไม่สามารถโหลดข้อมูลทริปเดิมได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  loadTrip();
}, [editMode, tripId, session]);

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

    // ✅ เพิ่มใหม่: ดึงรายการหมวดหมู่ความสนใจจาก backend
    // (เดิมไฟล์นี้ตั้ง categoriesLoading = true ไว้ตั้งแต่ต้น แต่ไม่มี useEffect
    // ไหนยิง fetch("/api/categories") หรือเรียก setCategoriesLoading(false) เลย
    // ทำให้ UI ค้างที่ "กำลังโหลดหมวดหมู่..." ตลอดไป — นี่คือจุดที่แก้)
    useEffect(() => {
        const fetchCategories = async () => {
            setCategoriesLoading(true);
            try {
                const res = await fetch("/api/categories");
                const data = await res.json();
                // รองรับทั้งกรณี backend คืน array ตรงๆ หรือคืนใน { categories: [...] }
                const list: Category[] = Array.isArray(data)
                    ? data
                    : data.categories || [];
                setCategories(list);
            } catch (err) {
                console.error("Fetch categories error:", err);
                setCategories([]);
            } finally {
                setCategoriesLoading(false);
            }
        };
        fetchCategories();
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

        // ✅ แก้บั๊ก: เดิมเช็ค `trip?.province !== province` โดย trip มาจาก location.state
        // ซึ่งหายไปเมื่อ refresh หน้า/เข้าลิงก์ตรงตอน edit mode ทำให้ district ที่เพิ่งโหลดมา
        // จาก API ถูกเคลียร์ทิ้งทันทีทุกครั้งที่ refresh หน้าแก้ไขทริป
        // ตอนนี้เช็คจาก ref แทน: ถ้ารอบนี้ province ถูกตั้งจาก loadTrip() (skipDistrictResetRef
        // เป็น true) ให้ข้ามการเคลียร์ไปหนึ่งรอบ แล้ว reset flag ทันที ส่วนกรณี user เลือก
        // province เองจาก dropdown (ปกติ หรือหลังโหลดทริปเสร็จแล้ว) จะยังเคลียร์ district ตามเดิม
        if (skipDistrictResetRef.current) {
            skipDistrictResetRef.current = false;
        } else {
            setDistrict("");
        }
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

    // ✅ toggle ปุ่มติ๊กงบประมาณ — ยกเลิกติ๊กแล้วเคลียร์ค่าทันที กัน state ค้างจากรอบก่อน
    // (เผื่อ user กรอกงบไว้ก่อนแล้วค่อยติ๊กออก ไม่ให้ค่าเก่าหลุดไปคำนวณ)
    const handleUseBudgetChange = (checked: boolean) => {
        setUseBudget(checked);
        if (!checked) {
            setTotalBudget("");
            setBudgetScope("");
            setBudgetPeriod("");
        }
    };

    const calculateTripDays = (start: string, end: string): number => {
        if (!start || !end) return 1;
        const diff = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
        return Math.max(1, Math.round(diff) + 1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");

        // ✅ แก้แล้ว: province บังคับกรอกเสมอ (district เลือกเพิ่มหรือไม่ก็ได้)
        // ปกติ <select> จังหวัดมี required อยู่แล้วทำให้ submit ไม่ได้ถ้าไม่เลือก
        // แต่เช็คซ้ำไว้เป็น safety net เผื่อ browser ข้าม native validation ไปได้
        if (!province) {
            showError("กรุณาเลือกจังหวัด");
            return;
        }

        // ✅ บังคับให้ยืนยันปักหมุดก่อน เพราะไม่มี fallback อื่นแล้ว
        if (!pinConfirmed || startLat === null || startLng === null) {
            showError("กรุณาปักหมุดจุดเริ่มต้น แล้วกด \"ยืนยันปักหมุด\" ก่อนสร้างทริป");
            return;
        }

        if (!session) {
            alert("กรุณาเข้าสู่ระบบก่อนสร้างทริป");
            navigate("/login");
            return;
        }

        // ✅ เปลี่ยนจากเช็ค totalBudget ตรงๆ มาเช็คจาก useBudget แทน
        // (ติ๊กว่าต้องการกำหนดงบ แต่กรอกไม่ครบ = บล็อก / ไม่ติ๊ก = ข้ามไปเลย)
        if (useBudget && (!totalBudget || !budgetScope || !budgetPeriod)) {
            showError("กรุณากรอกงบประมาณและเลือกขอบเขต/ช่วงเวลาให้ครบ");
            return;
        }

        // ✅ เพิ่มใหม่: กัน end_time ข้ามเที่ยงคืน ก่อนยิง API (backend ยัง validate ซ้ำอยู่ดี)
        const midnightCrossingError = getMidnightCrossingError(
            startTime,
            availableTimePerDay ? Number(availableTimePerDay) : null
        );

        if (midnightCrossingError) {
            showError(midnightCrossingError);
            return;
        }

        const people = Number(numberOfPeople);
        const tripDays = calculateTripDays(startDate, endDate);

        // ✅ rawBudget เคารพ useBudget เป็นด่านแรกเสมอ — ไม่ติ๊ก = null เสมอ
        // ไม่ว่า state totalBudget จะมีเลขค้างอยู่หรือไม่ก็ตาม (safety net อีกชั้น)
        const rawBudget = useBudget && totalBudget ? Number(totalBudget) : null;

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
    province,
    district: district || null,
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    number_of_people: people,

    use_budget: useBudget,

    total_budget: normalizedTotalBudget,
    budget_scope: useBudget ? budgetScope || null : null,
    budget_period: useBudget ? budgetPeriod || null : null,
    daily_budget: dailyBudget,

    available_time_per_day: availableTimePerDay
        ? Number(availableTimePerDay)
        : null,

    category_ids: selectedCategoryIds,

    start_lat: startLat,
    start_lng: startLng,
    start_address: startAddress,
};
        setIsSubmitting(true);
        try {
            const url = editMode
                ? `/api/trips/${tripId}`
                : "/api/trips";

            const method = editMode ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
        headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
});


            const result = await res.json();

                if (!res.ok) {
                    showError(
                        result.message ||
                        (editMode
                            ? "เกิดข้อผิดพลาดในการแก้ไขทริป"
                            : "เกิดข้อผิดพลาดในการสร้างทริป")
                    );
                    return;
                }
            // แก้ไขทริป
                if (editMode) {
                    navigate(`/trip/${tripId}/recommendations`);
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
            showError("ไม่สามารถเชื่อมต่อ server ได้");
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedCategoryNames = categories
        .filter((c) => selectedCategoryIds.includes(c.category_id))
        .map((c) => c.category_name);

    const budgetTypeLabel =
        budgetScope && budgetPeriod
            ? `${BUDGET_SCOPES.find((b) => b.value === budgetScope)?.label} / ${BUDGET_PERIODS.find((b) => b.value === budgetPeriod)?.label}`
            : "-";

    const LAST_STEP = STEPS.length - 1;

    const goToStep = (n: number) => {
        setFormError("");
        setStep(n);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // เช็คเฉพาะช่องในขั้นปัจจุบันก่อนไปขั้นถัดไป (ใช้ native validation + เช็คเดิมที่มีอยู่แล้ว)
    const validateStep = (): boolean => {
        const els = stepRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
        if (els) {
            for (const el of Array.from(els)) {
                if (!el.reportValidity()) return false;
            }
        }
        if (step === 0 && (!pinConfirmed || startLat === null || startLng === null)) {
            showError('กรุณาปักหมุดจุดเริ่มต้น แล้วกด "ยืนยันปักหมุด" ก่อนไปขั้นถัดไป');
            return false;
        }
        if (step === 1) {
            const err = getMidnightCrossingError(
                startTime,
                availableTimePerDay ? Number(availableTimePerDay) : null
            );
            if (err) {
                showError(err);
                return false;
            }
        }
        return true;
    };

    const goNext = () => {
        if (validateStep()) goToStep(step + 1);
    };

    // กด Enter ในขั้นก่อนหน้าไม่ให้ submit ทั้งฟอร์ม (ส่งได้เฉพาะขั้นสุดท้าย)
    const onFormSubmit = (e: React.FormEvent) => {
        if (step < LAST_STEP) {
            e.preventDefault();
            return;
        }
        handleSubmit(e);
    };

    const HeaderIcon = editMode ? Pencil : Plane;

    return (
        <div className="font-sarabun min-h-screen bg-[color:var(--cream)]">
            <Navbar />

            <main className="px-4 sm:px-8 py-8">
                <div className="fade-in w-full max-w-3xl mx-auto bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-6 sm:px-12 py-8">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[color:var(--line)]">
                        <HeaderIcon size={40} strokeWidth={1.5} className="shrink-0 text-[color:var(--sky)]" />
                        <div>
                            <h2 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
                                {editMode ? "แก้ไขข้อมูลทริป" : "วางแผนการเดินทาง"}
                            </h2>
                            <p className="text-[color:var(--deep)] text-sm mt-0.5">
                                {editMode
                                    ? "แก้ไขรายละเอียดของทริป"
                                    : "กรอกรายละเอียดเพื่อวางแผนทริปของคุณ"}
                            </p>
                        </div>
                    </div>

                    <Stepper step={step} onJump={goToStep} />

                    <form onSubmit={onFormSubmit} className="flex flex-col gap-6">
                        <div ref={stepRef} className="flex flex-col gap-6">
{step === 0 && (
<>
{/* ปลายทาง */}
                        <Section icon={MapPin} title="ปลายทาง">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
                                <Field
                                    id="province"
                                    label="จังหวัด"
                                    hint="แสดงเฉพาะจังหวัดที่มีสถานที่แนะนำในระบบแล้ว"
                                >
                                    <SelectWrap>
                                        <select
                                            id="province"
                                            value={province}
                                            onChange={(e) => setProvince(e.target.value)}
                                            required
                                            disabled={provincesLoading}
                                            className={selectClass}
                                        >
                                            <option value="">
                                                {provincesLoading ? "กำลังโหลด..." : "เลือกจังหวัด..."}
                                            </option>
                                            {provinces.map((p) => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                    </SelectWrap>
                                </Field>

                                <Field
                                    id="district"
                                    label="อำเภอ / เขต"
                                    hint="ไม่บังคับ ใช้จำกัดพื้นที่ที่แนะนำสถานที่"
                                >
                                    <SelectWrap>
                                        <select
                                            id="district"
                                            value={district}
                                            onChange={(e) => setDistrict(e.target.value)}
                                            disabled={districtsLoading || districts.length === 0}
                                            className={selectClass}
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
                                    </SelectWrap>
                                </Field>
                            </div>
                        </Section>

                        {/* จุดเริ่มต้น */}
                        <Section icon={MapPinned} title="จุดเริ่มต้นการเดินทาง">
                            <p className={`${hintClass} mb-3`}>
                                เช่น โรงแรมที่พัก ใช้คำนวณระยะทางไปยังสถานที่แนะนำในทริปของคุณ
                            </p>
                            <LocationPinPicker
                                initialLat={startLat}
                                initialLng={startLng}
                                onConfirm={handlePinConfirm}
                            />
                        </Section>

                        </>
)}
{step === 1 && (
<>
{/* วัน เวลา ผู้เดินทาง */}
                        <Section icon={CalendarDays} title="วัน เวลา และผู้เดินทาง">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
                                <Field id="startDate" label="วันที่เริ่มต้น">
                                    <input
                                        id="startDate"
                                        type="date"
                                        required
                                        className={inputClass}
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </Field>
                                <Field id="endDate" label="วันที่สิ้นสุด">
                                    <input
                                        id="endDate"
                                        type="date"
                                        required
                                        className={inputClass}
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                    />
                                </Field>
                                <Field id="startTime" label="เวลาเริ่มต้น">
                                    <input
                                        id="startTime"
                                        type="time"
                                        required
                                        className={inputClass}
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                    />
                                </Field>
                                <Field
                                    id="availableTimePerDay"
                                    label="เวลาว่างต่อวัน (ชั่วโมง)"
                                    hint="เวลาเริ่มต้นรวมกับเวลาว่างต่อวันต้องไม่ข้ามเที่ยงคืน เช่น เริ่ม 20:00 ว่างได้ไม่เกิน 4 ชั่วโมง"
                                >
                                    <input
                                        id="availableTimePerDay"
                                        type="number"
                                        inputMode="numeric"
                                        min={1}
                                        max={24}
                                        className={inputClass}
                                        value={availableTimePerDay}
                                        onChange={(e) => setAvailableTimePerDay(e.target.value)}
                                    />
                                </Field>
                                <Field id="numberOfPeople" label="จำนวนผู้เดินทาง">
                                    <input
                                        id="numberOfPeople"
                                        type="number"
                                        inputMode="numeric"
                                        min={1}
                                        required
                                        className={inputClass}
                                        value={numberOfPeople}
                                        onChange={(e) => setNumberOfPeople(e.target.value)}
                                    />
                                </Field>
                            </div>
                        </Section>

                        </>
)}
{step === 2 && (
<>
{/* งบประมาณ */}
                        <Section icon={Wallet} title="งบประมาณ">
                            <label className="flex items-start gap-3 p-4 rounded-xl border border-[color:var(--line)] bg-white cursor-pointer transition-colors duration-200 hover:border-[color:var(--sky)] has-[:checked]:border-[color:var(--navy)] has-[:checked]:bg-[color:var(--sky-soft)] has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[color:var(--line)]">
                                <input
                                    type="checkbox"
                                    checked={useBudget}
                                    onChange={(e) => handleUseBudgetChange(e.target.checked)}
                                    className="mt-0.5 w-5 h-5 shrink-0 accent-[color:var(--navy)]"
                                />
                                <span>
                                    <span className="block font-prompt font-medium text-[color:var(--navy)]">
                                        กำหนดงบประมาณ
                                    </span>
                                    <span className={`${hintClass} block mt-0.5`}>
                                        ถ้าไม่เลือก ระบบจะแนะนำสถานที่โดยไม่กรองตามราคา
                                    </span>
                                </span>
                            </label>

                            {useBudget && (
                                <div className="fade-in grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                                    <Field id="totalBudget" label="งบประมาณ (บาท)">
                                        <input
                                            id="totalBudget"
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            required
                                            className={inputClass}
                                            value={totalBudget}
                                            onChange={(e) => setTotalBudget(e.target.value)}
                                        />
                                    </Field>
                                    <Field id="budgetScope" label="ขอบเขตงบ">
                                        <SelectWrap>
                                            <select
                                                id="budgetScope"
                                                value={budgetScope}
                                                onChange={(e) => setBudgetScope(e.target.value)}
                                                required
                                                className={selectClass}
                                            >
                                                <option value="">เลือกขอบเขต...</option>
                                                {BUDGET_SCOPES.map((b) => (
                                                    <option key={b.value} value={b.value}>{b.label}</option>
                                                ))}
                                            </select>
                                        </SelectWrap>
                                    </Field>
                                    <Field id="budgetPeriod" label="ช่วงเวลา">
                                        <SelectWrap>
                                            <select
                                                id="budgetPeriod"
                                                value={budgetPeriod}
                                                onChange={(e) => setBudgetPeriod(e.target.value)}
                                                required
                                                className={selectClass}
                                            >
                                                <option value="">เลือกช่วงเวลา...</option>
                                                {BUDGET_PERIODS.map((b) => (
                                                    <option key={b.value} value={b.value}>{b.label}</option>
                                                ))}
                                            </select>
                                        </SelectWrap>
                                    </Field>
                                </div>
                            )}
                        </Section>

                        {/* ความสนใจ */}
                        <Section icon={Heart} title="ความสนใจ">
                            {categoriesLoading ? (
                                <p className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
                                    <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
                                    กำลังโหลดหมวดหมู่...
                                </p>
                            ) : categories.length === 0 ? (
                                <p className="text-sm text-[color:var(--muted)]">
                                    ยังไม่มีหมวดหมู่ให้เลือก
                                </p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-2">
                                        {categories.map((cat) => {
                                            const selected = selectedCategoryIds.includes(cat.category_id);
                                            return (
                                                <button
                                                    key={cat.category_id}
                                                    type="button"
                                                    aria-pressed={selected}
                                                    onClick={() => toggleCategory(cat.category_id)}
                                                    className={`flex items-center gap-1.5 min-h-10 px-4 rounded-full border text-sm active:scale-[0.98] transition-all duration-200 ${
                                                        selected
                                                            ? "bg-[color:var(--navy)] border-[color:var(--navy)] text-white"
                                                            : "bg-white border-[color:var(--line)] text-[color:var(--muted)] hover:border-[color:var(--sky)] hover:text-[color:var(--navy)]"
                                                    }`}
                                                >
                                                    {selected && <Check size={16} strokeWidth={2} />}
                                                    {cat.category_name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className={`${hintClass} mt-3`}>
                                        เลือกแล้ว {selectedCategoryIds.length} จาก {categories.length} หมวด
                                    </p>
                                </>
                            )}
                        </Section>

                        </>
)}
</div>

{/* Error + Nav */}
                        {formError && (
                            <p
                                key={shakeKey}
                                role="alert"
                                className="animate-shake flex items-center justify-center gap-2 text-center text-sm rounded-xl px-4 py-3 bg-white border text-[color:var(--danger)] border-[color:var(--danger)]"
                            >
                                <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0" />
                                <span>{formError}</span>
                            </p>
                        )}

                        <div className="flex gap-3">
                            {step > 0 && (
                                <button
                                    type="button"
                                    onClick={() => goToStep(step - 1)}
                                    className="font-prompt font-medium min-h-12 px-5 flex items-center justify-center gap-2 rounded-xl text-[color:var(--navy)] bg-transparent border-2 border-[color:var(--sky)] hover:bg-[color:var(--sky-soft)] active:scale-[0.98] transition-all duration-200"
                                >
                                    <ArrowLeft size={20} strokeWidth={1.75} />
                                    ย้อนกลับ
                                </button>
                            )}

                            {step < LAST_STEP ? (
                                <button
                                    type="button"
                                    key="next-btn"
                                    onClick={goNext}
                                    className="font-prompt font-medium flex-1 min-h-12 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] transition-all duration-200"
                                >
                                    ถัดไป
                                    <ArrowRight size={20} strokeWidth={1.75} />
                                </button>
                            ) : (
                                <button
                                    key="submit-btn"
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="font-prompt font-medium flex-1 min-h-12 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
                                            กำลังบันทึก...
                                        </>
                                    ) : editMode ? (
                                        <>
                                            <Save size={20} strokeWidth={1.75} />
                                            บันทึกการแก้ไข
                                        </>
                                    ) : (
                                        <>
                                            <Route size={20} strokeWidth={1.75} />
                                            วางแผนการเดินทาง
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </main>

            {/* Success modal */}
            {showSuccessModal && summary && createdTrip && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-[color:var(--navy)]/60">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="trip-success-title"
                        className="fade-in w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-6 sm:px-8 py-8"
                    >
                        <div className="text-center mb-6">
                            <CircleCheck
                                size={48}
                                strokeWidth={1.5}
                                className="mx-auto mb-3 text-[color:var(--success)]"
                            />
                            <h3
                                id="trip-success-title"
                                className="font-prompt font-semibold text-xl text-[color:var(--navy)]"
                            >
                                บันทึกข้อมูลทริปเรียบร้อยแล้ว
                            </h3>
                        </div>

                        {categoryWarning && (
                            <div
                                role="alert"
                                className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-5 bg-white border text-[color:var(--danger)] border-[color:var(--danger)]"
                            >
                                <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                                <span>
                                    บันทึกหมวดหมู่ความสนใจไม่สำเร็จ ทริปของคุณถูกสร้างเรียบร้อยแล้ว
                                    แต่อาจไม่มีหมวดหมู่ผูกไว้ สามารถแก้ไขภายหลังได้
                                </span>
                            </div>
                        )}

                        <dl className="flex flex-col gap-2.5 text-sm rounded-xl px-5 py-4 mb-6 bg-[color:var(--sky-soft)]">
                            <SummaryRow
                                label="จังหวัด / อำเภอ"
                                value={`${province || "-"}${district ? ` / ${district}` : ""}`}
                            />
                            <SummaryRow label="ช่วงวันที่" value={`${startDate} ถึง ${endDate}`} />
                            <SummaryRow label="จำนวนวัน" value={`${summary.tripDays} วัน`} />
                            <SummaryRow label="เวลาเริ่มต้น" value={startTime} />
                            <SummaryRow label="จำนวนผู้เดินทาง" value={`${summary.people} คน`} />
                            <SummaryRow
                                label="เวลาว่างต่อวัน"
                                value={`${availableTimePerDay || "-"} ชม.`}
                            />

                            <div className="flex flex-col gap-2.5 border-t border-[color:var(--line)] pt-2.5">
                                <SummaryRow
                                    label="ประเภทงบประมาณ"
                                    value={useBudget ? budgetTypeLabel : "ไม่จำกัดงบประมาณ"}
                                />
                                {useBudget && (
                                    <>
                                        <SummaryRow
                                            label="งบต่อวัน"
                                            value={
                                                summary.dailyBudget !== null
                                                    ? `${Math.round(summary.dailyBudget).toLocaleString()} บาท`
                                                    : "-"
                                            }
                                        />
                                        <SummaryRow
                                            label="งบต่อวันต่อคน"
                                            value={
                                                summary.perPersonPerDay !== null
                                                    ? `${Math.round(summary.perPersonPerDay).toLocaleString()} บาท`
                                                    : "-"
                                            }
                                        />
                                    </>
                                )}
                            </div>

                            {selectedCategoryNames.length > 0 && (
                                <div className="border-t border-[color:var(--line)] pt-2.5">
                                    <p className="text-[color:var(--muted)]">ความสนใจที่เลือก</p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {selectedCategoryNames.map((name) => (
                                            <span
                                                key={name}
                                                className="px-3 py-1 rounded-full bg-white border border-[color:var(--line)] text-xs text-[color:var(--navy)]"
                                            >
                                                {name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </dl>

                        <button
                            type="button"
                            onClick={() => navigate(`/trip/${createdTrip.trip_id}/recommendations`)}
                            className="font-prompt font-medium w-full min-h-12 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] transition-all duration-200"
                        >
                            ดูสถานที่ที่ตรงใจ
                            <ArrowRight size={20} strokeWidth={1.75} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}