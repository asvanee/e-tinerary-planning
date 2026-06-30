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
}

export default function AllTrip() {
  const location = useLocation();
  const [recommendations, setRecommendations] = useState<RecommendedPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<RecommendedPlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedPreferences = localStorage.getItem("tripPreferences");
    const tripPreferences = (location.state as { tripPreferences?: TripPreferences } | null)?.tripPreferences ??
      (savedPreferences ? JSON.parse(savedPreferences) : null);

    if (!tripPreferences) {
      setLoading(false);
      return;
    }

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

          {loading && <p className="mt-4 text-[#102a6b]">กำลังคำนวณคำแนะนำสำหรับทริปของคุณ...</p>}
          {error && <p className="mt-4 text-red-600">{error}</p>}

          {!loading && !error && recommendations.length === 0 && (
            <p className="mt-4 text-[#102a6b]">ยังไม่มีข้อมูลคำแนะนำสำหรับทริปนี้</p>
          )}

          {selectedPlace && (
            <div className="detail-card">
              <div className="detail-header">
                <div>
                  <p className="detail-label">รายละเอียดสถานที่</p>
                  <h3 className="detail-title">{selectedPlace.place_name}</h3>
                </div>
                <button type="button" className="detail-close-btn" onClick={() => setSelectedPlace(null)}>
                  ปิด
                </button>
              </div>

              <div className="detail-body">
                <p className="detail-text">📍 {selectedPlace.formatted_address || `${selectedPlace.province || ""} ${selectedPlace.district || ""}`.trim()}</p>
                <p className="detail-text">⭐ Rating: {selectedPlace.rating ?? "-"} ({selectedPlace.user_ratings_total ?? 0} รีวิว)</p>
                <p className="detail-text">🏷️ คะแนนรวม: {selectedPlace.totalScore.toFixed(2)}</p>
                <p className="detail-text">📊 หมวดหมู่ {selectedPlace.categoryScore.toFixed(2)} • เรตติ้ง {selectedPlace.ratingScore.toFixed(2)} • ระยะทาง {selectedPlace.distanceScore.toFixed(2)} • งบ {selectedPlace.budgetScore.toFixed(2)} • อากาศ {selectedPlace.weatherScore.toFixed(2)}</p>
                {selectedPlace.phone_number && <p className="detail-text">📞 {selectedPlace.phone_number}</p>}
                {selectedPlace.website && (
                  <p className="detail-text">
                    🌐 <a href={selectedPlace.website} target="_blank" rel="noreferrer">{selectedPlace.website}</a>
                  </p>
                )}
              </div>
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
              </div>
              <button
                type="button"
                className="view-btn"
                onClick={() => setSelectedPlace(place)}
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