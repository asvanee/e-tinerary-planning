import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navbar from "../../../components/Navbar";
import { useAuth } from "../../auth/hooks/useAuth";
import { haversineKm } from "../../../utils/haversine";

interface PlaceInfo {
  place_id: string;
  place_name: string;
  province: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  formatted_address: string | null;
  category: string;
  rating: number;
  price_level: number | null;
  opening_hours?: any;
}

interface TripInfo {
  trip_id: string;
  start_lat: number | null;
  start_lng: number | null;
  start_address: string | null;
  province: string | null;
  district: string | null;
  start_time: string | null;
  daily_budget: number | null;
  number_of_people: number | null;
  available_time_per_day: number | null;
  preferred_category?: string | null; // ใช้แทนค่า hardcode "ธรรมชาติ" ถ้ามีใน schema
}

interface TripRequest {
  category: string;
  budget: number;
  weather: string;
  startMinutes: number;
  endMinutes: number;
  userLat: number;
  userLng: number;
}

interface ScheduledPlace extends PlaceInfo {
  poiScore: number;
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  budgetScore: number;
  weatherScore: number;
  estimatedCost: number;
  distanceKm: number; // ระยะจากจุดเริ่มทริป ใช้แค่ตอนให้คะแนน
  distanceKmFromPrevious: number | null; // ระยะจากจุดก่อนหน้าในตาราง ใช้แสดงผลจริง
  durationMinutes: number;
  arrivalTime: string;
  departureTime: string;
}

