import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../../system/auth/useAuth";
import { errorText } from "../../../system/errorText";
import RouteMap from "../e-tinerary/components/RouteMap";
import ConflictBadges from "../components/ConflictBadges";
import {
  formatBaht,
  formatDistance,
  formatTime,
  formatTimeRange,
  formatTravelTime,
  formatVisitDate,
} from "../lib/format";
import {
  ArrowLeft,
  CalendarDays,
  Users,
  Clock,
  Wallet,
  Tags,
  Search,
  Pencil,
  Route,
  MapPin,
  Compass,
  Loader2,
  TriangleAlert,
  Info,
  Car,
  CircleCheck,
} from "lucide-react";

// หน้ารายละเอียดทริป: สรุปทริป + แผนที่ยืนยันแล้ว (โหลดเองจาก tripId จึงเข้าตรงหรือ refresh ได้)

interface ScheduleItem {
  placeId: string;
  placeName: string;
  province: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  visitOrder: number;
  startTime: string | null;
  endTime: string | null;
  travelTimeFromPrev: number | null;
  distanceFromPrev: number | null;
  placeCost: number | null; // null = ไม่ทราบราคา
  visitDurationMin: number | null; // null = แผนที่บันทึกก่อนมีช่องกรอกเวลา
  isTimeConflict: boolean;
  isClosedConflict: boolean;
  isBudgetConflict: boolean;
  isHoursUnknown: boolean;
  isCostUnknown: boolean; // แยก "ไม่ทราบราคา" ออกจาก "ฟรี"
}

interface TripDay {
  tripDayId: string;
  dayNumber: number;
  visitDate: string;
  dailyBudget: number | null;
  items: ScheduleItem[];
}

interface TripSummary {
  province: string;
  city: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  numberOfPeople: number;
  useBudget: boolean;
  totalBudget: number;
  budgetScope: string | null;
  budgetPeriod: string | null;
  categories?: { category_id: string; category_name: string }[];
  tripStartLat: number;
  tripStartLng: number;
}

// response ของ GET /api/trips/:tripId (ชื่อคอลัมน์ตาม DB)
interface TripRow {
  province: string;
  district: string | null;
  start_date: string;
  end_date: string;
  start_time: string;
  number_of_people: number;
  use_budget: boolean;
  total_budget: number | null;
  budget_scope: string | null;
  budget_period: string | null;
  start_lat: number;
  start_lng: number;
  categories?: { category_id: string; category_name: string }[];
}

// response ของ GET /api/itinerary/trips/:tripId — ข้อมูลสถานที่อาจเป็น null
type SavedItineraryItemRow = Omit<ScheduleItem, "placeName" | "latitude" | "longitude"> & {
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
};

interface SavedItineraryDayRow extends Omit<TripDay, "items"> {
  items: SavedItineraryItemRow[];
}

interface SavedItineraryResponse {
  tripStartLat: number;
  tripStartLng: number;
  tripDays: SavedItineraryDayRow[];
}

function mapTripRow(row: TripRow): TripSummary {
  return {
    province: row.province,
    city: row.district,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    numberOfPeople: row.number_of_people,
    useBudget: row.use_budget,
    totalBudget: row.total_budget ?? 0,
    budgetScope: row.budget_scope,
    budgetPeriod: row.budget_period,
    categories: row.categories ?? [],
    tripStartLat: row.start_lat,
    tripStartLng: row.start_lng,
  };
}

