import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../auth/hooks/useAuth";
import RouteMap from "../e-tinerary/components/RouteMap";

/**
 * tripDetail.tsx
 *
 * ตำแหน่งไฟล์: frontend/src/features/trip/detail/TripDetail.tsx (พี่น้องกับ e-tinerary/,
 * create/, myTrips/, recommendations/ ภายใต้ trip/ — ไม่ได้ซ้อนอยู่ใน e-tinerary/)
 *
 * หน้าที่ user มาถึงหลังกด "ยืนยันแผน" ใน ItineraryEditor.tsx
 * Route: `/trip/:tripId/detail`
 *
 * ✅ ต่อ backend จริงแล้ว (ไม่ใช้ mock อีกต่อไป) — ยิง 2 endpoint พร้อมกัน:
 * - GET /api/trips/:tripId              (tripController.ts::getTripById)      -> ข้อมูลสรุปทริป
 * - GET /api/itinerary/trips/:tripId    (itineraryController.ts::getSavedItinerary)
 *   -> trip_days + itinerary items ที่ "ยืนยันแล้ว" เท่านั้น (join places มาให้แล้วในคำตอบเดียว)
 * ทั้งสอง endpoint ต้อง requireAuth เหมือนกัน — ใช้ session.access_token จาก useAuth()
 * ไม่ได้อ่าน state จาก router (ต่างจาก ItineraryEditor.tsx) เพราะหน้านี้ต้องเข้าตรงๆ ได้
 * (refresh / มาจาก MyTrips) โดยไม่มี state ติดมาด้วย
 */

// ---------- Types (ให้ตรงกับ ItineraryItemResult / PlaceInfo ที่ใช้จริงในโปรเจกต์) ----------

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
  placeCost: number;
  isTimeConflict: boolean;
  isClosedConflict: boolean;
  isBudgetConflict: boolean;
  isHoursUnknown: boolean;
}

interface TripDay {
  tripDayId: number;
  dayNumber: number;
  visitDate: string;
  dailyBudget: number | null;
  items: ScheduleItem[];
}

interface TripSummary {
  tripId: string;
  province: string;
  city: string | null;
  startDate: string;
  endDate: string;
  numberOfPeople: number;
  totalBudget: number;
  tripStartLat: number;
  tripStartLng: number;
}

// ---------- Raw response types จาก backend (snake_case ตรงกับ DB) ----------

interface TripRow {
  trip_id: string;
  province: string;
  district: string | null;
  start_date: string;
  end_date: string;
  number_of_people: number;
  total_budget: number | null;
  start_lat: number;
  start_lng: number;
}

interface SavedItineraryItemRow {
  placeId: string;
  placeName: string | null;
  province: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  visitOrder: number;
  startTime: string | null;
  endTime: string | null;
  travelTimeFromPrev: number | null;
  distanceFromPrev: number | null;
  placeCost: number;
  isTimeConflict: boolean;
  isClosedConflict: boolean;
  isBudgetConflict: boolean;
  isHoursUnknown: boolean;
}

interface SavedItineraryDayRow {
  tripDayId: number;
  dayNumber: number;
  visitDate: string;
  dailyBudget: number | null;
  items: SavedItineraryItemRow[];
}

interface SavedItineraryResponse {
  tripStartLat: number;
  tripStartLng: number;
  tripDays: SavedItineraryDayRow[];
}

// mapper: TripRow (snake_case จาก GET /api/trips/:tripId) -> TripSummary ที่ component ใช้แสดงผล
function mapTripRow(row: TripRow): TripSummary {
  return {
    tripId: row.trip_id,
    province: row.province,
    city: row.district,
    startDate: row.start_date,
    endDate: row.end_date,
    numberOfPeople: row.number_of_people,
    totalBudget: row.total_budget ?? 0,
    tripStartLat: row.start_lat,
    tripStartLng: row.start_lng,
  };
}

// mapper: SavedItineraryDayRow (จาก GET /api/itinerary/trips/:tripId) -> TripDay ที่ component ใช้
// (แทบเหมือนกันอยู่แล้วเพราะ backend คืน camelCase มาให้ตรงกับ ItineraryItemResult เป๊ะ แค่ items
// ต้องแปลงเป็น ScheduleItem — จริงๆ shape ตรงกันหมดเลย แยกไว้เผื่ออนาคต backend เปลี่ยน field)
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
      isTimeConflict: item.isTimeConflict,
      isClosedConflict: item.isClosedConflict,
      isBudgetConflict: item.isBudgetConflict,
      isHoursUnknown: item.isHoursUnknown,
    })),
  };
}