const parseSelectedPlaceIds = (value: string | null) =>
  (value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

const parseTimeToMinutes = (value: string | null | undefined) => {
  if (!value) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

const formatMinutes = (minutes: number) => {
  const hrs = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

function createItinerary(places: PlaceInfo[], trip: TripRequest): ScheduledPlace[] {
  const scored: ScheduledPlace[] = places.map((place) => {
    const categoryScore = place.category === trip.category ? 1 : 0;
    const ratingScore = (place.rating ?? 0) / 5;
    const distanceKm = haversineKm(trip.userLat, trip.userLng, place.latitude, place.longitude);
    const distanceScore = Math.max(0, 1 - distanceKm / 50);
    const estimatedCost = (place.price_level ?? 1) * 250;
    const budgetScore = estimatedCost <= trip.budget ? 1 : 0;

    let weatherScore = 1;
    if (trip.weather === "Rain" && place.category === "ธรรมชาติ") {
      weatherScore = 0.4;
    }

    const poiScore =
      0.35 * categoryScore +
      0.25 * ratingScore +
      0.15 * distanceScore +
      0.15 * budgetScore +
      0.1 * weatherScore;

    let durationMinutes = 60;
    if (place.category === "ธรรมชาติ") {
      durationMinutes = 180;
    } else if (place.category === "วัด") {
      durationMinutes = 90;
    } else if (place.category === "คาเฟ่") {
      durationMinutes = 60;
    }

    return {
      ...place,
      poiScore,
      categoryScore,
      ratingScore,
      distanceScore,
      budgetScore,
      weatherScore,
      estimatedCost,
      distanceKm,
      distanceKmFromPrevious: null,
      durationMinutes,
      arrivalTime: "",
      departureTime: "",
    };
  });

  scored.sort((a, b) => b.poiScore - a.poiScore);

  let currentMinutes = trip.startMinutes;
  const endMinutes = trip.endMinutes;
  let totalCost = 0;
  let prevLat = trip.userLat;
  let prevLng = trip.userLng;
  const result: ScheduledPlace[] = [];

  for (const place of scored) {
    // ระยะทาง/เวลาเดินทางต้องคำนวณจาก "จุดก่อนหน้าในตาราง" ไม่ใช่จุดเริ่มทริปเดิมทุกครั้ง
    const distanceFromPrevious = haversineKm(prevLat, prevLng, place.latitude, place.longitude);
    const travelMinutes = Math.round(distanceFromPrevious * 2);
    const finishTime = currentMinutes + travelMinutes + place.durationMinutes;

    if (finishTime > endMinutes) {
      continue;
    }

    if (totalCost + place.estimatedCost > trip.budget) {
      continue;
    }

    place.arrivalTime = formatMinutes(currentMinutes + travelMinutes);
    place.departureTime = formatMinutes(finishTime);
    place.distanceKmFromPrevious = distanceFromPrevious;

    result.push(place);
    totalCost += place.estimatedCost;
    currentMinutes = finishTime;
    prevLat = place.latitude;
    prevLng = place.longitude;
  }

  return result;
}

export default function ScheduleTrip() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isLoading: authLoading } = useAuth();

  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [places, setPlaces] = useState<ScheduledPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const selectedIds = parseSelectedPlaceIds(searchParams.get("selected"));

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const tripsRes = await fetch("/api/trips", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const tripsData = await tripsRes.json();
        if (!tripsRes.ok) throw new Error(tripsData.message || "โหลดข้อมูลทริปไม่สำเร็จ");

        const currentTrip = (tripsData.trips || []).find((item: TripInfo) => item.trip_id === tripId);
        if (!currentTrip) throw new Error("ไม่พบทริปนี้");

        if (selectedIds.length === 0) {
          throw new Error("กรุณาเลือกสถานที่ก่อนทำการจัดตาราง");
        }

        const placeQuery = new URLSearchParams({ ids: selectedIds.join(",") });
        if (currentTrip.province) placeQuery.set("province", currentTrip.province);
        if (currentTrip.district) placeQuery.set("district", currentTrip.district);

        const placesRes = await fetch(`/api/places?${placeQuery.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const placesData = await placesRes.json();
        if (!placesRes.ok) throw new Error(placesData.message || "โหลดสถานที่ไม่สำเร็จ");

        const placeList = (placesData.places || []) as PlaceInfo[];

        const startMinutes = parseTimeToMinutes(currentTrip.start_time);
        const availableMinutes = (currentTrip.available_time_per_day || 6) * 60;
        const endMinutes = startMinutes + availableMinutes; // ไม่ต้อง mod 24 เพื่อกันช่วงเวลาพลิกกลับ

        const tripRequest: TripRequest = {
          category: currentTrip.preferred_category || "ธรรมชาติ",
          budget: currentTrip.daily_budget ?? 5000,
          weather: "Sunny", // TODO: ดึงจาก weather API จริงตามพิกัด start_lat/start_lng แทนค่า hardcode
          startMinutes,
          endMinutes,
          userLat: currentTrip.start_lat ?? 13.7563,
          userLng: currentTrip.start_lng ?? 100.5018,
        };

        const scheduled = createItinerary(placeList, tripRequest);

        setTrip(currentTrip);
        setPlaces(scheduled);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "เกิดข้อผิดพลาดในการคำนวณตารางทริป");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authLoading, navigate, searchParams, session, tripId]);

  const summary = useMemo(() => {
    const totalCost = places.reduce((sum, place) => sum + place.estimatedCost, 0);
    const totalDuration = places.reduce((sum, place) => sum + place.durationMinutes, 0);
    return { totalCost, totalDuration };
  }, [places]);

  return (
    <div className="font-sarabun min-h-screen bg-[#fcedd3]">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 px-4 py-2 rounded-xl bg-white text-[#102a6b] font-semibold shadow-md"
        >
          ← กลับ
        </button>

        <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg text-white">
          <h2 className="font-prompt font-bold text-2xl mb-1">คำนวณค่าใช้จ่ายทั้งหมดของสถานที่และจัดทริป</h2>
          <p className="text-[#9fd0f0] text-sm">พิจารณาระยะทาง งบประมาณ และเวลาที่ใช้เที่ยวในแต่ละสถานที่ตามที่คุณกรอกไว้</p>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl shadow-lg px-6 py-10 text-center text-[#5990c0]">
            กำลังคำนวณตารางทริป...
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl shadow-lg px-6 py-10 text-center text-[#102a6b]">
            <div className="text-4xl mb-2">⚠️</div>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-prompt font-bold text-lg text-[#102a6b]">แผนการเดินทาง</h3>
                <div className="text-sm text-[#5990c0]">{places.length} สถานที่</div>
              </div>

              <div className="space-y-3">
                {places.map((place, index) => (
                  <div key={place.place_id} className="rounded-2xl border border-[#5990c0]/20 bg-[#f8fbff] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#102a6b]">{index + 1}. {place.place_name}</div>
                        <div className="text-xs text-[#5990c0] mt-1">
                          {place.district ? `${place.district}, ` : ""}{place.province ?? ""}
                        </div>
                      </div>
                      <div className="rounded-full bg-[#015185] px-2.5 py-1 text-[11px] font-semibold text-white">
                        {place.durationMinutes} นาที
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#102a6b]">
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-[11px] text-[#5990c0]">เวลาเข้า</div>
                        <div className="font-semibold">{place.arrivalTime}</div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-[11px] text-[#5990c0]">เวลาออก</div>
                        <div className="font-semibold">{place.departureTime}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#102a6b]">
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-[11px] text-[#5990c0]">ระยะทางจากจุดก่อนหน้า</div>
                        <div className="font-semibold">
                          {place.distanceKmFromPrevious !== null ? `${place.distanceKmFromPrevious.toFixed(1)} km` : "-"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <div className="text-[11px] text-[#5990c0]">ค่าใช้จ่ายโดยประมาณ</div>
                        <div className="font-semibold">{place.estimatedCost.toLocaleString()} บาท</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl shadow-lg p-5">
                <h3 className="font-prompt font-bold text-lg text-[#102a6b] mb-3">สรุป</h3>
                <div className="space-y-3 text-sm text-[#102a6b]">
                  <div className="rounded-xl bg-[#f8fbff] p-3">
                    <div className="text-[#5990c0]">เวลาตั้งแต่เริ่ม</div>
                    <div className="font-semibold">{trip?.start_time || "-"}</div>
                  </div>
                  <div className="rounded-xl bg-[#f8fbff] p-3">
                    <div className="text-[#5990c0]">รวมเวลาเที่ยว</div>
                    <div className="font-semibold">{Math.round(summary.totalDuration / 60)} ชั่วโมง</div>
                  </div>
                  <div className="rounded-xl bg-[#f8fbff] p-3">
                    <div className="text-[#5990c0]">รวมค่าใช้จ่ายโดยประมาณ</div>
                    <div className="font-semibold">{summary.totalCost.toLocaleString()} บาท</div>
                  </div>
                  <div className="rounded-xl bg-[#f8fbff] p-3">
                    <div className="text-[#5990c0]">งบต่อวัน</div>
                    <div className="font-semibold">{trip?.daily_budget ? `${trip.daily_budget.toLocaleString()} บาท` : "-"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}