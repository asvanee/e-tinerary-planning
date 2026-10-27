import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft, Check, ChevronDown, Clock, Globe, Info, ListChecks, Loader2, MapPin, Navigation, Phone,
  Plus, Route, SearchX, Sparkles, Star, Tag, TriangleAlert, Wallet, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../../system/auth/useAuth";
import RecommendationMap from "./RecommendationMap";
import { categoryColor } from "./categoryColors";
import type { MapFocus, MapPlace } from "./RecommendationMap";
import type { OpeningHours } from "../e-tinerary/lib/openingHoursChecker";
import { DAY_NAMES_TH, formatVisitDate } from "../lib/format";
import { closedTripDates, tripDates } from "../lib/openingDays";

// ตรงกับ DistanceSource ฝั่ง backend (orsDistance.ts) — ors = ระยะทางถนนจริงทั้งหมด
type DistanceSource = "ors" | "haversine" | "mixed";

interface PoiResult {
  placeId: string;
  categoryName: string;
  // 1 = ตรงหมวดที่เลือก · 0 = หมวดอื่นที่เติมเข้ามา · null = ไม่ได้เลือกหมวด (D-48)
  categoryScore: number | null;
  ratingScore: number | null; // null = ไม่มี rating (D-55)
  distanceScore: number;
  budgetScore: number | null;
  weatherScore: number;
  poiScore: number;
  placeCost: number | null;
  perPersonDailyBudget: number | null;
  priceNature: "free" | "paid"; // ใช้บอกว่าหมวดนี้มักไม่มีค่าใช้จ่ายเมื่อไม่ทราบราคา
  // แหล่งของระยะทางรายสถานที่ — ไม่มี = ใช้ distanceSource ระดับหน้าแทน
  distanceMethod?: "ors" | "haversine";
}

interface PlaceInfo {
  place_id: string;
  place_name: string;
  province: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  formatted_address: string | null;
  phone_number?: string | null;
  website?: string | null;
  opening_hours?: OpeningHours | null;
  user_ratings_total?: number | null;
  att_type_label?: string | null;
  att_category_label?: string | null;
}

interface MergedPlace extends PoiResult {
  place?: PlaceInfo;
}

// ---------- เวลาเปิด-ปิด (places.opening_hours) ----------
// โครงสร้างจริงตาม openingHoursChecker.ts: periods[{ open:{day,time:"HHMM"}, close?:{day,time} }]
// day: 0 = อาทิตย์ ... 6 = เสาร์ · เปิด 24 ชม. = มี period เดียวและไม่มี close
// · วันที่ปิดจะไม่มี period ของวันนั้นเลย · ไม่มี periods (หรือว่าง) = ไม่มีข้อมูล
// ใช้กติกาเดียวกับ openingHoursChecker.ts เพื่อให้ตัวเลขที่เห็นตรงกับป้ายเวลาเปิด-ปิดในหน้าจัดแผน

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // แสดงจันทร์ -> อาทิตย์

interface HoursView {
  rows: { day: string; text: string }[];
  summary: string | null; // ไม่ null = ทุกวันเหมือนกัน แสดงบรรทัดเดียวได้
}