function mapSavedDay(row: SavedItineraryDayRow): TripDay {
  return {
    tripDayId: row.tripDayId,
    dayNumber: row.dayNumber,
    visitDate: row.visitDate,
    dailyBudget: row.dailyBudget,
    items: row.items.map((item) => ({
      placeId: item.placeId,
      placeName: item.placeName ?? "ไม่พบชื่อสถานที่",
      province: item.province,
      district: item.district,
      latitude: item.latitude ?? 0,
      longitude: item.longitude ?? 0,
      visitOrder: item.visitOrder,
      startTime: item.startTime,
      endTime: item.endTime,
      travelTimeFromPrev: item.travelTimeFromPrev,
      distanceFromPrev: item.distanceFromPrev,
      placeCost: item.placeCost,
      visitDurationMin: item.visitDurationMin,
      isTimeConflict: item.isTimeConflict,
      isClosedConflict: item.isClosedConflict,
      isBudgetConflict: item.isBudgetConflict,
      isHoursUnknown: item.isHoursUnknown,
      isCostUnknown: item.isCostUnknown,
    })),
  };
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${s.toLocaleDateString("th-TH", opts)} - ${e.toLocaleDateString("th-TH", {
    ...opts,
    year: "numeric",
  })}`;
}

const BUDGET_SCOPE_LABELS: Record<string, string> = {
  GROUP: "ทั้งกลุ่ม",
  PER_PERSON: "ต่อคน",
};

const BUDGET_PERIOD_LABELS: Record<string, string> = {
  TOTAL_TRIP: "ทั้งทริป",
  PER_DAY: "ต่อวัน",
};

// เช่น " (ต่อคน · ทั้งทริป)" — ว่างถ้าไม่มีข้อมูล
function budgetSuffix(scope: string | null, period: string | null): string {
  const parts = [
    scope ? BUDGET_SCOPE_LABELS[scope] ?? scope : null,
    period ? BUDGET_PERIOD_LABELS[period] ?? period : null,
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

const cardClass =
  "bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)]";

const primaryBtn =
  "font-prompt font-medium min-h-11 px-5 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200 whitespace-nowrap";

const secondaryBtn =
  "font-prompt font-medium min-h-11 px-5 flex items-center justify-center gap-2 rounded-xl text-[color:var(--navy)] border-2 border-[color:var(--sky)] hover:bg-[color:var(--sky-soft)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200 whitespace-nowrap";

const ghostBtn =
  "font-prompt font-medium min-h-11 px-4 flex items-center justify-center gap-2 rounded-xl text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] active:scale-[0.98] transition-all duration-200 whitespace-nowrap";

// next = ที่ถัดไปในวันเดียวกัน — ช่วงเดินทางที่แสดงใต้การ์ดเป็นของ next (จากที่นี่ไปที่ถัดไป)
function TimelineStop({
  item,
  next,
  isLast,
}: {
  item: ScheduleItem;
  next?: ScheduleItem;
  isLast: boolean;
}) {
  return (
    <div className="relative pl-11">
      <div className="absolute left-0 top-0 flex flex-col items-center h-full">
        <span className="w-8 h-8 rounded-full bg-[color:var(--navy)] text-white text-sm font-prompt font-semibold flex items-center justify-center shrink-0">
          {item.visitOrder}
        </span>
        {!isLast && <span className="w-px flex-1 bg-[color:var(--line)] mt-1" />}
      </div>

      <div className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 mb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
          <h4 className="font-prompt font-medium text-[color:var(--navy)]">
            {item.placeName}
          </h4>
          <span className="flex items-center gap-1.5 text-sm font-prompt font-medium text-[color:var(--deep)] whitespace-nowrap">
            <Clock size={14} strokeWidth={1.75} />
            {formatTimeRange(item.startTime, item.endTime)}
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-sm text-[color:var(--muted)] mt-1">
          <MapPin size={14} strokeWidth={1.75} className="shrink-0" />
          {item.district ? `${item.district}, ` : ""}
          {item.province ?? ""}
        </p>

        {/* placeCost เป็น null ได้ ต้องเช็ค isCostUnknown ก่อน formatBaht ไม่งั้นหน้าพัง */}
        <p className="flex items-center gap-1.5 text-sm mt-1">
          <Wallet size={14} strokeWidth={1.75} className="shrink-0 text-[color:var(--muted)]" />
          {item.isCostUnknown ? (
            <span
              className="text-[color:var(--muted)] italic"
              title="สถานที่นี้ไม่มีข้อมูลราคาจาก Google"
            >
              ไม่ทราบราคาแน่ชัด
            </span>
          ) : (
            <span className="text-[color:var(--deep)]">
              {formatBaht(item.placeCost as number)}
            </span>
          )}
        </p>

        <ConflictBadges item={item} closedLabel="ปิดแล้วช่วงนี้" className="mt-3" />
      </div>

      {next && (next.travelTimeFromPrev !== null || next.distanceFromPrev !== null) && (
        <div className="mb-3 flex items-center gap-2 w-fit max-w-full rounded-full bg-[color:var(--sky-soft)] px-3.5 py-1.5 text-sm">
          <Car size={16} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
          <span className="font-prompt font-medium text-[color:var(--navy)]">
            {next.travelTimeFromPrev !== null
              ? `เดินทาง ${formatTravelTime(next.travelTimeFromPrev)}`
              : "เดินทาง"}
          </span>
          {next.distanceFromPrev !== null && (
            <span className="text-[color:var(--muted)]">
              · {formatDistance(next.distanceFromPrev)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function TripDetail() {
  const { tripId: tripIdParam } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [days, setDays] = useState<TripDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // error ของปุ่ม "แก้ไขเส้นทาง" แยกจาก error ตอนโหลดหน้า
  const [preparingEdit, setPreparingEdit] = useState(false);
  const [editActionError, setEditActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }
    if (!tripIdParam) {
      setLoadError("ไม่พบรหัสทริป");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      try {
        const authHeader = { Authorization: `Bearer ${session!.access_token}` };

        const [tripRes, itineraryRes] = await Promise.all([
          fetch(`/api/trips/${tripIdParam}`, { headers: authHeader }),
          fetch(`/api/itinerary/trips/${tripIdParam}`, { headers: authHeader }),
        ]);

        const tripData = await tripRes.json();
        if (!tripRes.ok) {
          throw new Error(tripData.message || "ไม่พบข้อมูลทริปนี้");
        }

        const itineraryData: SavedItineraryResponse = await itineraryRes.json();
        if (!itineraryRes.ok) {
          throw new Error(
            (itineraryData as { message?: string }).message || "ดึงข้อมูลแผนเดินทางไม่สำเร็จ"
          );
        }

        if (cancelled) return;

        setTrip(mapTripRow(tripData.trip));
        setDays(itineraryData.tripDays.map(mapSavedDay));
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setLoadError(errorText(err, "เกิดข้อผิดพลาดในการโหลดแผนการเดินทาง"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tripIdParam]);

  const mapDays = useMemo(() => {
    if (!days) return [];
    return days.map((day) => ({
      tripDayId: day.tripDayId,
      dayNumber: day.dayNumber,
      items: day.items.map((item) => ({
        placeId: item.placeId,
        lat: item.latitude,
        lng: item.longitude,
        placeName: item.placeName,
        visitOrder: item.visitOrder,
      })),
    }));
  }, [days]);

  const totals = useMemo(() => {
    if (!days) return { cost: 0, places: 0 };
    let cost = 0;
    let places = 0;
    for (const day of days) {
      for (const item of day.items) {
        // ไม่ทราบราคาไม่นับเข้ายอดรวม (แบบเดียวกับ itineraryBuilder)
        cost += item.placeCost ?? 0;
        places += 1;
      }
    }
    return { cost, places };
  }, [days]);

  // "แก้ไขเส้นทาง": editor ต้องได้ state.draft + places เสมอ จึงโหลดข้อมูลสถานที่ล่าสุด + สร้าง draft ใหม่
  // แล้วใส่แผนที่บันทึกไว้เป็น items (draft ไม่จัดลงวันให้) พร้อมเวลาที่เคยกรอก · ยังไม่มีสถานที่ = ไปหน้าเลือกสถานที่
  async function handleEditRoute() {
    if (!session || !tripIdParam || !days) return;

    const placeIds = Array.from(
      new Set(days.flatMap((day) => day.items.map((item) => item.placeId)))
    );

    if (placeIds.length === 0) {
      navigate(`/trip/${tripIdParam}/recommendations`);
      return;
    }

    setPreparingEdit(true);
    setEditActionError(null);

    try {
      const authHeader = {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      };

      const placesRes = await fetch(`/api/places?ids=${placeIds.join(",")}`, {
        headers: authHeader,
      });
      const placesData = await placesRes.json();
      if (!placesRes.ok) {
        throw new Error(placesData.message || "โหลดข้อมูลสถานที่ไม่สำเร็จ");
      }

      const draftRes = await fetch(
        `/api/itinerary/trips/${tripIdParam}/draft`,
        {
          method: "POST",
          headers: authHeader,
          body: JSON.stringify({ place_ids: placeIds }),
        }
      );
      const draftData = await draftRes.json();
      if (!draftRes.ok) {
        throw new Error(draftData.message || "จัดร่างเส้นทางใหม่ไม่สำเร็จ");
      }

      const mergedPlaces = (placesData.places ?? []).map((place: { place_id: string }) => ({
        placeId: place.place_id,
        place,
      }));

      navigate(`/trip/${tripIdParam}/editor`, {
        state: {
          tripId: tripIdParam,
          draft: {
            ...draftData,
            items: days.flatMap((day) =>
              day.items.map((item) => ({ ...item, tripDayId: day.tripDayId }))
            ),
          },
          places: mergedPlaces,
          visitDurations: Object.fromEntries(
            days.flatMap((day) =>
              day.items
                .filter((item) => item.visitDurationMin !== null)
                .map((item) => [item.placeId, item.visitDurationMin])
            )
          ),
        },
      });
    } catch (err) {
      console.error(err);
      setEditActionError(
        errorText(err, "เตรียมข้อมูลไปหน้าแก้ไขเส้นทางไม่สำเร็จ")
      );
    } finally {
      setPreparingEdit(false);
    }
  }

  if (loadError) {
    return (
      <div className="font-sarabun min-h-screen bg-[color:var(--cream)] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <TriangleAlert
          size={32}
          strokeWidth={1.5}
          className="text-[color:var(--danger)]"
        />
        <p role="alert" className="text-[color:var(--danger)] font-prompt font-medium">
          {loadError}
        </p>
        <button onClick={() => navigate("/home")} className={secondaryBtn}>
          กลับหน้าหลัก
        </button>
      </div>
    );
  }

  if (loading || !trip || !days) {
    return (
      <div className="font-sarabun min-h-screen bg-[color:var(--cream)] flex items-center justify-center gap-3 text-[color:var(--muted)]">
        <Loader2
          size={20}
          strokeWidth={1.75}
          className="animate-spin text-[color:var(--sky)]"
        />
        กำลังโหลดแผนการเดินทาง...
      </div>
    );
  }

  const stats = [
    { icon: CalendarDays, value: String(days.length), label: "วัน" },
    { icon: MapPin, value: String(totals.places), label: "สถานที่" },
    { icon: Wallet, value: formatBaht(totals.cost), label: "งบที่ใช้ (ประมาณการ)" },
  ];

  return (
    <div className="font-sarabun min-h-screen bg-[color:var(--cream)] pb-16">
      <Navbar />

      <div className="fade-in max-w-5xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate("/home")}
          className="font-prompt text-sm font-medium text-[color:var(--navy)] flex items-center gap-1.5 mb-5 min-h-10 hover:text-[color:var(--deep)] transition-colors duration-200"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          กลับหน้าหลัก
        </button>

        <section className={`${cardClass} px-6 sm:px-8 py-6 mb-6`}>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-prompt font-medium px-2.5 py-1 rounded-full border bg-white mb-3 ${
              totals.places > 0
                ? "text-[color:var(--success)] border-[color:var(--success)]"
                : "text-[color:var(--muted)] border-[color:var(--line)]"
            }`}
          >
            {totals.places > 0 ? (
              <CircleCheck size={14} strokeWidth={1.75} />
            ) : (
              <Info size={14} strokeWidth={1.75} />
            )}
            {totals.places > 0 ? "แผนยืนยันแล้ว" : "ยังไม่มีแผนเดินทาง"}
          </span>

          <h1 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
            {trip.province}
            {trip.city && (
              <span className="text-[color:var(--deep)] font-normal text-lg">
                {" "}
                · {trip.city}
              </span>
            )}
          </h1>

          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[color:var(--muted)]">
            <li className="flex items-center gap-2">
              <CalendarDays size={18} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
              {formatDateRange(trip.startDate, trip.endDate)}
            </li>
            <li className="flex items-center gap-2">
              <Users size={18} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
              {trip.numberOfPeople} คน
            </li>
            <li className="flex items-center gap-2">
              <Clock size={18} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
              เวลาเริ่ม {formatTime(trip.startTime)}
            </li>
            <li className="flex items-center gap-2">
              <Wallet size={18} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
              {trip.useBudget
                ? `${trip.totalBudget.toLocaleString()} บาท${budgetSuffix(
                    trip.budgetScope,
                    trip.budgetPeriod
                  )}`
                : "ไม่จำกัดงบ"}
            </li>
          </ul>

          {trip.categories && trip.categories.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Tags size={18} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
              {trip.categories.map((c) => (
                <span
                  key={c.category_id}
                  className="text-sm px-3 py-1 rounded-full border border-[color:var(--line)] text-[color:var(--navy)] bg-white"
                >
                  {c.category_name}
                </span>
              ))}
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-[color:var(--line)] flex flex-wrap gap-2">
            <button
              onClick={handleEditRoute}
              disabled={preparingEdit}
              className={primaryBtn}
            >
              {preparingEdit ? (
                <>
                  <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
                  กำลังเตรียมข้อมูล...
                </>
              ) : (
                <>
                  <Route size={18} strokeWidth={1.75} />
                  แก้ไขเส้นทาง
                </>
              )}
            </button>

            <button
              onClick={() => navigate(`/trip/${tripIdParam}/recommendations`)}
              className={secondaryBtn}
            >
              <Search size={18} strokeWidth={1.75} />
              แสดงสถานที่แนะนำ
            </button>

            <button
              onClick={() => navigate(`/trip/${tripIdParam}/edit`)}
              className={ghostBtn}
            >
              <Pencil size={18} strokeWidth={1.75} />
              แก้ไขข้อมูลทริป
            </button>
          </div>

          {editActionError && (
            <p
              role="alert"
              className="mt-3 flex items-center gap-2 text-sm text-[color:var(--danger)]"
            >
              <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0" />
              {editActionError}
            </p>
          )}
        </section>

        <div className="mb-6">
          <RouteMap
            startLat={trip.tripStartLat}
            startLng={trip.tripStartLng}
            days={mapDays}
          />
        </div>

        <ul className="grid grid-cols-3 gap-3 mb-6">
          {stats.map(({ icon: Icon, value, label }) => (
            <li key={label} className={`${cardClass} px-3 py-4 text-center`}>
              <Icon
                size={20}
                strokeWidth={1.75}
                className="mx-auto mb-1.5 text-[color:var(--sky)]"
              />
              <p className="font-prompt font-semibold text-xl text-[color:var(--navy)]">
                {value}
              </p>
              <p className="text-sm text-[color:var(--muted)]">{label}</p>
            </li>
          ))}
        </ul>

        {totals.places === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-[color:var(--line)] px-6 py-12 flex flex-col items-center gap-3 text-center">
            <Compass
              size={40}
              strokeWidth={1.5}
              className="text-[color:var(--sky)]"
            />
            <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">
              ทริปนี้ยังไม่มีแผนเดินทางที่ยืนยันแล้ว
            </h2>
            <p className="text-sm text-[color:var(--muted)] max-w-md">
              เริ่มจากเลือกสถานที่ที่สนใจก่อน ระบบจะช่วยจัดร่างเส้นทางให้อัตโนมัติ
            </p>
            <button
              onClick={() => navigate(`/trip/${tripIdParam}/recommendations`)}
              className={`${primaryBtn} mt-2`}
            >
              <Search size={18} strokeWidth={1.75} />
              ไปเลือกสถานที่แนะนำ
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {days.map((day) => (
              <section key={day.tripDayId} className={`${cardClass} px-5 sm:px-6 py-5`}>
                <div className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
                  <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">
                    วันที่ {day.dayNumber}
                    <span className="font-normal text-[color:var(--deep)] text-base">
                      {" "}
                      — {formatVisitDate(day.visitDate, "long")}
                    </span>
                  </h2>
                  {day.dailyBudget !== null && (
                    <span className="text-sm text-[color:var(--muted)]">
                      งบวันนี้ {formatBaht(day.dailyBudget)}/คน
                    </span>
                  )}
                </div>

                {day.items.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted)] py-4 text-center">
                    ไม่มีสถานที่ในวันนี้
                  </p>
                ) : (
                  day.items.map((item, idx) => (
                    <TimelineStop
                      key={item.placeId}
                      item={item}
                      next={day.items[idx + 1]}
                      isLast={idx === day.items.length - 1}
                    />
                  ))
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}