import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../../../components/navbar";
import { useAuth } from "../../../auth/hooks/useAuth";
import "./auto.css";

// =========================================================
// React Leaflet
// =========================================================
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// =========================================================
// Leaflet Icon
// =========================================================
const defaultIcon = L.icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// =========================================================
// Interfaces
// =========================================================

interface AutoTripStop {
  place_id: string;
  place_name: string;
  categoryName?: string;
  poiScore?: number;

  latitude: number;
  longitude: number;

  start_time: string;
  end_time: string;

  duration_min: number;

  travel_distance_km: number;
  travel_time_min: number;

  previous_place_name: string;
}

interface AutoTripDay {
  day: number;
  date: string;

  stops: AutoTripStop[];

  total_distance_km: number;
  total_travel_time_min: number;
  total_visit_time_min: number;
}

interface AutoTripResponse {
  success?: boolean;
  message?: string;

  trip_id: string;

  // จุดเริ่มต้นของทริป
  start_lat?: number | null;
  start_lng?: number | null;

  selected_places?: any[];

  days?: AutoTripDay[];

  total_distance_km?: number;
}

// =========================================================
// Component
// =========================================================

export default function AutoTrip() {
  const { tripId } = useParams();
  const navigate = useNavigate();

  const {
    session,
    isLoading: authLoading,
  } = useAuth();

  // =======================================================
  // State
  // =======================================================

  const [data, setData] =
    useState<AutoTripResponse | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [selectedDay, setSelectedDay] =
    useState(0);

  const [saving, setSaving] =
    useState(false);

  const [saveMessage, setSaveMessage] =
    useState<string | null>(null);

  // =======================================================
  // Fetch Auto Trip
  // =======================================================

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
        const response = await fetch(
          `/api/itinerary/trips/${tripId}/auto`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
              Authorization:
                `Bearer ${session.access_token}`,
            },

            signal: controller.signal,
          }
        );

        const text = await response.text();

        let result: AutoTripResponse;

        try {
          result = JSON.parse(text);
        } catch {
          throw new Error(
            `API ไม่ได้ส่ง JSON กลับมา (status ${response.status})`
          );
        }

        if (!response.ok) {
          throw new Error(
            result.message ||
              "จัดทริปอัตโนมัติไม่สำเร็จ"
          );
        }

        console.log(
          "🔥 AUTO TRIP DATA:",
          result
        );

        setData(result);

        // ถ้าไม่มีวัน
        if (!result.days || result.days.length === 0) {
          setSelectedDay(0);
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          return;
        }

        console.error(
          "Auto Trip error:",
          err
        );

        setError(
          err.message ||
            "เกิดข้อผิดพลาดในการจัดทริปอัตโนมัติ"
        );
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
  }, [
    tripId,
    session,
    authLoading,
    navigate,
  ]);

  // =======================================================
  // Get stops ของวันที่เลือก
  // =======================================================

  const getDayStops = (
    dayIndex: number
  ): AutoTripStop[] => {
    if (
      !data ||
      !data.days ||
      !data.days[dayIndex]
    ) {
      return [];
    }

    return data.days[dayIndex].stops ?? [];
  };

  // =======================================================
  // All Stops
  // =======================================================

  const allStops = useMemo(() => {
    if (!data || !data.days) {
      return [];
    }

    return data.days.flatMap(
      (day) => day.stops ?? []
    );
  }, [data]);

  // =======================================================
  // Summary
  // =======================================================

  const totalPlaces =
    allStops.length;

  const totalDays =
    data?.days?.length ?? 0;

  const totalDistance =
    data?.total_distance_km ??
    data?.days?.reduce(
      (sum, day) =>
        sum +
        (day.total_distance_km ?? 0),
      0
    ) ??
    0;

  // =======================================================
  // Current Day
  // =======================================================

  const currentDay =
    data?.days?.[selectedDay];

  const currentStops =
    getDayStops(selectedDay);

  // =======================================================
  // Start Position
  // =======================================================

  const startPosition =
    useMemo<[number, number] | null>(() => {
      if (
        data?.start_lat == null ||
        data?.start_lng == null
      ) {
        return null;
      }

      const lat = Number(
        data.start_lat
      );

      const lng = Number(
        data.start_lng
      );

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return null;
      }

      return [lat, lng];
    }, [data]);

  // =======================================================
  // Route Positions
  //
  // จุดเริ่มต้น
  //      ↓
  // สถานที่ 1
  //      ↓
  // สถานที่ 2
  //      ↓
  // สถานที่ 3
  // =======================================================

  const routePositions =
    useMemo<[number, number][]>(() => {
      const positions: [number, number][] =
        [];

      // จุดเริ่มต้น
      if (startPosition) {
        positions.push(startPosition);
      }

      // สถานที่
      currentStops.forEach((stop) => {
        const lat = Number(
          stop.latitude
        );

        const lng = Number(
          stop.longitude
        );

        if (
          Number.isFinite(lat) &&
          Number.isFinite(lng)
        ) {
          positions.push([
            lat,
            lng,
          ]);
        }
      });

      return positions;
    }, [
      startPosition,
      currentStops,
    ]);

  // =======================================================
  // Map Center
  // =======================================================

  const mapCenter =
    useMemo<[number, number]>(() => {
      // ถ้ามีจุดเริ่มต้น
      if (startPosition) {
        return startPosition;
      }

      // ถ้าไม่มีจุดเริ่มต้น
      // ใช้สถานที่แรก
      if (currentStops.length > 0) {
        return [
          Number(
            currentStops[0].latitude
          ),
          Number(
            currentStops[0].longitude
          ),
        ];
      }

      // Default ประเทศไทย
      return [
        13.7563,
        100.5018,
      ];
    }, [
      startPosition,
      currentStops,
    ]);

  // =======================================================
  // Format Date
  // =======================================================

  const formatDate = (
    date?: string
  ) => {
    if (!date) {
      return "";
    }

    const parsed =
      new Date(date);

    if (
      Number.isNaN(
        parsed.getTime()
      )
    ) {
      return date;
    }

    return parsed.toLocaleDateString(
      "th-TH",
      {
        day: "numeric",
        month: "long",
        year: "numeric",
      }
    );
  };

  // =======================================================
  // Format Duration
  // =======================================================

  const formatDuration = (
    minutes?: number | null
  ) => {
    if (minutes == null) {
      return "-";
    }

    if (minutes < 60) {
      return `${minutes} นาที`;
    }

    const hours =
      Math.floor(minutes / 60);

    const mins =
      minutes % 60;

    if (mins === 0) {
      return `${hours} ชม.`;
    }

    return `${hours} ชม. ${mins} นาที`;
  };

  // =======================================================
  // Format Distance
  // =======================================================

  const formatDistance = (
    distance?: number | null
  ) => {
    if (distance == null) {
      return "-";
    }

    return `${Number(
      distance
    ).toFixed(1)} กม.`;
  };

  // =======================================================
  // Open Google Maps
  // =======================================================

  const openGoogleMaps = (
    latitude: number,
    longitude: number
  ) => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // =======================================================
  // Back
  // =======================================================

  const handleBack = () => {
    navigate(
      `/trip/${tripId}/recommendations`
    );
  };

  // =======================================================
  // Edit Trip
  // =======================================================

  const handleEditTrip = () => {
    navigate(
      `/trip/${tripId}/editor`,
      {
        state: {
          autoTrip: data,
          tripId,
        },
      }
    );
  };