// "0930" -> "09:30"
function toHHMM(p: { time?: unknown } | undefined): string | null {
  const t = p?.time;
  return typeof t === "string" && /^\d{4}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2)}` : null;
}

function parseOpeningHours(oh: OpeningHours | null | undefined): HoursView | null {
  const periods = oh?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;

  if (periods.length === 1 && !periods[0]?.close) {
    return {
      rows: DAY_ORDER.map((d) => ({ day: DAY_NAMES_TH[d], text: "เปิด 24 ชั่วโมง" })),
      summary: "เปิด 24 ชั่วโมง ทุกวัน",
    };
  }

  const byDay: string[][] = [[], [], [], [], [], [], []];
  for (const p of periods) {
    const day = p?.open?.day;
    const start = toHHMM(p?.open);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !start) continue;
    const end = toHHMM(p?.close);
    const overnight = p?.close && p.close.day !== day;
    byDay[day].push(
      end ? `${start} - ${end}${overnight ? " (ข้ามวัน)" : ""}` : `เปิดเวลา ${start}`
    );
  }

  const rows = DAY_ORDER.map((d) => ({
    day: DAY_NAMES_TH[d],
    // หลายช่วงในวันเดียว (เช่น พักเที่ยง) เรียงตามเวลาเริ่ม
    text: byDay[d].length ? [...byDay[d]].sort().join(", ") : "ปิด",
  }));
  const same = rows.every((r) => r.text === rows[0].text);
  return { rows, summary: same ? `เปิดทุกวัน ${rows[0].text}` : null };
}

function StateCard({
  icon: Icon,
  iconClass = "text-[color:var(--sky)]",
  title,
  text,
  children,
}: {
  icon: LucideIcon;
  iconClass?: string;
  title?: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="fade-in bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-8 py-14 flex flex-col items-center text-center gap-3"
    >
      <Icon size={44} strokeWidth={1.5} className={iconClass} />
      {title && (
        <h3 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">{title}</h3>
      )}
      <p className="text-sm text-[color:var(--muted)] max-w-md">{text}</p>
      {children}
    </div>
  );
}

function Metric({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: LucideIcon;
  tone?: "warn";
  title?: string;
  children: ReactNode;
}) {
  const warn = tone === "warn";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 ${
        warn ? "text-[color:var(--danger)] font-medium" : ""
      }`}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={`shrink-0 ${warn ? "text-[color:var(--danger)]" : "text-[color:var(--sky)]"}`}
      />
      {children}
    </span>
  );
}

const primaryBtn =
  "font-prompt font-medium min-h-12 px-6 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200";

const outlineBtn =
  "font-prompt font-medium min-h-12 px-6 flex items-center justify-center gap-2 rounded-xl text-[color:var(--navy)] bg-transparent border-2 border-[color:var(--sky)] hover:bg-[color:var(--sky-soft)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200";

