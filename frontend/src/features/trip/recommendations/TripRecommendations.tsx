import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../../../components/Navbar";
import { useAuth } from "../../auth/hooks/useAuth";
import { getOpeningHoursDisplay } from "../../../utils/openingHours";

interface PoiResult {
  placeId: string;
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  budgetScore: number;
  weatherScore: number;
  poiScore: number;
}

interface PlaceInfo {
  place_id: string;
  place_name: string;
  province: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  price_level: number | null;
  formatted_address: string | null;

  phone_number?: string | null;
  website?: string | null;
  opening_hours?: any;
  user_ratings_total?: number | null;

  att_type_label?: string | null;
  att_category_label?: string | null;
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
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>([]);

  const togglePlaceSelection = (placeId: string) => {
    setSelectedPlaceIds((prev) => {
      if (prev.includes(placeId)) {
        return prev.filter((id) => id !== placeId);
      }
      return [...prev, placeId];
    });
  };

  const handleViewSelectedPlaces = () => {
    if (!tripId || selectedPlaceIds.length === 0) return;
    navigate(`/trip/${tripId}/map?selected=${selectedPlaceIds.join(",")}`);
  };
  

  useEffect(() => {
  // ✅ รอ AuthContext อ่าน session จาก localStorage ให้เสร็จก่อน
  // ไม่งั้น mount ครั้งแรก session จะเป็น null ชั่วคราวเสมอ (แม้ user
  // จะล็อกอินอยู่จริง) แล้วโดนเด้งไป /login ผิดพลาด
  if (authLoading) {
    return;
  }

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
  throw new Error(
    `API ไม่ได้ส่ง JSON กลับมา (status ${poiRes.status})`
  );
}
      

      if (!poiRes.ok) {
        throw new Error(
          poiData.message || "คำนวณคะแนนสถานที่ไม่สำเร็จ"
        );
      }

      const results: PoiResult[] = poiData.results ?? [];

      setCategoryFallbackUsed(
        !!poiData.categoryFallbackUsed
      );

      if (results.length === 0) {
        setPlaces([]);
        return;
      }

      const ids = results
        .map((r) => r.placeId)
        .join(",");

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
        throw new Error(
          placesData.message || "ดึงข้อมูลสถานที่ไม่สำเร็จ"
        );
      }

      const placeMap = new Map<string, PlaceInfo>(
        (placesData.places as PlaceInfo[]).map((p) => [
          p.place_id,
          p,
        ])
      );

      const merged: MergedPlace[] = results.map((r) => ({
        ...r,
        place: placeMap.get(r.placeId),
      }));

      setPlaces(merged);
    } catch (err: any) {
      console.error(err);
      setError(
        err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล"
      );
    } finally {
      setLoading(false);
    }
  };

  fetchData();
}, [tripId, session, authLoading, navigate]);

  return (
    <div className="font-sarabun min-h-screen bg-[#fcedd3]">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-6">
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

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg">
          <h2 className="font-prompt font-bold text-2xl text-white mb-1">
            สถานที่ที่ตรงใจคุณ
          </h2>
          <p className="text-[#5990c0] text-sm">
            จัดเรียงตามคะแนนความเหมาะสม (POI Score) ที่คำนวณจากความสนใจ
            งบประมาณ ระยะทาง และเวลาของทริปนี้
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 shadow-sm mb-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-prompt font-semibold text-[#102a6b]">เลือกสถานที่ที่ต้องการดูบนแผนที่</h3>
              <p className="text-sm text-[#5990c0]">เลือกได้มากกว่า 1 แห่ง แล้วกดดูแผนที่เพื่อดูว่าแต่ละแห่งอยู่ใกล้ไกลจากจุดเริ่มต้นเท่าไหร่</p>
            </div>
            <button
              type="button"
              onClick={handleViewSelectedPlaces}
              disabled={selectedPlaceIds.length === 0}
              className="rounded-xl bg-gradient-to-r from-[#102a6b] to-[#015185] px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ดูแผนที่ ({selectedPlaceIds.length})
            </button>
          </div>
          {categoryFallbackUsed && (
            <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl px-4 py-3 text-sm">
              ไม่มีสถานที่ตรงตามหมวดหมู่ที่เลือกในจังหวัดนี้ ระบบจึงแสดงผลแบบตรงใจน้อยลง
            </div>
          )}
        </div>

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
          <div className="flex flex-col gap-4">
            {places.map((item, index) => {
              const placeId = item.place?.place_id ?? item.placeId;
              const isSelected = selectedPlaceIds.includes(placeId);

              return (
              <div
                key={item.placeId}
                className={`rounded-2xl border px-6 py-5 flex items-start gap-4 shadow-md ${isSelected ? "border-[#015185] bg-[#f5fbff]" : "border-transparent bg-white"}`}
              >
                <button
                  type="button"
                  onClick={() => togglePlaceSelection(placeId)}
                  className={`mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-all ${isSelected ? "border-[#015185] bg-[#015185] text-white" : "border-[#5990c0]/30 bg-white text-[#015185]"}`}
                  aria-label={`เลือก ${item.place?.place_name ?? "สถานที่"}`}
                >
                  {isSelected ? "✓" : "+"}
                </button>

                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#102a6b] text-white font-prompt font-bold flex items-center justify-center">
                  {index + 1}
                </div>

                <div className="flex-1">
                  <h3 className="font-prompt font-bold text-base text-[#102a6b]">
                    {item.place?.place_name ?? "ไม่พบชื่อสถานที่"}
                  </h3>
                  <p className="text-xs text-[#5990c0] mt-0.5">
                    {item.place?.district ? `${item.place.district}, ` : ""}
                    {item.place?.province ?? ""}
                  </p>
                  {item.place?.att_category_label && (
  <div className="mt-2 inline-block px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
    {item.place.att_category_label}
  </div>
)}
{item.place?.phone_number && (
  <div className="text-xs text-[#015185] mt-1">
    📞 {item.place.phone_number}
  </div>
)}
{(() => {
  const openingHours = getOpeningHoursDisplay(item.place?.opening_hours);
  const badgeClass =
    openingHours.status === "open"
      ? "bg-green-50 text-green-700"
      : openingHours.status === "closed"
      ? "bg-red-50 text-red-700"
      : "bg-gray-100 text-gray-700";

  return (
    <div className="mt-2">
      <div className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}`}>
        {openingHours.label}
      </div>
      <div className="mt-1 text-xs text-[#4b5563]">{openingHours.text}</div>
    </div>
  );
})()}
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
                    <span>ความใกล้ {(item.distanceScore * 100).toFixed(0)}%</span>
                    <span>ความคุ้มงบ {(item.budgetScore * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="font-prompt font-bold text-2xl text-[#102a6b]">
                    {(item.poiScore * 100).toFixed(0)}
                  </div>
                  <div className="text-xs text-[#5990c0]">คะแนนรวม</div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}