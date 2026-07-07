import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Navbar from "../../../components/Navbar";
import "./alltrip.css";

interface TripPreferences {
  province?: string | null;
  city?: string | null;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  number_of_people?: number | null;
  total_budget?: number | null;
  budget_type?: string;
  available_time_per_day?: number | null;
  tags?: string[];
}

interface RecommendedPlace {
  place_id: string;
  place_name: string;
  province?: string | null;
  district?: string | null;
  formatted_address?: string | null;
  rating?: number | null;
  phone_number?: string | null;
  website?: string | null;
  user_ratings_total?: number | null;
  opening_hours?: unknown;
  totalScore: number;
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  budgetScore: number;
  weatherScore: number;
  isOpen?: boolean;
}

export default function AllTrip() {
  const location = useLocation();
  const [recommendations, setRecommendations] = useState<RecommendedPlace[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<string>("");

  useEffect(() => {
    const savedPreferences = localStorage.getItem("tripPreferences");
    const tripPreferences = (location.state as { tripPreferences?: TripPreferences } | null)?.tripPreferences ??
      (savedPreferences ? JSON.parse(savedPreferences) : null);

    if (!tripPreferences) {
      setLoading(false);
      return;
    }

    setSelectedProvince(tripPreferences.province || "");
    setLoading(true);
    fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tripPreferences),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("ไม่สามารถโหลดคำแนะนำทริปได้");
        }
        return res.json();
      })
      .then((data) => {
        setRecommendations(Array.isArray(data) ? data : []);
        setError(null);
      })
      .catch(() => {
        setError("ไม่สามารถโหลดคำแนะนำทริปได้ในขณะนี้");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [location.state]);

  return (
    <div className="font-sarabun min-h-screen bg-[#fcedd3]">
      <Navbar />
      <div className="home pt-4">
        <div className="container">
          <div className="search-box">
            <input className="search-input" placeholder="ค้นหาสถานที่ 🔍" />
          </div>

          {selectedProvince && (
            <p className="mt-4 text-[#102a6b] font-semibold">
              แสดงสถานที่ในจังหวัด: {selectedProvince}
            </p>
          )}

          {loading && <p className="mt-4 text-[#102a6b]">กำลังคำนวณคำแนะนำสำหรับทริปของคุณ...</p>}
          {error && <p className="mt-4 text-red-600">{error}</p>}

          {!loading && !error && recommendations.length === 0 && (
            <p className="mt-4 text-[#102a6b]">ยังไม่มีข้อมูลคำแนะนำสำหรับทริปนี้</p>
          )}

          {selectedPlaces.length > 0 && (
            <div className="space-y-3">
              {recommendations
                .filter((place) => selectedPlaces.includes(place.place_id))
                .map((place) => (
                  <div key={place.place_id} className="detail-card">
                    <div className="detail-header">
                      <div>
                        <p className="detail-label">รายละเอียดสถานที่</p>
                        <h3 className="detail-title">{place.place_name}</h3>
                      </div>
                      <button
                        type="button"
                        className="detail-close-btn"
                        onClick={() => setSelectedPlaces((prev) => prev.filter((id) => id !== place.place_id))}
                      >
                        ปิด
                      </button>
                    </div>

                    <div className="detail-body">
                      <p className="detail-text">📍 {place.formatted_address || `${place.province || ""} ${place.district || ""}`.trim()}</p>
                      <p className="detail-text">⭐ Rating: {place.rating ?? "-"} ({place.user_ratings_total ?? 0} รีวิว)</p>
                      <p className="detail-text">🏷️ คะแนนรวม: {place.totalScore.toFixed(2)}</p>
                      <p className="detail-text">📊 หมวดหมู่ {place.categoryScore.toFixed(2)} • เรตติ้ง {place.ratingScore.toFixed(2)} • ระยะทาง {place.distanceScore.toFixed(2)} • งบ {place.budgetScore.toFixed(2)} • อากาศ {place.weatherScore.toFixed(2)}</p>
                      {place.phone_number && <p className="detail-text">📞 {place.phone_number}</p>}
                      {place.website && (
                        <p className="detail-text">
                          🌐 <a href={place.website} target="_blank" rel="noreferrer">{place.website}</a>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {recommendations.map((place) => (
            <div key={place.place_id} className="place-card">
              <div className="place-image"></div>
              <div className="px-4 pb-4">
                <h3 className="font-prompt text-lg font-semibold text-[#102a6b]">{place.place_name}</h3>
                <p className="text-sm text-[#5990c0]">
                  {place.province}
                  {place.district ? ` • ${place.district}` : ""}
                </p>
                <p className="mt-2 text-sm text-[#102a6b]">
                  คะแนนรวม: <span className="font-bold">{place.totalScore.toFixed(2)}</span>
                </p>
                <p className="text-xs text-[#102a6b]">
                  หมวดหมู่ {place.categoryScore.toFixed(2)} • เรตติ้ง {place.ratingScore.toFixed(2)} • ระยะทาง {place.distanceScore.toFixed(2)} • งบ {place.budgetScore.toFixed(2)} • อากาศ {place.weatherScore.toFixed(2)}
                </p>
                <p className={`mt-2 text-sm font-semibold ${place.isOpen === false ? "text-red-600" : "text-emerald-600"}`}>
                  {place.isOpen === false ? "ปิดในช่วงเวลานี้" : "เปิดอยู่"}
                </p>
              </div>
              <button
                type="button"
                className="view-btn"
                onClick={() =>
                  setSelectedPlaces((prev) =>
                    prev.includes(place.place_id) ? prev : [...prev, place.place_id]
                  )
                }
              >
                ดูรายละเอียด
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}