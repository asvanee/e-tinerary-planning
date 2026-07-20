import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, href } from "react-router-dom";
import Navbar from "../../../components/navbar";
import { useAuth } from "../../auth/hooks/useAuth";

interface PoiResult {
  placeId: string;
  categoryName: string;
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  budgetScore: number;
  weatherScore: number;
  poiScore: number;
  placeCost: number;
  perPersonDailyBudget: number | null;
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

export default function TripRecommendations() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();

  const [places, setPlaces] = useState<MergedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFallbackUsed, setCategoryFallbackUsed] = useState(false);

  const [isCustomMode, setIsCustomMode] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

  const [creatingRoute, setCreatingRoute] = useState(false);
  const [createRouteError, setCreateRouteError] = useState<string | null>(null);

  // ✅ ตัวกรองหมวดหมู่ที่เลือกไว้ตอนสร้างทริป (categoryName) — null = แสดงทุกหมวดหมู่
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

  return (
    <div className="font-sarabun min-h-screen bg-[#fcedd3]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[#102a6b] font-prompt font-semibold shadow-md hover:shadow-lg hover:-translate-x-1 transition-all duration-200"
        >
          <span className="text-lg transition-transform duration-200 group-hover:-translate-x-1">
            ←
          </span>
          <span>กลับ</span>
        </button>
      </div>

      <div className={`max-w-6xl mx-auto px-4 py-6 ${isCustomMode ? "pb-28" : ""}`}>
        <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg">
          <h2 className="font-prompt font-bold text-2xl text-white mb-1">
            สถานที่ที่ตรงใจคุณ
          </h2>
          <p className="text-[#5990c0] text-sm">
            จัดเรียงตามคะแนนความเหมาะสม (POI Score) ที่คำนวณจากความสนใจ
            งบประมาณ ระยะทาง และเวลาของทริปนี้
          </p>
        </div>

        {categoryFallbackUsed && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl px-5 py-3 mb-6 text-sm">
            ไม่มีสถานที่ตรงตามหมวดหมู่ที่เลือกในจังหวัดนี้ ระบบจึงแสดงผลแบบตรงใจน้อยลง
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-2xl shadow-lg px-8 py-16 flex flex-col items-center justify-center text-center gap-3">
            <div className="text-5xl animate-pulse">🗺️</div>
            <p className="text-sm text-[#5990c0]">กำลังคำนวณคะแนนสถานที่...</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl shadow-lg px-8 py-16 flex flex-col items-center justify-center text-center gap-3">
            <div className="text-5xl">⚠️</div>
            <h3 className="font-prompt font-bold text-lg text-[#102a6b]">
              เกิดข้อผิดพลาด
            </h3>
            <p className="text-sm text-[#5990c0] max-w-md">{error}</p>
            <button
              onClick={() => navigate("/home")}
              className="mt-4 font-bold px-6 py-3 rounded-xl text-white bg-gradient-to-r from-[#102a6b] to-[#015185]"
            >
              กลับหน้าหลัก
            </button>
          </div>
        )}

        {!loading && !error && places.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg px-8 py-16 flex flex-col items-center justify-center text-center gap-3">
            <div className="text-5xl">🔍</div>
            <h3 className="font-prompt font-bold text-lg text-[#102a6b]">
              ไม่พบสถานที่ที่ตรงเงื่อนไข
            </h3>
            <p className="text-sm text-[#5990c0] max-w-md">
              ลองปรับงบประมาณ เวลา หรือหมวดหมู่ที่สนใจของทริปนี้ดูอีกครั้ง
            </p>
            <button
              onClick={() => navigate("/home")}
              className="mt-4 font-bold px-6 py-3 rounded-xl text-white bg-gradient-to-r from-[#102a6b] to-[#015185]"
            >
              กลับหน้าหลัก
            </button>
          </div>
        )}

        {!loading && !error && places.length > 0 && (
          <>
            <div className="flex justify-between items-center mb-4 gap-3">
              {!isCustomMode ? (
                <div className="flex gap-3 ml-auto">
                  <button
                    disabled
                    title="เร็วๆ นี้"
                    className="px-5 py-3 rounded-xl font-bold bg-white text-[#5990c0] border-2 border-[#5990c0]/30 cursor-not-allowed opacity-60"
                  >
                    จัดทริปอัตโนมัติ
                  </button>
                  <button
                    onClick={handleStartCustomMode}
                    className="px-5 py-3 rounded-xl text-white font-bold bg-gradient-to-r from-[#102a6b] to-[#015185] shadow-md hover:shadow-lg transition-shadow"
                  >
                    จัดทริปเอง
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-sm text-[#5990c0]">
                    เลือกแล้ว {selectedPlaceIds.length} สถานที่
                  </div>
                  <button
                    onClick={handleCancelCustomMode}
                    className="px-4 py-2 rounded-xl text-[#102a6b] font-semibold bg-white border-2 border-[#102a6b]/20 hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                </>
              )}
            </div>

            {/* ✅ แถบกรองหมวดหมู่แบบเลื่อนแนวนอนเส้นเดียว */}
            {availableCategories.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto flex-nowrap pb-2 -mx-1 px-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`flex-shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                    selectedCategory === null
                      ? "bg-[#102a6b] text-white"
                      : "bg-white text-[#102a6b] border border-[#102a6b]/20 hover:bg-gray-50"
                  }`}
                >
                  ทั้งหมด ({places.length})
                </button>
                {availableCategories.map((cat) => {
                  const count = places.filter((p) => p.categoryName === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`flex-shrink-0 whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                        selectedCategory === cat
                          ? "bg-[#102a6b] text-white"
                          : "bg-white text-[#102a6b] border border-[#102a6b]/20 hover:bg-gray-50"
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {(() => {
              const rankOf = new Map(places.map((p, i) => [p.placeId, i + 1]));

              const renderCard = (item: MergedPlace) => (
                <div
                  key={item.placeId}
                  className={`bg-white rounded-2xl shadow-md px-6 py-5 flex items-center gap-5 border-2 transition-colors transition-all duration-300
                    hover:shadow-xl hover:-translate-y-1 ${
                    isCustomMode
                      ? selectedPlaceIds.includes(item.placeId)
                        ? "border-green-500"
                        : "border-transparent opacity-60"
                      : "border-transparent"
                  }`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#102a6b] text-white font-prompt font-bold flex items-center justify-center">
                    {rankOf.get(item.placeId)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-prompt font-bold text-base text-[#102a6b]">
                      {item.place?.place_name ?? "ไม่พบชื่อสถานที่"}
                    </h3>
                    <p className="text-xs text-[#5990c0] mt-0.5">
                      {item.place?.district ? `${item.place.district}, ` : ""}
                      {item.place?.province ?? ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.categoryName && (
                        <div className="inline-block px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                          {item.categoryName}
                        </div>
                      )}
                      {item.place?.att_category_label && (
                        <div className="inline-block px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
                          {item.place.att_category_label}
                        </div>
                      )}
                    </div>
                    {item.place?.phone_number && (
                      <div className="text-xs text-[#015185] mt-1">
                        📞 {item.place.phone_number}
                      </div>
                    )}
                    {item.place?.website && (
                      <a
                        href={
                          item.place.website.startsWith("http")
                            ? item.place.website
                            : `https://${item.place.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"
                      >
                        🌐
                        <span className="truncate max-w-[180px]">
                          {item.place.website
                            .replace(/^https?:\/\//, "")
                            .replace(/^www\./, "")
                            .split("/")[0]}
                        </span>
                      </a>
                    )}

                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#015185]">
                      <span>ความตรงหมวดหมู่ {(item.categoryScore * 100).toFixed(0)}%</span>
                      <span>คะแนนรีวิว {(item.ratingScore * 5).toFixed(1)}/5</span>
                      <span>ระยะทาง {(1 / item.distanceScore - 1).toFixed(1)} กม.</span>
                      {item.placeCost !== null && (
                        <span>
                          งบประมาณ {item.placeCost.toLocaleString()}/
                          {item.perPersonDailyBudget !== null
                            ? `${item.perPersonDailyBudget.toLocaleString()} บาท`
                            : "ไม่จำกัดงบ"}
                        </span>
                      )}
                    </div>
                  </div>

                  {isCustomMode && (
                    <div className="flex-shrink-0">
                      <button
                        onClick={() => togglePlace(item.placeId)}
                        className={`w-10 h-10 rounded-full font-bold ${
                          selectedPlaceIds.includes(item.placeId)
                            ? "bg-green-500 text-white"
                            : "bg-gray-200"
                        }`}
                      >
                        {selectedPlaceIds.includes(item.placeId) ? "✓" : "+"}
                      </button>
                    </div>
                  )}

                  <div className="flex-shrink-0 text-right">
                    <div className="font-prompt font-bold text-2xl text-[#102a6b]">
                      {(item.poiScore * 100).toFixed(0)}
                    </div>
                    <div className="text-xs text-[#5990c0]">คะแนนรวม</div>
                  </div>
                </div>
              );

              

              if (displayedPlaces.length === 0) {
                return (
                  <div className="bg-white rounded-2xl shadow-md px-8 py-12 flex flex-col items-center justify-center text-center gap-2">
                    <div className="text-4xl">🗂️</div>
                    <p className="text-sm text-[#5990c0]">
                      ไม่มีสถานที่ในหมวดหมู่นี้
                    </p>
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-4">
                  {displayedPlaces.map((item) => renderCard(item))}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {isCustomMode && selectedPlaceIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className="max-w-6xl mx-auto px-4 pb-5">
            <div className="bg-white rounded-2xl shadow-2xl px-6 py-4 flex items-center justify-between gap-4 border border-black/5">
              <div className="text-sm text-[#102a6b] font-prompt font-semibold">
                เลือกแล้ว {selectedPlaceIds.length} สถานที่
                {createRouteError && (
                  <div className="text-xs text-red-600 font-normal mt-1">
                    {createRouteError}
                  </div>
                )}
              </div>
              <button
                onClick={handleCreateRoute}
                disabled={creatingRoute}
                className="px-6 py-3 rounded-xl text-white font-bold bg-gradient-to-r from-[#102a6b] to-[#015185] shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {creatingRoute ? "กำลังสร้าง..." : "สร้างเส้นทาง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}