export default function TripRecommendations() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // จำนวนที่ตรงหมวดที่เลือก — มีค่าเมื่อหมวดที่เลือกมีไม่ถึง 50 แห่ง และระบบเติมหมวดอื่น (D-48)
  const [filledMatchCount, setFilledMatchCount] = useState<number | null>(null);
  const [distanceSource, setDistanceSource] = useState<DistanceSource | null>(null);

  // State สำหรับเก็บรายการสถานที่ทั้งหมด
  const [places, setPlaces] = useState<MergedPlace[]>([]);

  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

  const [creatingRoute, setCreatingRoute] = useState(false);
  const [createRouteError, setCreateRouteError] = useState<string | null>(null);

  const [autoCreatingRoute, setAutoCreatingRoute] = useState(false);
  const [autoTripError, setAutoTripError] = useState<string | null>(null);

  // ตัวกรองหมวดหมู่ที่เลือกไว้ — null = แสดงทุกหมวดหมู่
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // แผนที่: view ใช้สลับแท็บรายการ/แผนที่บนมือถือ · focus ใช้สั่งให้แผนที่เลื่อนไปที่หมุด + ไฮไลต์การ์ด
  const [view, setView] = useState<"list" | "map">("list");
  const [focus, setFocus] = useState<MapFocus | null>(null);

  // ช่วงวันเดินทาง — ใช้เตือนบนการ์ดว่าสถานที่ปิดทั้งวันในวันไหนของทริป (คะแนน POI ไม่ได้ดูเวลาเปิด-ปิด)
  const [tripRange, setTripRange] = useState<{ start: string; end: string } | null>(null);

  useEffect(() => {
    if (!session || !tripId) return;
    let cancelled = false;

    fetch(`/api/trips/${tripId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { trip?: { start_date?: string; end_date?: string } } | null) => {
        const trip = data?.trip;
        if (!cancelled && trip?.start_date && trip.end_date) {
          setTripRange({ start: trip.start_date, end: trip.end_date });
        }
      })
      .catch((err) => console.error("Fetch trip dates error:", err)); // ไม่มีช่วงวัน = ไม่แสดงคำเตือน

    return () => {
      cancelled = true;
    };
  }, [tripId, session]);

  // กันเรียก calculate-poi ซ้ำสำหรับทริปเดิม (StrictMode / session เปลี่ยน reference)
  const fetchedForTripRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      navigate("/login");
      return;
    }

    if (!tripId) {
      setError("ไม่พบรหัสทริป");
      setLoading(false);
      return;
    }

    if (fetchedForTripRef.current === tripId) return;
    fetchedForTripRef.current = tripId;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const poiRes = await fetch(
          `/api/poi/trips/${tripId}/calculate-poi`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        const responseText = await poiRes.text();

        let poiData;
        try {
          poiData = JSON.parse(responseText);
        } catch {
          throw new Error(`API ไม่ได้ส่ง JSON กลับมา (status ${poiRes.status})`);
        }

        if (!poiRes.ok) {
          throw new Error(poiData.message || "คำนวณคะแนนสถานที่ไม่สำเร็จ");
        }

        const results: PoiResult[] = poiData.results ?? [];
        setFilledMatchCount(poiData.categoryFilled ? poiData.categoryMatchCount ?? 0 : null);
        setDistanceSource(poiData.distanceSource ?? null);

        if (results.length === 0) {
          setPlaces([]);
          return;
        }

        const ids = results.map((r) => r.placeId).join(",");

        const placesRes = await fetch(
          `/api/places?ids=${encodeURIComponent(ids)}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const placesData = await placesRes.json();

        if (!placesRes.ok) {
          throw new Error(placesData.message || "ดึงข้อมูลสถานที่ไม่สำเร็จ");
        }

        const placeMap = new Map<string, PlaceInfo>(
          (placesData.places as PlaceInfo[]).map((p) => [p.place_id, p])
        );

        const merged: MergedPlace[] = results.map((r) => ({
          ...r,
          place: placeMap.get(r.placeId),
        }));

        setPlaces(merged);
      } catch (err) {
        console.error(err);
        setError((err as { message?: string } | null)?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tripId, session, authLoading, navigate]);

  const togglePlace = (placeId: string) => {
    setSelectedPlaceIds((prev) =>
      prev.includes(placeId)
        ? prev.filter((id) => id !== placeId)
        : [...prev, placeId]
    );
  };

  const handleStartCustomMode = () => {
    setIsCustomMode(true);
    setSelectedPlaceIds([]);
  };

  const handleCancelCustomMode = () => {
    setIsCustomMode(false);
    setSelectedPlaceIds([]);
    setCreateRouteError(null);
  };

  const handleCreateRoute = async () => {
    if (!tripId || !session || selectedPlaceIds.length === 0) return;

    setCreatingRoute(true);
    setCreateRouteError(null);

    try {
      const res = await fetch(`/api/itinerary/trips/${tripId}/draft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ place_ids: selectedPlaceIds }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "สร้างเส้นทางไม่สำเร็จ");
      }

      const selectedPlaces = places.filter((p) =>
        selectedPlaceIds.includes(p.placeId)
      );

      navigate(`/trip/${tripId}/editor`, {
        state: {
          tripId,
          draft: data,
          places: selectedPlaces,
        },
      });
    } catch (err) {
      console.error(err);
      setCreateRouteError((err as { message?: string } | null)?.message || "เกิดข้อผิดพลาดในการสร้างเส้นทาง");
    } finally {
      setCreatingRoute(false);
    }
  };

  // เช็คว่ามีสถานที่สำหรับ Auto Trip (auto-places) ก่อนเปิดหน้า Auto Trip ซึ่งจัดทริปเอง
  const handleAutoTrip = async () => {
    if (!tripId || !session) return;

    setAutoCreatingRoute(true);
    setAutoTripError(null);

    try {
      const res = await fetch(
        `/api/itinerary/trips/${tripId}/auto-places`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.message || "จัดทริปอัตโนมัติไม่สำเร็จ"
        );
      }

      navigate(`/trip/${tripId}/auto`);
    } catch (err) {
      console.error("Auto Trip error:", err);

      setAutoTripError(
        (err as { message?: string } | null)?.message || "เกิดข้อผิดพลาดในการจัดทริปอัตโนมัติ"
      );
    } finally {
      setAutoCreatingRoute(false);
    }
  };

  // รายการหมวดหมู่ unique จากผลลัพธ์จริง ใช้ทำแถบกรองแนวนอน
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    places.forEach((p) => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return Array.from(set);
  }, [places]);

  // การ์ดที่จะแสดงจริงหลังกรองหมวดหมู่ (rank ยังอิงจาก places เต็มชุดเสมอ)
  const displayedPlaces = useMemo(() => {
    if (!selectedCategory) return places;
    return places.filter((p) => p.categoryName === selectedCategory);
  }, [places, selectedCategory]);

  // หมุดบนแผนที่ — ใช้ชุดเดียวกับการ์ดที่แสดงอยู่ (หลังกรองหมวดหมู่) เลขอันดับตรงกับบนการ์ด
  const mapPlaces = useMemo<MapPlace[]>(() => {
    const rank = new Map(places.map((p, i) => [p.placeId, i + 1]));
    return displayedPlaces.flatMap((item) => {
      const p = item.place;
      if (!p) return [];
      return [
        {
          placeId: item.placeId,
          name: p.place_name,
          lat: Number(p.latitude),
          lng: Number(p.longitude),
          categoryName: item.categoryName,
          rank: rank.get(item.placeId) ?? 0,
          score: Math.round(item.poiScore * 100),
        },
      ];
    });
  }, [places, displayedPlaces]);

  const handleShowOnMap = (placeId: string) => {
    setFocus({ id: placeId, nonce: Date.now() });
    setView("map");
  };

  const handleShowCard = (placeId: string) => {
    setFocus({ id: placeId, nonce: Date.now() });
    setView("list");
    // รอให้แท็บรายการ (มือถือ) แสดงก่อนค่อยเลื่อน
    setTimeout(() => {
      document
        .getElementById(`place-card-${placeId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const rankOf = new Map(places.map((p, i) => [p.placeId, i + 1]));


  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap min-h-10 px-4 rounded-full border text-sm active:scale-[0.98] transition-all duration-200 ${
      active
        ? "bg-[color:var(--navy)] border-[color:var(--navy)] text-white"
        : "bg-white border-[color:var(--line)] text-[color:var(--muted)] hover:border-[color:var(--sky)] hover:text-[color:var(--navy)]"
    }`;

  const renderCard = (item: MergedPlace) => {
    const selected = selectedPlaceIds.includes(item.placeId);
    const p = item.place;
    const method =
      item.distanceMethod ??
      (distanceSource === "ors" ? "ors" : distanceSource ? "haversine" : null);
    const approx = method === "haversine";
    const hours = parseOpeningHours(p?.opening_hours);
    // วันของทริปที่สถานที่นี้ปิดทั้งวัน (ไม่มีข้อมูลเวลาเปิด-ปิด = ไม่เตือน)
    const closedDates = tripRange
      ? closedTripDates(p?.opening_hours, tripRange.start, tripRange.end)
      : [];
    const closedAllTrip =
      tripRange !== null &&
      closedDates.length > 0 &&
      closedDates.length === tripDates(tripRange.start, tripRange.end).length;

    return (
      <li
        key={item.placeId}
        id={`place-card-${item.placeId}`}
        className={`flex items-start gap-4 bg-white rounded-2xl border-2 p-4 sm:p-5 [box-shadow:var(--shadow)] transition-colors duration-200 ${
          isCustomMode && selected
            ? "border-[color:var(--navy)]"
            : "border-[color:var(--line)]"
        } ${isCustomMode && !selected ? "opacity-80" : ""} ${
          focus?.id === item.placeId ? "ring-2 ring-[color:var(--sky)]" : ""
        }`}
      >
        <span className="shrink-0 w-10 h-10 rounded-full bg-[color:var(--navy)] text-white font-prompt font-semibold flex items-center justify-center">
          {rankOf.get(item.placeId)}
        </span>

        <div className="flex-1 min-w-0">
          <h3 className="font-prompt font-semibold text-base text-[color:var(--navy)]">
            {p?.place_name ?? "ไม่พบชื่อสถานที่"}
          </h3>
          <p className="flex items-center gap-1 text-sm text-[color:var(--muted)] mt-0.5">
            <MapPin size={14} strokeWidth={1.75} className="shrink-0" />
            {p?.district ? `${p.district}, ` : ""}
            {p?.province ?? ""}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.categoryName && (
              <span className="px-3 py-1 rounded-full bg-[color:var(--sky-soft)] text-xs font-medium text-[color:var(--navy)]">
                {item.categoryName}
              </span>
            )}
            {p?.att_category_label && (
              <span className="px-3 py-1 rounded-full border border-[color:var(--line)] text-xs text-[color:var(--muted)]">
                {p.att_category_label}
              </span>
            )}
          </div>

          {(p?.phone_number || p?.website) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[color:var(--deep)]">
              {p.phone_number && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={16} strokeWidth={1.75} className="shrink-0" />
                  {p.phone_number}
                </span>
              )}
              {p.website && (
                <a
                  href={p.website.startsWith("http") ? p.website : `https://${p.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:text-[color:var(--navy)] transition-colors duration-200"
                >
                  <Globe size={16} strokeWidth={1.75} className="shrink-0" />
                  <span className="truncate max-w-[180px]">
                    {p.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]}
                  </span>
                </a>
              )}
            </div>
          )}

          {hours ? (
            hours.summary ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-[color:var(--deep)]">
                <Clock size={16} strokeWidth={1.75} className="shrink-0" />
                {hours.summary}
              </p>
            ) : (
              <details className="group mt-2 text-sm text-[color:var(--deep)]">
                <summary className="flex items-center gap-1.5 w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <Clock size={16} strokeWidth={1.75} className="shrink-0" />
                  เวลาเปิด-ปิด
                  <ChevronDown
                    size={16}
                    strokeWidth={1.75}
                    className="shrink-0 transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[color:var(--muted)]">
                  {hours.rows.map((r, i) => (
                    <div key={i} className="contents">
                      <dt>{r.day}</dt>
                      <dd className="text-[color:var(--text)]">{r.text}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-[color:var(--muted)]">
              <Clock size={16} strokeWidth={1.75} className="shrink-0" />
              ไม่ทราบเวลาเปิด-ปิด
            </p>
          )}

          {closedDates.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-[color:var(--danger)]">
              <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
              {closedAllTrip
                ? "ปิดทุกวันของทริปนี้"
                : `ปิดทั้งวันในวันเดินทาง: ${closedDates.map((d) => formatVisitDate(d, "short")).join(", ")}`}
            </p>
          )}

          <div className="mt-3 pt-3 border-t border-[color:var(--line)] flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[color:var(--muted)]">
            {item.categoryScore !== null && (
              <Metric icon={Tag}>
                {item.categoryScore === 1 ? "ตรงหมวดหมู่ที่เลือก" : "นอกหมวดหมู่ที่เลือก"}
              </Metric>
            )}
            <Metric icon={Star}>
              {item.ratingScore === null ? "ยังไม่มีรีวิว" : `รีวิว ${(item.ratingScore * 5).toFixed(1)}/5`}
            </Metric>
            <Metric
              icon={Navigation}
              tone={approx ? "warn" : undefined}
              title={approx ? "ระยะทางเส้นตรงโดยประมาณ ไม่ใช่ระยะทางถนน" : undefined}
            >
              {method === "ors" ? "ทางถนน " : approx ? "ประมาณ " : ""}
              {(1 / item.distanceScore - 1).toFixed(1)} กม.
            </Metric>
            {item.placeCost !== null ? (
              <Metric icon={Wallet}>
                {item.placeCost.toLocaleString()}/
                {item.perPersonDailyBudget !== null
                  ? `${item.perPersonDailyBudget.toLocaleString()} บาท`
                  : "ไม่จำกัดงบ"}
              </Metric>
            ) : (
              <span title="สถานที่นี้ไม่มีข้อมูลราคาจาก Google ระบบไม่เดาราคาแทนคุณ">
                <Metric icon={Wallet}>
                  {item.priceNature === "free"
                    ? "ไม่ทราบราคาแน่ชัด (หมวดนี้มักไม่มีค่าใช้จ่าย)"
                    : "ไม่ทราบราคาแน่ชัด"}
                </Metric>
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-3">
          <div className="text-right">
            <p className="font-prompt font-semibold text-3xl leading-none text-[color:var(--navy)]">
              {(item.poiScore * 100).toFixed(0)}
            </p>
            <p className="text-xs text-[color:var(--muted)] mt-1">คะแนนรวม</p>
          </div>

          {p && (
            <button
              type="button"
              onClick={() => handleShowOnMap(item.placeId)}
              aria-label={`ดู ${p.place_name} บนแผนที่`}
              className="w-11 h-11 rounded-full border-2 border-[color:var(--line)] text-[color:var(--muted)] hover:border-[color:var(--sky)] hover:text-[color:var(--navy)] flex items-center justify-center active:scale-95 transition-all duration-200"
            >
              <MapPin size={20} strokeWidth={1.75} />
            </button>
          )}

          {isCustomMode && (
            <button
              type="button"
              aria-pressed={selected}
              aria-label={`${selected ? "ยกเลิกเลือก" : "เลือก"} ${p?.place_name ?? "สถานที่"}`}
              onClick={() => togglePlace(item.placeId)}
              className={`w-11 h-11 rounded-full border-2 flex items-center justify-center active:scale-95 transition-all duration-200 ${
                selected
                  ? "bg-[color:var(--navy)] border-[color:var(--navy)] text-white"
                  : "bg-white border-[color:var(--line)] text-[color:var(--muted)] hover:border-[color:var(--sky)] hover:text-[color:var(--navy)]"
              }`}
            >
              {selected ? <Check size={20} strokeWidth={2} /> : <Plus size={20} strokeWidth={2} />}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="font-sarabun min-h-screen bg-[color:var(--cream)]">
      <Navbar />

      <main className={`max-w-6xl mx-auto px-4 sm:px-8 py-6 ${isCustomMode ? "pb-28" : ""}`}>
        <button
          type="button"
          onClick={() => navigate("/trip/create")}
          className="font-prompt font-medium min-h-10 pr-4 pl-3 mb-4 flex items-center gap-1.5 rounded-xl text-[color:var(--navy)] bg-white border border-[color:var(--line)] hover:bg-[color:var(--sky-soft)] active:scale-[0.98] transition-all duration-200"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          กลับ
        </button>

        <div className="fade-in mb-6">
          <h1 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
            สถานที่ที่ตรงใจคุณ
          </h1>
          <p className="text-sm text-[color:var(--muted)] mt-1 max-w-2xl">
            จัดเรียงตามคะแนนความเหมาะสม (POI Score) ที่คำนวณจากความสนใจ งบประมาณ ระยะทาง และเวลาของทริปนี้
          </p>
        </div>

        {filledMatchCount !== null && (
          <p className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-4 bg-white border border-[color:var(--sky)] text-[color:var(--deep)]">
            <Info size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <span>
              {filledMatchCount === 0
                ? "ไม่มีสถานที่ตรงตามหมวดหมู่ที่เลือกในพื้นที่นี้ ระบบจึงแนะนำสถานที่หมวดอื่นแทน"
                : `หมวดหมู่ที่เลือกมีสถานที่ ${filledMatchCount} แห่งในพื้นที่นี้ ระบบจึงเพิ่มสถานที่หมวดอื่นมาแนะนำด้วย`}
            </span>
          </p>
        )}

        {(distanceSource === "haversine" || distanceSource === "mixed") && (
          <p className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-4 bg-white border border-[color:var(--sky)] text-[color:var(--deep)]">
            <Info size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <span>
              {distanceSource === "haversine"
                ? "ตอนนี้คำนวณเส้นทางถนนไม่ได้ ระยะทางจึงเป็นค่าประมาณแบบเส้นตรงจากจุดเริ่มต้น"
                : "บางสถานที่หาเส้นทางถนนจากจุดเริ่มต้นไม่ได้ จึงแสดงระยะทางเส้นตรงโดยประมาณ (ตัวเลขสีแดง)"}
            </span>
          </p>
        )}

        {autoTripError && (
          <p
            role="alert"
            className="animate-shake flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-4 bg-white border border-[color:var(--danger)] text-[color:var(--danger)]"
          >
            <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <span>{autoTripError}</span>
          </p>
        )}

        {loading && (
          <StateCard
            icon={Loader2}
            iconClass="text-[color:var(--sky)] animate-spin"
            text="กำลังคำนวณคะแนนสถานที่..."
          />
        )}

        {!loading && error && (
          <StateCard
            icon={TriangleAlert}
            iconClass="text-[color:var(--danger)]"
            title="เกิดข้อผิดพลาด"
            text={error}
          >
            <button type="button" onClick={() => navigate("/home")} className={`${primaryBtn} mt-3`}>
              กลับหน้าหลัก
            </button>
          </StateCard>
        )}

        {!loading && !error && places.length === 0 && (
          <StateCard
            icon={SearchX}
            title="ไม่พบสถานที่ที่ตรงเงื่อนไข"
            text="ลองปรับงบประมาณ เวลา หรือหมวดหมู่ที่สนใจของทริปนี้ดูอีกครั้ง"
          >
            <button type="button" onClick={() => navigate("/home")} className={`${primaryBtn} mt-3`}>
              กลับหน้าหลัก
            </button>
          </StateCard>
        )}

        {!loading && !error && places.length > 0 && (
          <>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              {!isCustomMode ? (
                <>
                  <p className="text-sm text-[color:var(--muted)]">พบ {places.length} สถานที่</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleAutoTrip}
                      disabled={autoCreatingRoute}
                      className={outlineBtn}
                    >
                      {autoCreatingRoute ? (
                        <>
                          <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
                          กำลังจัดทริป...
                        </>
                      ) : (
                        <>
                          <Sparkles size={20} strokeWidth={1.75} />
                          จัดทริปอัตโนมัติ
                        </>
                      )}
                    </button>
                    <button type="button" onClick={handleStartCustomMode} className={primaryBtn}>
                      <ListChecks size={20} strokeWidth={1.75} />
                      จัดทริปเอง
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-[color:var(--muted)]">
                    เลือกสถานที่ที่ต้องการ แล้วกดสร้างเส้นทาง
                  </p>
                  <button type="button" onClick={handleCancelCustomMode} className={outlineBtn}>
                    <X size={20} strokeWidth={1.75} />
                    ยกเลิก
                  </button>
                </>
              )}
            </div>

            {/* Category filter */}
            {availableCategories.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
                <button
                  type="button"
                  aria-pressed={selectedCategory === null}
                  onClick={() => setSelectedCategory(null)}
                  className={chipClass(selectedCategory === null)}
                >
                  ทั้งหมด ({places.length})
                </button>
                {availableCategories.map((cat) => {
                  const count = places.filter((p) => p.categoryName === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={selectedCategory === cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={chipClass(selectedCategory === cat)}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle"
                        style={{ background: categoryColor(cat) }}
                      />
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* สลับมุมมองบนมือถือ (จอใหญ่แสดงรายการ + แผนที่คู่กัน) */}
            <div className="flex gap-2 mb-4 lg:hidden">
              <button
                type="button"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={chipClass(view === "list")}
              >
                รายการ
              </button>
              <button
                type="button"
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
                className={chipClass(view === "map")}
              >
                แผนที่
              </button>
            </div>

            <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
              <div className={view === "map" ? "hidden lg:block" : ""}>
                {displayedPlaces.length === 0 ? (
                  <StateCard icon={SearchX} text="ไม่มีสถานที่ในหมวดหมู่นี้" />
                ) : (
                  <ul className="flex flex-col gap-3">{displayedPlaces.map(renderCard)}</ul>
                )}
              </div>

              <div className={`${view === "list" ? "hidden lg:block" : ""} lg:sticky lg:top-4`}>
                <RecommendationMap
                  className="h-[70vh] lg:h-[calc(100vh-2rem)]"
                  places={mapPlaces}
                  selectedIds={selectedPlaceIds}
                  isCustomMode={isCustomMode}
                  focus={focus}
                  onShowCard={handleShowCard}
                  onToggleSelect={togglePlace}
                />
              </div>
            </div>
          </>
        )}
      </main>

      {isCustomMode && selectedPlaceIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-8 pb-4">
            <div className="bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)] px-5 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-prompt font-medium text-[color:var(--navy)]">
                  เลือกแล้ว {selectedPlaceIds.length} สถานที่
                </p>
                {createRouteError && (
                  <p role="alert" className="flex items-center gap-1.5 text-xs text-[color:var(--danger)] mt-1">
                    <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0" />
                    {createRouteError}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCreateRoute}
                disabled={creatingRoute}
                className={`${primaryBtn} shrink-0`}
              >
                {creatingRoute ? (
                  <>
                    <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
                    กำลังสร้าง...
                  </>
                ) : (
                  <>
                    <Route size={20} strokeWidth={1.75} />
                    สร้างเส้นทาง
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