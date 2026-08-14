import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../../../components/navbar";
import { useAuth } from "../../../auth/hooks/useAuth";
import "./auto.css";

interface AutoPlace {
  place_id: string;
  place_name: string;
  categoryName?: string;
  poiScore?: number;
  latitude: number;
  longitude: number;
  opening_hours?: any;
  default_duration_min?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  visit_order?: number;
  travel_time_from_prev?: number | null;
  distance_from_prev?: number | null;
  place_cost?: number | null;
}

interface AutoDay {
  day_number?: number;
  dayNumber?: number;
  trip_day_id?: number;
  tripDayId?: number;
  visit_date?: string;
  visitDate?: string;
  start_time?: string;
  startTime?: string;
  end_time?: string;
  endTime?: string;
  places?: AutoPlace[];
  selected_places?: AutoPlace[];
  items?: AutoPlace[];
  day_places?: AutoPlace[];
  total_distance_km?: number;
  totalDistanceKm?: number;
}

interface AutoTripResponse {
  success: boolean;
  message: string;
  trip_id: string;
  selected_places?: AutoPlace[];
  days?: AutoDay[];
  total_distance_km?: number;
}

export default function AutoTrip() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();

  const [data, setData] = useState<AutoTripResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

    const controller = new AbortController();

    const fetchAutoTrip = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/itinerary/trips/${tripId}/auto`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: controller.signal,
        });

        const text = await response.text();
        let result: AutoTripResponse;

        try {
          result = JSON.parse(text);
        } catch {
          throw new Error(`API ไม่ได้ส่ง JSON กลับมา (status ${response.status})`);
        }

        if (!response.ok) {
          throw new Error(result.message || "จัดทริปอัตโนมัติไม่สำเร็จ");
        }

        console.log("🔥 AUTO TRIP DATA:", result);
        setData(result);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("Auto Trip error:", err);
        setError(err.message || "เกิดข้อผิดพลาดในการจัดทริปอัตโนมัติ");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchAutoTrip();

    return () => {
      controller.abort();
    };
  }, [tripId, session, authLoading, navigate]);

  /*
   * Helper: ดึงสถานที่ของวันตาม Day Index
   */
  const getDayPlaces = (dayIndex: number): AutoPlace[] => {
    if (!data) return [];

    const day = data.days?.[dayIndex];

    // 1. เช็คว่ามีสถานที่ใน Object Day หรือไม่
    const directPlaces =
      day?.places ??
      day?.selected_places ??
      day?.items ??
      day?.day_places;

    if (directPlaces && directPlaces.length > 0) {
      return directPlaces;
    }

    // 2. ถ้าใน Day ไม่มีสถานที่ ให้แบ่งจาก selected_places หลักของ Root
    const allRootPlaces = data.selected_places ?? [];
    const totalDaysCount = data.days?.length || 1;

    if (allRootPlaces.length === 0) return [];

    const placesPerDay = Math.ceil(allRootPlaces.length / totalDaysCount);
    const startIndex = dayIndex * placesPerDay;
    const endIndex = startIndex + placesPerDay;

    return allRootPlaces.slice(startIndex, endIndex);
  };

  /*
   * รวมสถานที่ทั้งหมด
   */
  const allPlaces = useMemo(() => {
    if (!data) return [];

    if (data.selected_places && data.selected_places.length > 0) {
      return data.selected_places;
    }

    return data.days?.flatMap((_, idx) => getDayPlaces(idx)) ?? [];
  }, [data]);

  const totalPlaces = allPlaces.length;
  const totalDays = data?.days?.length ?? 0;

  const totalDistance =
    data?.total_distance_km ??
    data?.days?.reduce(
      (sum, day) =>
        sum + (day.total_distance_km ?? day.totalDistanceKm ?? 0),
      0
    ) ??
    0;

  /*
   * ข้อมูลและสถานที่ของวันที่เลือกปัจจุบัน
   */
  const currentDay = data?.days?.[selectedDay];
  const currentPlaces = getDayPlaces(selectedDay);

  const formatDate = (date?: string) => {
    if (!date) return "";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (time?: string | null) => {
    if (!time) return "--:--";
    return time.substring(0, 5);
  };

  const formatDuration = (minutes?: number | null) => {
    if (minutes == null) return "-";
    if (minutes < 60) return `${minutes} นาที`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins === 0 ? `${hours} ชม.` : `${hours} ชม. ${mins} นาที`;
  };

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

  const handleEditTrip = () => {
    navigate(`/trip/${tripId}/editor`, {
      state: { autoTrip: data, tripId },
    });
  };

  const handleConfirmTrip = async () => {
    if (!data || !tripId || !session) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      const days =
        data.days?.map((day, index) => {
          const dayId = day.trip_day_id ?? day.tripDayId;
          const places = getDayPlaces(index);
          return {
            trip_day_id: dayId,
            place_ids: places.map((place) => place.place_id),
          };
        }) ?? [];

      const response = await fetch(`/api/itinerary/trips/${tripId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ days }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "บันทึกแผนเดินทางไม่สำเร็จ");

      setSaveMessage("บันทึกแผนเดินทางสำเร็จ");
      setTimeout(() => navigate(`/trip/${tripId}`), 1000);
    } catch (err: any) {
      console.error(err);
      setSaveMessage(err.message || "บันทึกแผนเดินทางไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="auto-trip-page">
        <Navbar />
        <div className="auto-trip-loading">
          <div className="auto-trip-loading-icon">🗺️</div>
          <h2>กำลังจัดทริปอัตโนมัติ</h2>
          <p>ระบบกำลังวิเคราะห์สถานที่ และจัดลำดับเส้นทางที่เหมาะสม</p>
          <div className="loading-bar">
            <div className="loading-bar-inner" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="auto-trip-page">
        <Navbar />
        <div className="auto-trip-error">
          <div className="error-icon">⚠️</div>
          <h2>จัดทริปอัตโนมัติไม่สำเร็จ</h2>
          <p>{error || "ไม่พบข้อมูลทริป"}</p>
          <div className="error-actions">
            <button className="secondary-button" onClick={handleBack}>
              ← กลับ
            </button>
            <button className="primary-button" onClick={() => window.location.reload()}>
              ลองอีกครั้ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auto-trip-page">
      <Navbar />

      <main className="auto-trip-container">
        <button className="back-button" onClick={handleBack}>
          ← กลับสถานที่แนะนำ
        </button>

        <section className="auto-trip-header">
          <div>
            <div className="header-label">✨ AUTO TRIP</div>
            <h1>ทริปของคุณพร้อมแล้ว</h1>
            <p>
              ระบบจัดลำดับสถานที่ให้โดยอัตโนมัติ โดยคำนึงถึงระยะทาง เวลา และข้อจำกัดของทริป
            </p>
          </div>
          <div className="success-badge">✓ จัดทริปสำเร็จ</div>
        </section>

        <section className="summary-grid">
          <div className="summary-card">
            <div className="summary-icon">📅</div>
            <div>
              <div className="summary-value">{totalDays}</div>
              <div className="summary-label">วันเดินทาง</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">📍</div>
            <div>
              <div className="summary-value">{totalPlaces}</div>
              <div className="summary-label">สถานที่ทั้งหมด</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">🚗</div>
            <div>
              <div className="summary-value">{Number(totalDistance).toFixed(1)}</div>
              <div className="summary-label">กิโลเมตรรวม</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">⭐</div>
            <div>
              <div className="summary-value">
                {totalPlaces > 0
                  ? (
                      allPlaces.reduce((sum, place) => sum + (place.poiScore ?? 0), 0) /
                      totalPlaces
                    ).toFixed(2)
                  : "0.00"}
              </div>
              <div className="summary-label">POI Score เฉลี่ย</div>
            </div>
          </div>
        </section>

        <section className="route-section">
          <div className="section-title">
            <div>
              <h2>เส้นทางการเดินทาง</h2>
              <p>ลำดับสถานที่ที่ระบบคำนวณให้</p>
            </div>
          </div>

          <div className="route-map-placeholder">
            <div className="map-background">
              <div className="map-center-content">
                <div className="map-icon">🗺️</div>
                <h3>แผนที่เส้นทาง</h3>
                <p>แสดงเส้นทางการเดินทางของแต่ละวัน</p>
                <div className="map-route-line">
                  <span>📍 จุดเริ่มต้น</span>
                  <span>→</span>
                  <span>{currentPlaces.length} สถานที่</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="day-section">
          <div className="section-title">
            <div>
              <h2>แผนการเดินทางรายวัน</h2>
              <p>เลือกวันที่ต้องการดูรายละเอียด</p>
            </div>
          </div>

          <div className="day-tabs">
            {data.days?.map((day, index) => {
              const dayNumber = day.day_number ?? day.dayNumber ?? index + 1;
              const date = day.visit_date ?? day.visitDate;
              const places = getDayPlaces(index);

              return (
                <button
                  key={index}
                  onClick={() => setSelectedDay(index)}
                  className={selectedDay === index ? "day-tab active" : "day-tab"}
                >
                  <span>วันที่ {dayNumber}</span>
                  <small>{formatDate(date)}</small>
                  <small>{places.length} สถานที่</small>
                </button>
              );
            })}
          </div>
        </section>

        {currentDay && (
          <section className="current-day-card">
            <div>
              <div className="current-day-label">
                DAY {currentDay.day_number ?? currentDay.dayNumber ?? selectedDay + 1}
              </div>
              <h2>
                วันที่ {currentDay.day_number ?? currentDay.dayNumber ?? selectedDay + 1}
              </h2>
              <p>{formatDate(currentDay.visit_date ?? currentDay.visitDate)}</p>
            </div>

            <div className="day-time-box">
              <span>⏰</span>
              <div>
                <small>เวลาเที่ยว</small>
                <strong>
                  {formatTime(currentDay.start_time ?? currentDay.startTime)}
                  {" - "}
                  {formatTime(currentDay.end_time ?? currentDay.endTime)}
                </strong>
              </div>
            </div>
          </section>
        )}

        <section className="itinerary-section">
          <div className="section-title">
            <div>
              <h2>สถานที่ในวันนี้</h2>
              <p>ระบบเรียงลำดับการเดินทางให้แล้ว</p>
            </div>
            <span className="place-count">{currentPlaces.length} สถานที่</span>
          </div>

          <div className="timeline">
            {currentPlaces.length === 0 && (
              <div className="empty-day">ไม่มีสถานที่ในวันนี้</div>
            )}

            {currentPlaces.map((place, index) => {
              const score = place.poiScore ?? 0;

              return (
                <div className="timeline-item" key={`${place.place_id}-${index}`}>
                  <div className="timeline-marker">{index + 1}</div>
                  {index < currentPlaces.length - 1 && <div className="timeline-line" />}

                  <div className="timeline-content">
                    <div className="place-card">
                      <div className="place-top">
                        <div>
                          <div className="place-order">สถานที่ที่ {index + 1}</div>
                          <h3>{place.place_name}</h3>
                          {place.categoryName && (
                            <span className="category-tag">{place.categoryName}</span>
                          )}
                        </div>

                        <div className="poi-score">
                          <strong>{(score * 100).toFixed(0)}</strong>
                          <span>POI Score</span>
                        </div>
                      </div>

                      <div className="place-info-grid">
                        <div className="info-item">
                          <span>⏱️</span>
                          <div>
                            <small>ระยะเวลาเที่ยว</small>
                            <strong>{formatDuration(place.default_duration_min)}</strong>
                          </div>
                        </div>

                        <div className="info-item">
                          <span>🕐</span>
                          <div>
                            <small>เวลาเข้าชม</small>
                            <strong>
                              {formatTime(place.start_time)} - {formatTime(place.end_time)}
                            </strong>
                          </div>
                        </div>

                        <div className="info-item">
                          <span>🚗</span>
                          <div>
                            <small>เดินทางจากจุดก่อนหน้า</small>
                            <strong>
                              {place.distance_from_prev != null
                                ? `${Number(place.distance_from_prev).toFixed(1)} km`
                                : "-"}
                            </strong>
                          </div>
                        </div>

                        <div className="info-item">
                          <span>⏳</span>
                          <div>
                            <small>เวลาเดินทาง</small>
                            <strong>{formatDuration(place.travel_time_from_prev)}</strong>
                          </div>
                        </div>
                      </div>

                      {place.opening_hours && (
                        <div className="opening-hours">
                          <span>🕘</span>
                          <span>มีข้อมูลเวลาเปิด-ปิด</span>
                        </div>
                      )}

                      <button
                        className="map-place-button"
                        onClick={() => openGoogleMaps(place.latitude, place.longitude)}
                      >
                        📍 ดูตำแหน่งบน Google Maps
                      </button>
                    </div>

                    {index < currentPlaces.length - 1 && (
                      <div className="travel-between">
                        <span>🚗</span>
                        <span>เดินทางต่อ</span>
                        <span>
                          {place.distance_from_prev != null
                            ? `${Number(place.distance_from_prev).toFixed(1)} km`
                            : ""}
                        </span>
                        {place.travel_time_from_prev != null && (
                          <span>• {formatDuration(place.travel_time_from_prev)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="algorithm-section">
          <div className="algorithm-icon">🤖</div>
          <div>
            <h2>ระบบจัดทริปนี้ทำงานอย่างไร?</h2>
            <p>
              ระบบนำข้อมูลสถานที่และข้อมูลทริปมาวิเคราะห์เพื่อจัดลำดับการเดินทาง
              โดยคำนึงถึงความเหมาะสมของสถานที่ ระยะทาง และข้อจำกัดด้านเวลา
            </p>
            <div className="algorithm-steps">
              <div>
                <span>1</span>
                <p>คัดเลือกสถานที่ที่เหมาะสม</p>
              </div>
              <div>
                <span>2</span>
                <p>วิเคราะห์ระยะทางระหว่างสถานที่</p>
              </div>
              <div>
                <span>3</span>
                <p>จัดลำดับเส้นทาง</p>
              </div>
              <div>
                <span>4</span>
                <p>แบ่งสถานที่ตามวันและเวลาที่มี</p>
              </div>
            </div>
          </div>
        </section>

        {saveMessage && (
          <div
            className={
              saveMessage.includes("สำเร็จ")
                ? "save-message success"
                : "save-message error"
            }
          >
            {saveMessage}
          </div>
        )}

        <section className="action-bar">
          <button className="secondary-button" onClick={handleBack}>
            ← เลือกสถานที่ใหม่
          </button>
          <div className="action-right">
            <button className="edit-button" onClick={handleEditTrip}>
              ✏️ แก้ไขเส้นทาง
            </button>
            <button
              className="confirm-button"
              onClick={handleConfirmTrip}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : "✓ ยืนยันและบันทึกทริป"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}