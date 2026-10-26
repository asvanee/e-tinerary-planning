import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../../../components/navbar";
import { useAuth } from "../../../../system/auth/useAuth";
import AutoTripDurationForm from "../../recommendations/AutoTripDurationForm";
import type {
  AutoTripResponse,
  AutoTripStop,
} from "./autoTripTypes";
import RouteMap from "../components/RouteMap";
import {
  ArrowLeft,
  CalendarDays,
  Car,
  CircleCheck,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Search,
  Sparkles,
  Star,
  Timer,
  TriangleAlert,
} from "lucide-react";

// ---------- Style constants (ใช้ token จาก global.css ชุดเดียวกับหน้า TripDetail) ----------

const cardClass = "bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)]";

const primaryBtn =
  "font-prompt font-medium min-h-11 px-5 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200 whitespace-nowrap";

const secondaryBtn =
  "font-prompt font-medium min-h-11 px-5 flex items-center justify-center gap-2 rounded-xl text-[color:var(--navy)] border-2 border-[color:var(--sky)] hover:bg-[color:var(--sky-soft)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200 whitespace-nowrap";

const ghostBtn =
  "font-prompt font-medium min-h-11 px-4 flex items-center justify-center gap-2 rounded-xl text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] active:scale-[0.98] transition-all duration-200 whitespace-nowrap";

// ---------- Main page ----------