// =======================================================
// Confirm & Save Trip to Supabase
// =======================================================

const handleConfirmTrip = async () => {
  if (!data || !tripId || !session) {
    return;
  }

  setSaving(true);
  setSaveMessage(null);

  try {
    // =====================================================
    // 1. ดึงข้อมูล itinerary / trip days ที่มีอยู่ใน Supabase
    // =====================================================

    const itineraryResponse = await fetch(
      `/api/itinerary/trips/${tripId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    const itineraryText = await itineraryResponse.text();

    let itineraryResult: any;

    try {
      itineraryResult = JSON.parse(itineraryText);
    } catch {
      throw new Error(
        `ไม่สามารถอ่านข้อมูลวันเดินทางได้ (status ${itineraryResponse.status})`
      );
    }

    if (!itineraryResponse.ok) {
      throw new Error(
        itineraryResult.message ||
          "ไม่สามารถดึงข้อมูลวันเดินทางได้"
      );
    }

    console.log(
      "📦 EXISTING ITINERARY:",
      itineraryResult
    );

    // =====================================================
    // 2. หา trip days จาก response
    // =====================================================

    const tripDays =
      itineraryResult.tripDays ??
      itineraryResult.days ??
      itineraryResult.data?.tripDays ??
      itineraryResult.data?.days ??
      [];

    if (!Array.isArray(tripDays) || tripDays.length === 0) {
      throw new Error(
        "ไม่พบข้อมูลวันเดินทางของทริปนี้ใน Supabase"
      );
    }

    console.log(
      "📅 TRIP DAYS:",
      tripDays
    );

    // =====================================================
    // 3. สร้าง payload สำหรับ PUT
    // =====================================================

    const days = data.days?.map((day, index) => {
      const stops = getDayStops(index);

      // หา trip day จริงจาก Supabase
      const tripDay =
        tripDays.find(
          (item: any) =>
            Number(
              item.day_number ??
              item.day ??
              item.day_no
            ) === Number(day.day)
        ) ?? tripDays[index];

      // รองรับชื่อ field หลายแบบ
      const tripDayId =
        tripDay?.trip_day_id ??
        tripDay?.tripDayId ??
        tripDay?.id;

      if (!tripDayId) {
        throw new Error(
          `ไม่พบ trip_day_id ของวันที่ ${day.day}`
        );
      }

      return {
        trip_day_id: tripDayId,

        place_ids: stops.map(
          (stop) => stop.place_id
        ),
      };
    }) ?? [];

    // =====================================================
    // 4. ตรวจสอบ payload ก่อนส่ง
    // =====================================================

    console.log(
      "💾 SAVE ITINERARY PAYLOAD:",
      {
        days,
      }
    );

    if (days.length === 0) {
      throw new Error(
        "ไม่มีข้อมูลวันที่ต้องการบันทึก"
      );
    }

    // =====================================================
    // 5. PUT ไป Backend
    // Backend จะบันทึกลง Supabase
    // =====================================================

    const response = await fetch(
      `/api/itinerary/trips/${tripId}`,
      {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",

          Authorization:
            `Bearer ${session.access_token}`,
        },

        body: JSON.stringify({
          days,
        }),
      }
    );

    const result = await response.json();

    console.log(
      "💾 SAVE RESULT:",
      result
    );

    if (!response.ok) {
      throw new Error(
        result.message ||
          "บันทึกแผนเดินทางไม่สำเร็จ"
      );
    }

    // =====================================================
    // 6. บันทึกสำเร็จ
    // =====================================================

    setSaveMessage(
      "บันทึกแผนเดินทางลงฐานข้อมูลสำเร็จ"
    );

    setTimeout(() => {
      navigate(`/trip/${tripId}/detail`);
    }, 1000);

  } catch (err: any) {
    console.error(
      "❌ SAVE AUTO TRIP ERROR:",
      err
    );

    setSaveMessage(
      err.message ||
        "บันทึกแผนเดินทางไม่สำเร็จ"
    );
  } finally {
    setSaving(false);
  }
};

  // =======================================================
  // Error
  // =======================================================

  if (error || !data) {
    return (
      <div className="auto-trip-page">
        <Navbar />

        <div className="auto-trip-error">
          <div className="error-icon">
            ⚠️
          </div>

          <h2>
            จัดทริปอัตโนมัติไม่สำเร็จ
          </h2>

          <p>
            {error ||
              "ไม่พบข้อมูลทริป"}
          </p>

          <div className="error-actions">
            <button
              className="secondary-button"
              onClick={handleBack}
            >
              ← กลับ
            </button>

            <button
              className="primary-button"
              onClick={() =>
                window.location.reload()
              }
            >
              ลองอีกครั้ง
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =======================================================
  // Main UI
  // =======================================================

  return (
    <div className="auto-trip-page">
      <Navbar />

      <main className="auto-trip-container">

        {/* =================================================
            Back
        ================================================= */}

        <button
          className="back-button"
          onClick={handleBack}
        >
          ← กลับสถานที่แนะนำ
        </button>

        {/* =================================================
            Header
        ================================================= */}

        <section className="auto-trip-header">
          <div>
            <div className="header-label">
              ✨ AUTO TRIP
            </div>

            <h1>
              ทริปของคุณพร้อมแล้ว
            </h1>

            <p>
              ระบบจัดลำดับสถานที่ให้โดยอัตโนมัติ
              โดยคำนึงถึงระยะทาง เวลา
              และข้อจำกัดของทริป
            </p>
          </div>
        </section>

        {/* =================================================
            Summary
        ================================================= */}

        <section className="summary-grid">

          {/* วัน */}
          <div className="summary-card">
            <div className="summary-icon">
              📅
            </div>

            <div>
              <div className="summary-value">
                {totalDays}
              </div>

              <div className="summary-label">
                วันเดินทาง
              </div>
            </div>
          </div>

          {/* สถานที่ */}
          <div className="summary-card">
            <div className="summary-icon">
              📍
            </div>

            <div>
              <div className="summary-value">
                {totalPlaces}
              </div>

              <div className="summary-label">
                สถานที่ทั้งหมด
              </div>
            </div>
          </div>

          {/* ระยะทาง */}
          <div className="summary-card">
            <div className="summary-icon">
              🚗
            </div>

            <div>
              <div className="summary-value">
                {Number(
                  totalDistance
                ).toFixed(1)}
              </div>

              <div className="summary-label">
                กิโลเมตรรวม
              </div>
            </div>
          </div>

          {/* POI Score */}
          <div className="summary-card">
            <div className="summary-icon">
              ⭐
            </div>

            <div>
              <div className="summary-value">
                {totalPlaces > 0
                  ? (
                      allStops.reduce(
                        (
                          sum,
                          stop
                        ) =>
                          sum +
                          (stop.poiScore ??
                            0),
                        0
                      ) /
                      totalPlaces
                    ).toFixed(2)
                  : "0.00"}
              </div>

              <div className="summary-label">
                POI Score เฉลี่ย
              </div>
            </div>
          </div>

        </section>

        {/* =================================================
            MAP
        ================================================= */}

        <section className="route-section">

          <div className="section-title">
            <div>

              <h2>
                🗺️ เส้นทางการเดินทาง
              </h2>

              <p>
                เส้นทางวันที่{" "}
                {selectedDay + 1}

                {startPosition
                  ? " โดยเริ่มจากจุดเริ่มต้นของทริป"
                  : ""}
              </p>

            </div>
          </div>

          {/* ถ้าไม่มีสถานที่ */}
          {currentStops.length === 0 ? (
            <div
              className="empty-day"
              style={{
                padding: "40px",
                textAlign: "center",
              }}
            >
              ไม่มีข้อมูลสถานที่
              สำหรับวันนี้
            </div>
          ) : (
            <div className="route-map-container">

              <MapContainer
                key={`map-${selectedDay}-${mapCenter[0]}-${mapCenter[1]}`}
                center={mapCenter}
                zoom={13}
                scrollWheelZoom={true}
                style={{
                  height: "450px",
                  width: "100%",
                }}
              >

                {/* Tile */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* =======================================
                    เส้นทาง
                ======================================= */}

                {routePositions.length > 1 && (
                  <Polyline
                    positions={
                      routePositions
                    }
                    pathOptions={{
                      color:
                        "#2563eb",
                      weight: 5,
                      opacity: 0.8,
                    }}
                  />
                )}

                {/* =======================================
                    จุดเริ่มต้น
                ======================================= */}

                {startPosition && (
                  <Marker
                    position={
                      startPosition
                    }
                    icon={
                      defaultIcon
                    }
                  >
                    <Popup>
                      <div
                        style={{
                          textAlign:
                            "center",
                          minWidth:
                            "150px",
                        }}
                      >
                        <strong>
                          📍 จุดเริ่มต้น
                        </strong>

                        <div
                          style={{
                            marginTop:
                              "5px",
                            fontSize:
                              "12px",
                          }}
                        >
                          จุดเริ่มต้น
                          ของทริป
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* =======================================
                    สถานที่
                ======================================= */}

                {currentStops.map(
                  (
                    stop,
                    index
                  ) => (
                    <Marker
                      key={`${stop.place_id}-${index}`}
                      position={[
                        Number(
                          stop.latitude
                        ),
                        Number(
                          stop.longitude
                        ),
                      ]}
                      icon={
                        defaultIcon
                      }
                    >
                      <Popup>

                        <div
                          style={{
                            minWidth:
                              "190px",
                            textAlign:
                              "center",
                          }}
                        >

                          <div
                            style={{
                              color:
                                "#2563eb",
                              fontWeight:
                                "bold",
                              marginBottom:
                                "5px",
                            }}
                          >
                            📍 สถานที่ที่{" "}
                            {index + 1}
                          </div>

                          <strong>
                            {
                              stop.place_name
                            }
                          </strong>

                          <div
                            style={{
                              marginTop:
                                "8px",
                              fontSize:
                                "13px",
                            }}
                          >
                            🕐 เวลาเข้าชม
                            <br />

                            {
                              stop.start_time
                            }
                            {" - "}
                            {
                              stop.end_time
                            }
                          </div>

                          <div
                            style={{
                              marginTop:
                                "5px",
                              fontSize:
                                "13px",
                            }}
                          >
                            ⏱️ ระยะเวลา{" "}
                            {formatDuration(
                              stop.duration_min
                            )}
                          </div>

                          <div
                            style={{
                              marginTop:
                                "5px",
                              fontSize:
                                "13px",
                            }}
                          >
                            🚗{" "}
                            {formatDistance(
                              stop.travel_distance_km
                            )}
                          </div>

                          <div
                            style={{
                              fontSize:
                                "13px",
                            }}
                          >
                            ⏳{" "}
                            {formatDuration(
                              stop.travel_time_min
                            )}
                          </div>

                        </div>

                      </Popup>
                    </Marker>
                  )
                )}

              </MapContainer>
            </div>
          )}

        </section>

        {/* =================================================
            Day Tabs
        ================================================= */}

        <section className="day-section">

          <div className="section-title">

            <div>
              <h2>
                แผนการเดินทางรายวัน
              </h2>

              <p>
                เลือกวันที่ต้องการดูรายละเอียด
              </p>
            </div>

          </div>

          <div className="day-tabs">

            {data.days?.map(
              (
                day,
                index
              ) => {

                const stops =
                  getDayStops(
                    index
                  );

                return (
                  <button
                    key={index}
                    onClick={() =>
                      setSelectedDay(
                        index
                      )
                    }
                    className={
                      selectedDay ===
                      index
                        ? "day-tab active"
                        : "day-tab"
                    }
                  >

                    <span>
                      วันที่{" "}
                      {day.day}
                    </span>

                    <small>
                      {formatDate(
                        day.date
                      )}
                    </small>

                    <small>
                      {stops.length}{" "}
                      สถานที่
                    </small>

                  </button>
                );
              }
            )}

          </div>
        </section>

        {/* =================================================
            Current Day Summary
        ================================================= */}

        {currentDay && (
          <section className="current-day-card">

            <div>

              <div className="current-day-label">
                DAY{" "}
                {currentDay.day}
              </div>

              <h2>
                วันที่{" "}
                {currentDay.day}
              </h2>

              <p>
                {formatDate(
                  currentDay.date
                )}
              </p>

            </div>

            <div className="day-time-box">

              <span>⏰</span>

              <div>

                <small>
                  เวลาเที่ยวรวม
                </small>

                <strong>
                  เที่ยว{" "}
                  {formatDuration(
                    currentDay.total_visit_time_min
                  )}

                  {" • "}

                  เดินทาง{" "}
                  {formatDuration(
                    currentDay.total_travel_time_min
                  )}
                </strong>

              </div>

            </div>

          </section>
        )}

        {/* =================================================
            Itinerary
        ================================================= */}

        <section className="itinerary-section">

          <div className="section-title">

            <div>

              <h2>
                สถานที่ในวันนี้
              </h2>

              <p>
                ระบบเรียงลำดับการเดินทางให้แล้ว
              </p>

            </div>

            <span className="place-count">
              {currentStops.length}{" "}
              สถานที่
            </span>

          </div>

          <div className="timeline">

            {currentStops.length ===
              0 && (
              <div className="empty-day">
                ไม่มีสถานที่ในวันนี้
              </div>
            )}

            {currentStops.map(
              (
                stop,
                index
              ) => {

                const score =
                  stop.poiScore ??
                  0;

                return (
                  <div
                    className="timeline-item"
                    key={`${stop.place_id}-${index}`}
                  >

                    {/* Marker */}
                    <div className="timeline-marker">
                      {index + 1}
                    </div>

                    {index <
                      currentStops.length -
                        1 && (
                      <div className="timeline-line" />
                    )}

                    <div className="timeline-content">

                      <div className="place-card">

                        {/* =================================
                            Place Header
                        ================================= */}

                        <div className="place-top">

                          <div>

                            <div className="place-order">
                              สถานที่ที่{" "}
                              {index + 1}
                            </div>

                            <h3>
                              {
                                stop.place_name
                              }
                            </h3>

                            {stop.categoryName && (
                              <span className="category-tag">
                                {
                                  stop.categoryName
                                }
                              </span>
                            )}

                          </div>

                          <div className="poi-score">

                            <strong>
                              {score > 1
                                ? score
                                : (
                                    score *
                                    100
                                  ).toFixed(
                                    0
                                  )}
                            </strong>

                            <span>
                              POI Score
                            </span>

                          </div>

                        </div>

                        {/* =================================
                            Info Grid
                        ================================= */}

                        <div className="place-info-grid">

                          {/* ระยะเวลาเที่ยว */}
                          <div className="info-item">

                            <span>
                              ⏱️
                            </span>

                            <div>

                              <small>
                                ระยะเวลาเที่ยว
                              </small>

                              <strong>
                                {formatDuration(
                                  stop.duration_min
                                )}
                              </strong>

                            </div>

                          </div>

                          {/* เวลาเข้าชม */}
                          <div className="info-item">

                            <span>
                              🕐
                            </span>

                            <div>

                              <small>
                                เวลาเข้าชม
                              </small>

                              <strong>
                                {
                                  stop.start_time
                                }
                                {" - "}
                                {
                                  stop.end_time
                                }
                              </strong>

                            </div>

                          </div>

                          {/* ระยะทาง */}
                          <div className="info-item">

                            <span>
                              🚗
                            </span>

                            <div>

                              <small>
                                เดินทางจากจุดก่อนหน้า
                              </small>

                              <strong>
                                {formatDistance(
                                  stop.travel_distance_km
                                )}
                              </strong>

                            </div>

                          </div>

                          {/* เวลาเดินทาง */}
                          <div className="info-item">

                            <span>
                              ⏳
                            </span>

                            <div>

                              <small>
                                เวลาเดินทาง
                              </small>

                              <strong>
                                {formatDuration(
                                  stop.travel_time_min
                                )}
                              </strong>

                            </div>

                          </div>

                        </div>

                        {/* =================================
                            Google Maps
                        ================================= */}

                        <button
                          className="map-place-button"
                          onClick={() =>
                            openGoogleMaps(
                              stop.latitude,
                              stop.longitude
                            )
                          }
                        >
                          📍 ดูตำแหน่งบน Google Maps
                        </button>

                      </div>

                      {/* =================================
                          Travel Between
                      ================================= */}

                      <div className="travel-between">

                        <span>
                          🚗
                        </span>

                        <span>
                          เดินทางจาก:{" "}
                          {
                            stop.previous_place_name
                          }
                        </span>

                        {stop.travel_distance_km >
                          0 && (
                          <span>
                            •{" "}
                            {formatDistance(
                              stop.travel_distance_km
                            )}
                          </span>
                        )}

                        {stop.travel_time_min >
                          0 && (
                          <span>
                            • ใช้เวลา{" "}
                            {formatDuration(
                              stop.travel_time_min
                            )}
                          </span>
                        )}

                      </div>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </section>

        {/* =================================================
            Save Message
        ================================================= */}

        {saveMessage && (
          <div
            className={
              saveMessage.includes(
                "สำเร็จ"
              )
                ? "save-message success"
                : "save-message error"
            }
          >
            {saveMessage}
          </div>
        )}

        {/* =================================================
            Actions
        ================================================= */}

        <section className="action-bar">

          <button
            className="secondary-button"
            onClick={handleBack}
          >
            ← เลือกสถานที่ใหม่
          </button>

          <div className="action-right">

            <button
              className="edit-button"
              onClick={handleEditTrip}
            >
              ✏️ แก้ไขเส้นทาง
            </button>

            <button
              className="confirm-button"
              onClick={
                handleConfirmTrip
              }
              disabled={saving}
            >
              {saving
                ? "กำลังบันทึก..."
                : "✓ ยืนยันและบันทึกทริป"}
            </button>

          </div>

        </section>

      </main>
    </div>
  );
}