import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft, Check, Globe, Info, ListChecks, Loader2, MapPin, Navigation, Phone,
  Plus, Route, SearchX, Sparkles, Star, Tag, TriangleAlert, Wallet, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../auth/hooks/useAuth";

// ✅ ตรงกับ PriceConfidence ฝั่ง backend (poiScoreCalculator.ts) — null เมื่อ useBudget = false
type PriceConfidence = "real" | "inferred_high" | "inferred_low" | null;

// ✅ ตรงกับ DistanceSource ฝั่ง backend (orsDistance.ts) — ors = ระยะทางถนนจริงทั้งหมด
type DistanceSource = "ors" | "haversine" | "mixed";

interface PoiResult {
  placeId: string;
  categoryName: string;
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  budgetScore: number | null;
  weatherScore: number;
  poiScore: number;
  placeCost: number | null;
  perPersonDailyBudget: number | null;
  priceConfidence: PriceConfidence;
  // ✅ แหล่งของระยะทางรายสถานที่ (backend ใหม่) — ไม่มี = ใช้ distanceSource ระดับหน้าแทน
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
  price_level: number;
  formatted_address: string | null;
  phone_number?: string | null;
  website?: string | null;
  opening_hours?: any;
  user_ratings_total?: number | null;
  att_type_label?: string | null;
  att_category_label?: string | null;
  default_duration_min: number;
}

interface MergedPlace extends PoiResult {
  place?: PlaceInfo;
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
  const [categoryFallbackUsed, setCategoryFallbackUsed] = useState(false);
  const [distanceSource, setDistanceSource] = useState<DistanceSource | null>(null);

  // State สำหรับเก็บรายการสถานที่ทั้งหมด
  const [places, setPlaces] = useState<MergedPlace[]>([]);

  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

  const [creatingRoute, setCreatingRoute] = useState(false);
  const [createRouteError, setCreateRouteError] = useState<string | null>(null);

  const [autoCreatingRoute, setAutoCreatingRoute] = useState(false);
  const [autoTripError, setAutoTripError] = useState<string | null>(null);

  // ✅ ตัวกรองหมวดหมู่ที่เลือกไว้ — null = แสดงทุกหมวดหมู่
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
        setCategoryFallbackUsed(!!poiData.categoryFallbackUsed);
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
      } catch (err: any) {
        console.error(err);
        setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
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
    } catch (err: any) {
      console.error(err);
      setCreateRouteError(err.message || "เกิดข้อผิดพลาดในการสร้างเส้นทาง");
    } finally {
      setCreatingRoute(false);
    }
  };

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

      console.log("Auto Trip result:", data);

      navigate(`/trip/${tripId}/auto`, {
        state: {
          autoTrip: data,
        },
      });
    } catch (err: any) {
      console.error("Auto Trip error:", err);

      setAutoTripError(
        err.message || "เกิดข้อผิดพลาดในการจัดทริปอัตโนมัติ"
      );
    } finally {
      setAutoCreatingRoute(false);
    }
  };

  // ✅ รายการหมวดหมู่ unique จากผลลัพธ์จริง ใช้ทำแถบกรองแนวนอน
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    places.forEach((p) => {
      if (p.categoryName) set.add(p.categoryName);
    });
    return Array.from(set);
  }, [places]);

  // ✅ การ์ดที่จะแสดงจริงหลังกรองหมวดหมู่ (rank ยังอิงจาก places เต็มชุดเสมอ)
  const displayedPlaces = useMemo(() => {
    if (!selectedCategory) return places;
    return places.filter((p) => p.categoryName === selectedCategory);
  }, [places, selectedCategory]);

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

    return (
      <li
        key={item.placeId}
        className={`flex items-start gap-4 bg-white rounded-2xl border-2 p-4 sm:p-5 [box-shadow:var(--shadow)] transition-colors duration-200 ${
          isCustomMode && selected
            ? "border-[color:var(--navy)]"
            : "border-[color:var(--line)]"
        } ${isCustomMode && !selected ? "opacity-80" : ""}`}
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

          <div className="mt-3 pt-3 border-t border-[color:var(--line)] flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-[color:var(--muted)]">
            <Metric icon={Tag}>ตรงหมวดหมู่ {(item.categoryScore * 100).toFixed(0)}%</Metric>
            <Metric icon={Star}>รีวิว {(item.ratingScore * 5).toFixed(1)}/5</Metric>
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
                  {item.priceConfidence === "inferred_high"
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

      <main className={`max-w-5xl mx-auto px-4 sm:px-8 py-6 ${isCustomMode ? "pb-28" : ""}`}>
        <button
          type="button"
          onClick={() => navigate(-1)}
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

        {categoryFallbackUsed && (
          <p className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 mb-4 bg-white border border-[color:var(--sky)] text-[color:var(--deep)]">
            <Info size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <span>ไม่มีสถานที่ตรงตามหมวดหมู่ที่เลือกในจังหวัดนี้ ระบบจึงแสดงผลแบบตรงใจน้อยลง</span>
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
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {displayedPlaces.length === 0 ? (
              <StateCard icon={SearchX} text="ไม่มีสถานที่ในหมวดหมู่นี้" />
            ) : (
              <ul className="flex flex-col gap-3">{displayedPlaces.map(renderCard)}</ul>
            )}
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