export default function AutoTrip() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [data, setData] = useState<AutoTripResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const getDayStops = (dayIndex: number): AutoTripStop[] => {
    if (!data || !data.days || !data.days[dayIndex]) {
      return [];
    }

    return data.days[dayIndex].stops ?? [];
  };

  const allStops = useMemo(() => {
    if (!data || !data.days) {
      return [];
    }

    return data.days.flatMap((day) => day.stops ?? []);
  }, [data]);

  // ---- สรุปทั้งทริป ----
  const totalPlaces = allStops.length;
  const totalDays = data?.days?.length ?? 0;
  const totalDistance =
    data?.total_distance_km ??
    data?.days?.reduce((sum, day) => sum + (day.total_distance_km ?? 0), 0) ??
    0;

  const currentDay = data?.days?.[selectedDay];
  const currentStops = getDayStops(selectedDay);

  const mapDays = useMemo(
    () =>
      (data?.days ?? []).map((day) => ({
        tripDayId: `auto-day-${day.day}`,
        dayNumber: day.day,
        items: (day.stops ?? []).map((stop, index) => ({
          placeId: stop.place_id,
          lat: Number(stop.latitude),
          lng: Number(stop.longitude),
          placeName: stop.place_name,
          visitOrder: index + 1,
        })),
      })),
    [data?.days]
  );

  // ---- format ----
  const formatDate = (date?: string) => {
    if (!date) {
      return "";
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatDuration = (minutes?: number | null) => {
    if (minutes == null) {
      return "-";
    }

    if (minutes < 60) {
      return `${minutes} นาที`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (mins === 0) {
      return `${hours} ชม.`;
    }

    return `${hours} ชม. ${mins} นาที`;
  };

  const formatDistance = (distance?: number | null) => {
    if (distance == null) {
      return "-";
    }

    return `${Number(distance).toFixed(1)} กม.`;
  };

  // ---- actions ----
  const openGoogleMaps = (latitude: number, longitude: number) => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleBack = () => {
    navigate(`/trip/${tripId}/recommendations`);
  };

  // ⚠️ editor ต้องการ state.draft + state.places จึงเด้งกลับหน้า recommendations (Known Issue #10)
  const handleEditTrip = () => {
    navigate(`/trip/${tripId}/editor`, {
      state: {
        autoTrip: data,
        tripId,
      },
    });
  };

  // บันทึกผ่าน PUT /api/itinerary/trips/:tripId (backend re-validate ซ้ำก่อนบันทึก)
  const handleConfirmTrip = async () => {
    if (!data || !tripId || !session) {
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      // 1. trip_days ของทริป (GET /api/itinerary/trips/:tripId คืน tripDays เรียงตาม dayNumber)
      const itineraryResponse = await fetch(`/api/itinerary/trips/${tripId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const itineraryText = await itineraryResponse.text();

      let itineraryResult: { message?: string; tripDays?: { tripDayId: string }[] };

      try {
        itineraryResult = JSON.parse(itineraryText);
      } catch {
        throw new Error(
          `ไม่สามารถอ่านข้อมูลวันเดินทางได้ (status ${itineraryResponse.status})`
        );
      }

      if (!itineraryResponse.ok) {
        throw new Error(itineraryResult.message || "ไม่สามารถดึงข้อมูลวันเดินทางได้");
      }

      const tripDays = itineraryResult.tripDays ?? [];

      if (!Array.isArray(tripDays) || tripDays.length === 0) {
        throw new Error("ไม่พบข้อมูลวันเดินทางของทริปนี้ใน Supabase");
      }

      // 2. payload: วันใน Auto Trip ใช้เลขวันจริง ซึ่งอาจข้ามวันที่ไม่มีสถานที่
      const days =
        data.days?.map((day) => {
          const tripDayId = tripDays[day.day - 1]?.tripDayId;

          if (!tripDayId) {
            throw new Error(`ไม่พบ trip_day_id ของวันที่ ${day.day}`);
          }

          return {
            trip_day_id: tripDayId,
            place_ids: day.stops.map((stop) => stop.place_id),
          };
        }) ?? [];

      if (days.length === 0) {
        throw new Error("ไม่มีข้อมูลวันที่ต้องการบันทึก");
      }

      const visit_durations = Object.fromEntries(
        allStops.map((stop) => [stop.place_id, stop.duration_min])
      );

      // 3. บันทึก
      const response = await fetch(`/api/itinerary/trips/${tripId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          days,
          visit_durations,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "บันทึกแผนเดินทางไม่สำเร็จ");
      }

      setSaveMessage("บันทึกแผนเดินทางลงฐานข้อมูลสำเร็จ");

      setTimeout(() => {
        navigate(`/trip/${tripId}/detail`);
      }, 1000);
    } catch (err) {
      console.error("❌ SAVE AUTO TRIP ERROR:", err);

      setSaveMessage(
        (err as { message?: string } | null)?.message || "บันทึกแผนเดินทางไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!tripId || !session) {
    return (
      <div className="font-sarabun min-h-screen bg-[color:var(--cream)]">
        <Navbar />
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-[color:var(--muted)]">
          {!tripId ? "ไม่พบรหัสทริป" : "กรุณาเข้าสู่ระบบ"}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="font-sarabun min-h-screen bg-[color:var(--cream)]">
        <Navbar />
        <div className="fade-in max-w-xl mx-auto px-4 py-16">
          <div className={`${cardClass} px-6 py-10 flex flex-col items-center gap-3 text-center`}>
            <h1 className="font-prompt font-semibold text-2xl text-[color:var(--navy)]">
              กำหนดเวลาเที่ยว
            </h1>
            <AutoTripDurationForm
              tripId={tripId}
              accessToken={session.access_token}
              onGenerated={(result) => {
                setData(result);
                setSelectedDay(0);
              }}
            />
            <button onClick={handleBack} className={secondaryBtn}>
              <ArrowLeft size={18} strokeWidth={1.75} />
              กลับ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { icon: CalendarDays, value: String(totalDays), label: "วันเดินทาง" },
    { icon: MapPin, value: String(totalPlaces), label: "สถานที่ทั้งหมด" },
    { icon: Car, value: Number(totalDistance).toFixed(1), label: "กิโลเมตรรวม" },
    {
      icon: Star,
      value:
        totalPlaces > 0
          ? (allStops.reduce((sum, stop) => sum + (stop.poiScore ?? 0), 0) / totalPlaces).toFixed(2)
          : "0.00",
      label: "POI Score เฉลี่ย",
    },
  ];

  return (
    <div className="font-sarabun min-h-screen bg-[color:var(--cream)] pb-16">
      <Navbar />

      <div className="fade-in max-w-5xl mx-auto px-4 py-6">
        <button
          onClick={handleBack}
          className="font-prompt text-sm font-medium text-[color:var(--navy)] flex items-center gap-1.5 mb-5 min-h-10 hover:text-[color:var(--deep)] transition-colors duration-200"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          กลับสถานที่แนะนำ
        </button>

        {/* ---- Header ---- */}
        <section className={`${cardClass} px-6 sm:px-8 py-6 mb-6`}>
          <span className="inline-flex items-center gap-1.5 text-xs font-prompt font-medium px-2.5 py-1 rounded-full border bg-white mb-3 text-[color:var(--navy)] border-[color:var(--sky)]">
            <Sparkles size={14} strokeWidth={1.75} />
            Auto Trip
          </span>
          <h1 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
            ทริปของคุณพร้อมแล้ว
          </h1>
          <p className="mt-1 text-[color:var(--muted)]">
            ระบบจัดลำดับสถานที่ให้โดยอัตโนมัติ โดยคำนึงถึงระยะทาง เวลา และข้อจำกัดของทริป
          </p>

          {/* Actions */}
          <div className="mt-6 pt-5 border-t border-[color:var(--line)] flex flex-wrap gap-2">
            <button onClick={handleConfirmTrip} disabled={saving} className={primaryBtn}>
              {saving ? (
                <>
                  <Loader2 size={18} strokeWidth={1.75} className="animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <CircleCheck size={18} strokeWidth={1.75} />
                  ยืนยันและบันทึกทริป
                </>
              )}
            </button>
            <button onClick={handleEditTrip} className={secondaryBtn}>
              <Pencil size={18} strokeWidth={1.75} />
              แก้ไขเส้นทาง
            </button>
            <button onClick={handleBack} className={ghostBtn}>
              <Search size={18} strokeWidth={1.75} />
              เลือกสถานที่ใหม่
            </button>
          </div>

          {/* ⚠️ "ไม่สำเร็จ" ก็มีคำว่า "สำเร็จ" จึงเป็นสีเขียวด้วย (Known Issue #32) */}
          {saveMessage && (
            <p
              role="status"
              className={`mt-3 flex items-center gap-2 text-sm ${
                saveMessage.includes("สำเร็จ") ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"
              }`}
            >
              {saveMessage.includes("สำเร็จ") ? (
                <CircleCheck size={16} strokeWidth={1.75} className="shrink-0" />
              ) : (
                <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0" />
              )}
              {saveMessage}
            </p>
          )}
        </section>

        {/* ---- สรุปตัวเลข ---- */}
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {stats.map(({ icon: Icon, value, label }) => (
            <li key={label} className={`${cardClass} px-3 py-4 text-center`}>
              <Icon size={20} strokeWidth={1.75} className="mx-auto mb-1.5 text-[color:var(--sky)]" />
              <p className="font-prompt font-semibold text-xl text-[color:var(--navy)]">{value}</p>
              <p className="text-sm text-[color:var(--muted)]">{label}</p>
            </li>
          ))}
        </ul>

        {/* ---- เลือกวัน ---- */}
        <div role="tablist" aria-label="เลือกวัน" className="flex flex-wrap gap-2 mb-4">
          {data.days?.map((day, index) => {
            const stops = getDayStops(index);
            const active = selectedDay === index;
            return (
              <button
                key={index}
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedDay(index)}
                className={`font-prompt text-left px-4 py-2 rounded-xl border transition-colors duration-200 ${
                  active
                    ? "text-white bg-[color:var(--navy)] border-[color:var(--navy)]"
                    : "text-[color:var(--navy)] bg-white border-[color:var(--line)] hover:bg-[color:var(--sky-soft)]"
                }`}
              >
                <span className="block font-medium">วันที่ {day.day}</span>
                <span className={`block text-xs ${active ? "text-white/80" : "text-[color:var(--muted)]"}`}>
                  {formatDate(day.date)} · {stops.length} สถานที่
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- แผนที่ทุกวัน ใช้ Leaflet + OSM + ORS Directions ร่วมกับหน้า editor ---- */}
        <div className="mb-6">
          <RouteMap
            startLat={data.start_lat}
            startLng={data.start_lng}
            days={mapDays}
          />
        </div>

        {/* ---- กำหนดการของวันที่เลือก ---- */}
        <section className={`${cardClass} px-5 sm:px-6 py-5`}>
          <div className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">
              {currentDay ? `วันที่ ${currentDay.day}` : "สถานที่ในวันนี้"}
              {currentDay && (
                <span className="font-normal text-[color:var(--deep)] text-base"> — {formatDate(currentDay.date)}</span>
              )}
            </h2>
            {currentDay && (
              <span className="flex items-center gap-1.5 text-sm text-[color:var(--muted)]">
                <Clock size={14} strokeWidth={1.75} />
                เที่ยว {formatDuration(currentDay.total_visit_time_min)} · เดินทาง{" "}
                {formatDuration(currentDay.total_travel_time_min)}
              </span>
            )}
          </div>

          {currentStops.length === 0 ? (
            <p className="text-sm text-[color:var(--muted)] py-4 text-center">ไม่มีสถานที่ในวันนี้</p>
          ) : (
            currentStops.map((stop, index) => {
              const score = stop.poiScore ?? 0;
              const isLast = index === currentStops.length - 1;
              return (
                <div key={`${stop.place_id}-${index}`} className="relative pl-11">
                  {/* จุดกลม + เส้นแนวตั้งของ timeline */}
                  <div className="absolute left-0 top-0 flex flex-col items-center h-full">
                    <span className="w-8 h-8 rounded-full bg-[color:var(--navy)] text-white text-sm font-prompt font-semibold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    {!isLast && <span className="w-px flex-1 bg-[color:var(--line)] mt-1" />}
                  </div>

                  {/* การเดินทางจากจุดก่อนหน้ามาถึงที่นี่ */}
                  <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 w-fit max-w-full rounded-full bg-[color:var(--sky-soft)] px-3.5 py-1.5 text-sm">
                    <Car size={16} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
                    <span className="text-[color:var(--navy)]">เดินทางจาก: {stop.previous_place_name}</span>
                    {stop.travel_distance_km > 0 && (
                      <span className="text-[color:var(--muted)]">· {formatDistance(stop.travel_distance_km)}</span>
                    )}
                    {stop.travel_time_min > 0 && (
                      <span className="text-[color:var(--muted)]">· ใช้เวลา {formatDuration(stop.travel_time_min)}</span>
                    )}
                  </div>

                  <div className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-3 mb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-prompt font-medium text-[color:var(--navy)]">{stop.place_name}</h3>
                        {stop.categoryName && (
                          <span className="mt-1 inline-block text-xs px-2.5 py-0.5 rounded-full bg-[color:var(--sky-soft)] text-[color:var(--navy)]">
                            {stop.categoryName}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-prompt font-semibold text-2xl leading-none text-[color:var(--navy)]">
                          {score > 1 ? score : (score * 100).toFixed(0)}
                        </p>
                        <p className="text-xs text-[color:var(--muted)] mt-1">POI Score</p>
                      </div>
                    </div>

                    <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-[color:var(--deep)]">
                      <li className="flex items-center gap-1.5">
                        <Clock size={14} strokeWidth={1.75} className="shrink-0 text-[color:var(--muted)]" />
                        เวลาเข้าชม {stop.start_time} - {stop.end_time}
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Timer size={14} strokeWidth={1.75} className="shrink-0 text-[color:var(--muted)]" />
                        ระยะเวลาเที่ยว {formatDuration(stop.duration_min)}
                      </li>
                    </ul>

                    <button
                      onClick={() => openGoogleMaps(stop.latitude, stop.longitude)}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-[color:var(--deep)] underline underline-offset-2 hover:text-[color:var(--navy)]"
                    >
                      <ExternalLink size={14} strokeWidth={1.75} />
                      ดูตำแหน่งบน Google Maps
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