// ---------- Helpers (เหมือน ItineraryEditor.tsx เพื่อให้ format ตรงกันทั้งแอป) ----------

function formatTime(time: string | null): string {
  if (!time) return "—";
  return time.slice(0, 5) + " น.";
}

function formatVisitDate(visitDate: string): string {
  const date = new Date(visitDate + "T00:00:00");
  return date.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
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

function formatBaht(amount: number): string {
  return amount.toLocaleString("th-TH") + " ฿";
}

// ---------- Conflict badges (คัดลอก convention เดียวกับ ItineraryEditor.tsx) ----------

function ConflictBadges({ item }: { item: ScheduleItem }) {
  const badges: { label: string; className: string }[] = [];

  if (item.isClosedConflict) {
    badges.push({ label: "ปิดแล้วช่วงนี้", className: "bg-red-100 text-red-700 border border-red-200" });
  }
  if (item.isTimeConflict) {
    badges.push({ label: "เวลาไม่พอ", className: "bg-orange-100 text-orange-700 border border-orange-200" });
  }
  if (item.isBudgetConflict) {
    badges.push({ label: "งบเกิน", className: "bg-purple-100 text-purple-700 border border-purple-200" });
  }
  if (item.isHoursUnknown) {
    badges.push({ label: "ไม่ทราบเวลาเปิด-ปิด", className: "bg-amber-50 text-amber-700 border border-amber-300" });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((b) => (
        <span key={b.label} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${b.className}`}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ---------- Timeline card (ต่างจาก editor: มีเส้น timeline + ระยะทาง/เวลาเดินทางคั่นระหว่างจุด) ----------

function TimelineStop({ item, isLast }: { item: ScheduleItem; isLast: boolean }) {
  return (
    <div className="relative pl-10">
      {/* จุดกลม + เส้นแนวตั้งของ timeline */}
      <div className="absolute left-0 top-0 flex flex-col items-center h-full">
        <div className="w-7 h-7 rounded-full bg-[#102a6b] text-white text-xs font-prompt font-bold flex items-center justify-center flex-shrink-0">
          {item.visitOrder}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-[#5990c0]/30 mt-1" />}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-black/5 px-4 py-3 mb-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-prompt font-semibold text-sm text-[#102a6b]">{item.placeName}</h4>
          <span className="text-xs font-prompt font-semibold text-[#015185] whitespace-nowrap">
            {formatTime(item.startTime)} - {formatTime(item.endTime)}
          </span>
        </div>
        <p className="text-xs text-[#5990c0] mt-0.5">
          {item.district ? `${item.district}, ` : ""}
          {item.province ?? ""}
        </p>
        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#015185]">
          <span>{formatBaht(item.placeCost)}</span>
        </div>
        <ConflictBadges item={item} />
      </div>

      {!isLast && item.travelTimeFromPrev !== null && (
        <div className="text-[11px] text-[#5990c0] mb-3 -mt-1.5 flex items-center gap-1.5">
          <span>↳ เดินทางต่อไปอีก {item.travelTimeFromPrev} นาที</span>
          {item.distanceFromPrev !== null && <span>({item.distanceFromPrev.toFixed(1)} กม.)</span>}
        </div>
      )}
    </div>
  );
}

// ---------- Main page ----------

export default function TripDetail() {
  const { tripId: tripIdParam } = useParams();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();

  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [days, setDays] = useState<TripDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ✅ เพิ่มใหม่: state เฉพาะปุ่ม "แก้ไขเส้นทาง" — แยกจาก loadError หลัก เพราะเป็นคนละ error
  // (โหลดหน้าไม่สำเร็จ vs กดปุ่มแล้วเตรียมข้อมูลไปหน้า editor ไม่สำเร็จ)
  const [preparingEdit, setPreparingEdit] = useState(false);
  const [editActionError, setEditActionError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
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
            (itineraryData as any).message || "ดึงข้อมูลแผนเดินทางไม่สำเร็จ"
          );
        }

        if (cancelled) return;

        setTrip(mapTripRow(tripData.trip));
        setDays(itineraryData.tripDays.map(mapSavedDay));
      } catch (err: any) {
        if (!cancelled) {
          console.error(err);
          setLoadError(err.message || "เกิดข้อผิดพลาดในการโหลดแผนการเดินทาง");
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
  }, [authLoading, session, tripIdParam]);

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
        cost += item.placeCost;
        places += 1;
      }
    }
    return { cost, places };
  }, [days]);

  /**
   * ✅ เพิ่มใหม่: กด "แก้ไขเส้นทาง"
   *
   * ItineraryEditor.tsx ต้องการ location.state.draft + .places เสมอ (ไม่มี fallback ดึงเองจาก
   * tripId) ดังนั้น navigate ตรงๆ จากหน้านี้จะค้างที่ "กำลังตรวจสอบข้อมูล..." ตลอดไป — ต้อง:
   * 1) ดึง place_ids ทั้งหมดจาก itinerary ที่บันทึกไว้แล้ว (ทุกวันรวมกัน, unique)
   * 2) ยิง GET /api/places?ids=... ใหม่ (เอาข้อมูลสถานที่ล่าสุด ไม่ใช้ของเก่าที่ cache ไว้ในหน้านี้
   *    เพราะ field ที่ TripDetail ดึงมาจาก itinerary ไม่ครบเท่า PlaceInfo ที่ Editor ต้องใช้ เช่น
   *    price_level, default_duration_min, opening_hours)
   * 3) ยิง POST /draft ซ้ำด้วยชุด place_ids เดิม — ให้ backend คำนวณ startTime/endTime/conflict
   *    ใหม่ทั้งหมดตาม placement algorithm เดียวกับตอนสร้างครั้งแรก (ยัดวันแรก + TSP) ไม่ใช้ค่าที่
   *    เคย confirm ไว้ตรงๆ เพราะ Editor คาดหวัง shape ผลลัพธ์แบบ draft เสมอ
   * 4) navigate ไป editor พร้อม state ชุดเดียวกับที่ TripRecommendations.tsx ส่งให้
   *
   * ถ้ายังไม่มีสถานที่เลย (totals.places === 0) ไม่มีอะไรให้ "แก้" — พาไปหน้าเลือกสถานที่แทน
   */
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

      // ⚠️ สมมติฐาน: GET /api/places?ids=... คืน { places: PlaceInfo[] } (snake_case ตรงกับ
      // PlaceInfo ใน ItineraryEditor.tsx) — ยังไม่เคยเห็น controller จริงของ endpoint นี้
      // ถ้า response shape จริงต่างจากนี้ ต้องแก้ตรงจุดนี้จุดเดียว
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

      const mergedPlaces = (placesData.places ?? []).map((place: any) => ({
        placeId: place.place_id,
        place,
      }));

      navigate(`/trip/${tripIdParam}/editor`, {
        state: {
          tripId: tripIdParam,
          draft: draftData,
          places: mergedPlaces,
        },
      });
    } catch (err: any) {
      console.error(err);
      setEditActionError(
        err.message || "เตรียมข้อมูลไปหน้าแก้ไขเส้นทางไม่สำเร็จ"
      );
    } finally {
      setPreparingEdit(false);
    }
  }

  if (loadError) {
    return (
      <div className="font-sarabun min-h-screen bg-[#fcedd3] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-red-600 font-prompt font-semibold">{loadError}</p>
        <button
          onClick={() => navigate("/home")}
          className="px-5 py-2.5 rounded-xl bg-white text-[#102a6b] font-prompt font-semibold shadow-md"
        >
          กลับหน้าหลัก
        </button>
      </div>
    );
  }

  if (loading || !trip || !days) {
    return (
      <div className="font-sarabun min-h-screen bg-[#fcedd3] flex items-center justify-center">
        <p className="text-[#5990c0]">กำลังโหลดแผนการเดินทาง...</p>
      </div>
    );
  }

  return (
    <div className="font-sarabun min-h-screen bg-[#fcedd3] pb-16">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 pt-6">
        <button
          onClick={() => navigate("/home")}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[#102a6b] font-prompt font-semibold shadow-md hover:shadow-lg hover:-translate-x-1 transition-all duration-200"
        >
          <span className="text-lg transition-transform duration-200 group-hover:-translate-x-1">←</span>
          <span>กลับหน้าหลัก</span>
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ---- Header สรุปทริป ---- */}
        <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-block text-[11px] font-prompt font-semibold text-[#fcedd3] bg-white/10 px-2.5 py-1 rounded-full mb-2">
                {totals.places > 0 ? "แผนยืนยันแล้ว" : "ยังไม่มีแผนเดินทาง"}
              </span>
              <h2 className="font-prompt font-bold text-2xl text-white mb-1">
                {trip.province}
                {trip.city && <span className="text-[#5990c0] font-normal text-lg"> · {trip.city}</span>}
              </h2>
              <p className="text-[#5990c0] text-sm">
                {formatDateRange(trip.startDate, trip.endDate)} · {trip.numberOfPeople} คน
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => navigate(`/trip/${tripIdParam}/recommendations`)}
                  className="px-5 py-2.5 rounded-xl bg-[#cea273] hover:bg-[#d4aa85] text-[#102a6b] font-prompt font-semibold text-sm shadow-md transition-colors whitespace-nowrap"
                >
                  🔍 แสดงสถานที่แนะนำ
                </button>

                {/* เพิ่มตรงนี้ */}
                <button
                  onClick={() =>
                    navigate(`/trip/${tripIdParam}/edit`)
                  }
                  className="px-5 py-2.5 rounded-xl bg-white text-[#102a6b] font-prompt font-semibold text-sm shadow-md hover:bg-gray-100 transition-colors whitespace-nowrap"
>
                ✏️ แก้ไขข้อมูลทริป
                </button>

                <button
                  onClick={handleEditRoute}
                  disabled={preparingEdit}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-prompt font-semibold text-sm border border-white/20 transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {preparingEdit ? "กำลังเตรียมข้อมูล..." : "แก้ไขเส้นทาง"}
                </button>
              </div>
              {editActionError && (
                <p className="text-xs text-red-200 max-w-xs text-right">
                  {editActionError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ---- แผนที่รวมทุกวัน ---- */}
        <div className="mb-6">
          <RouteMap startLat={trip.tripStartLat} startLng={trip.tripStartLng} days={mapDays} />
        </div>

        {/* ---- สรุปตัวเลข ---- */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-black/5 px-4 py-3 text-center">
            <p className="font-prompt font-bold text-lg text-[#102a6b]">{days.length}</p>
            <p className="text-xs text-[#5990c0]">วัน</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-black/5 px-4 py-3 text-center">
            <p className="font-prompt font-bold text-lg text-[#102a6b]">{totals.places}</p>
            <p className="text-xs text-[#5990c0]">สถานที่</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-black/5 px-4 py-3 text-center">
            <p className="font-prompt font-bold text-lg text-[#102a6b]">{formatBaht(totals.cost)}</p>
            <p className="text-xs text-[#5990c0]">งบที่ใช้ (ประมาณการ)</p>
          </div>
        </div>

        {/* ---- ตารางเวลารายวัน (timeline) ---- */}
        {totals.places === 0 ? (
          <div className="bg-white/60 border-2 border-dashed border-[#5990c0]/40 rounded-2xl px-6 py-10 text-center">
            <p className="font-prompt font-semibold text-[#102a6b] mb-2">
              ทริปนี้ยังไม่มีแผนเดินทางที่ยืนยันแล้ว
            </p>
            <p className="text-sm text-[#5990c0] mb-4">
              เริ่มจากเลือกสถานที่ที่สนใจก่อน ระบบจะช่วยจัดร่างเส้นทางให้อัตโนมัติ
            </p>
            <button
              onClick={() => navigate(`/trip/${tripIdParam}/recommendations`)}
              className="px-6 py-3 rounded-xl text-white font-bold bg-gradient-to-r from-[#102a6b] to-[#015185] shadow-md"
            >
              ไปเลือกสถานที่แนะนำ
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {days.map((day) => (
              <div key={day.tripDayId} className="bg-white/60 rounded-2xl px-5 py-5">
                <div className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
                  <h3 className="font-prompt font-bold text-base text-[#102a6b]">
                    วันที่ {day.dayNumber} — {formatVisitDate(day.visitDate)}
                  </h3>
                  {day.dailyBudget !== null && (
                    <span className="text-xs text-[#5990c0]">งบวันนี้ {formatBaht(day.dailyBudget)}</span>
                  )}
                </div>

                {day.items.length === 0 ? (
                  <p className="text-xs text-[#5990c0] py-4 text-center">ไม่มีสถานที่ในวันนี้</p>
                ) : (
                  day.items.map((item, idx) => (
                    <TimelineStop key={item.placeId} item={item} isLast={idx === day.items.length - 1} />
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}