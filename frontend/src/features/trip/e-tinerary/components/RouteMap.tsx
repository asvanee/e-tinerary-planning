import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";

// ต้องตรงกับชื่อ key ที่ตั้งใน .env (Vite ต้องขึ้นต้นด้วย VITE_) — ตัวเดียวกับ LocationPinPicker.tsx
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// ✅ ใช้ libraries ค่าเดียวกับ LocationPinPicker.tsx ("places") เจตนา — @react-google-maps/api
// เป็น singleton loader ทั้งแอป ถ้าคนละหน้าเรียก useJsApiLoader ด้วย libraries คนละชุดกัน (เช่น
// หน้านี้ใช้แค่ [] แต่หน้า create trip ใช้ ["places"]) จะโดน error "Loader must not be called
// again with different options" ตอน user เดินหน้า-ถอยหลังระหว่างหน้าใน SPA เดียวกัน
const LIBRARIES: ("places")[] = ["places"];

const mapContainerStyle = {
  width: "100%",
  height: "420px",
  borderRadius: "16px",
};

// สีประจำวัน วนซ้ำถ้าทริปเกิน 6 วัน
const DAY_COLORS = [
  "#102a6b", // navy (โทนหลักของระบบ)
  "#99CCFF",
  "#c2410c",
  "#7c3aed",
  "#059669",
  "#db2777",
];

function getDayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length];
}

export interface RouteMapDayItem {
  placeId: string;
  lat: number;
  lng: number;
  placeName: string;
  visitOrder: number;
}

export interface RouteMapDay {
  tripDayId: number;
  dayNumber: number;
  items: RouteMapDayItem[];
}

interface RouteMapProps {
  /** จุดเริ่มต้นที่ user ปักหมุดไว้ (trips.start_lat/start_lng) — ใช้วาดเส้นประจากจุดเริ่มต้น
   * ไปจุดแรกของวันที่ 1 เท่านั้น (วันอื่นไม่มีจุดเริ่มต้นที่ชัดเจนจาก backend) */
  startLat?: number | null;
  startLng?: number | null;
  days: RouteMapDay[];
}

export default function RouteMap({ startLat, startLng, days }: RouteMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);

  const daysWithItems = useMemo(
    () => days.filter((d) => d.items.length > 0),
    [days]
  );

  const [visibleDayNumbers, setVisibleDayNumbers] = useState<Set<number>>(
    new Set(daysWithItems.map((d) => d.dayNumber))
  );

  // ถ้าจำนวนวันที่มีสถานที่เปลี่ยน (เช่น ลากที่แรกเข้าวันที่เพิ่งว่าง) ให้เพิ่มวันนั้นเข้า visible โดยอัตโนมัติ
  useEffect(() => {
    setVisibleDayNumbers((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const d of daysWithItems) {
        if (!next.has(d.dayNumber)) {
          next.add(d.dayNumber);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [daysWithItems]);

  const toggleDay = (dayNumber: number) => {
    setVisibleDayNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) {
        next.delete(dayNumber);
      } else {
        next.add(dayNumber);
      }
      return next;
    });
  };

  const visibleDays = daysWithItems.filter((d) => visibleDayNumbers.has(d.dayNumber));

  // ---- fit bounds ให้เห็นทุก marker ที่โชว์อยู่ ----
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;

    const points: { lat: number; lng: number }[] = [];
    if (startLat != null && startLng != null) {
      points.push({ lat: startLat, lng: startLng });
    }
    for (const day of visibleDays) {
      for (const item of day.items) {
        points.push({ lat: item.lat, lng: item.lng });
      }
    }

    if (points.length === 0) return;

    if (points.length === 1) {
      mapRef.current.panTo(points[0]);
      mapRef.current.setZoom(14);
      return;
    }

    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    mapRef.current.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, visibleDays, startLat, startLng]);

  if (loadError) {
    return (
      <p className="text-sm text-red-600">
        โหลดแผนที่ไม่สำเร็จ กรุณาตรวจสอบ VITE_GOOGLE_MAPS_API_KEY ใน .env
      </p>
    );
  }

  if (!isLoaded) {
    return <p className="text-sm text-[#5990c0]">กำลังโหลดแผนที่...</p>;
  }

  if (daysWithItems.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md px-5 py-10 flex items-center justify-center text-center">
        <p className="text-sm text-[#5990c0]">
          ยังไม่มีสถานที่จัดลงวันไหนเลย — ลากสถานที่ลงวันเพื่อดูเส้นทางบนแผนที่
        </p>
      </div>
    );
  }

  const defaultCenter =
    startLat != null && startLng != null
      ? { lat: startLat, lng: startLng }
      : { lat: daysWithItems[0].items[0].lat, lng: daysWithItems[0].items[0].lng };

console.log(days);
console.log(daysWithItems);
  return (
    <div className="bg-white rounded-2xl shadow-md px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-prompt font-semibold text-sm text-[#102a6b]">
          เส้นทางบนแผนที่
        </h3>

        <div className="flex flex-wrap gap-2">
          {daysWithItems.map((day, index) => {
            const color = getDayColor(index);
            const active = visibleDayNumbers.has(day.dayNumber);
            return (
              <button
                key={day.tripDayId}
                type="button"
                onClick={() => toggleDay(day.dayNumber)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  active
                    ? "text-white shadow-sm"
                    : "text-[#5990c0] bg-white border-[#5990c0]/30"
                }`}
                style={active ? { backgroundColor: color, borderColor: color } : undefined}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: active ? "#fff" : color }}
                />
                วันที่ {day.dayNumber}
              </button>
            );
          })}
        </div>
      </div>

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={12}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        }}
      >
        {startLat != null && startLng != null && (
          <Marker
            position={{ lat: startLat, lng: startLng }}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: "#102a6b",
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            }}
            title="จุดเริ่มต้น"
            zIndex={999}
          />
        )}

        {visibleDays.map((day) => {
          const dayIndex = daysWithItems.findIndex((d) => d.tripDayId === day.tripDayId);
          const color = getDayColor(dayIndex);
          const sortedItems = [...day.items].sort((a, b) => a.visitOrder - b.visitOrder);

          const pathPoints = sortedItems.map((item) => ({ lat: item.lat, lng: item.lng }));

          // เส้นประจากจุดเริ่มต้น -> จุดแรกของวัน (เฉพาะวันที่ 1 เท่านั้น — วันอื่นไม่มีจุดเริ่มต้น
          // ที่ backend ยืนยันชัดเจน)
          const showStartLine =
            day.dayNumber === 1 && startLat != null && startLng != null && sortedItems.length > 0;

          return (
            <div key={day.tripDayId}>
              {showStartLine && (
                <Polyline
                  path={[{ lat: startLat!, lng: startLng! }, pathPoints[0]]}
                  options={{
                    strokeColor: color,
                    strokeOpacity: 0.6,
                    strokeWeight: 2,
                    icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 0.6 }, offset: "0", repeat: "10px" }],
                  }}
                />
              )}

              {pathPoints.length > 1 && (
                <Polyline
                  path={pathPoints}
                  options={{
                    strokeColor: color,
                    strokeOpacity: 0.9,
                    strokeWeight: 3,
                  }}
                />
              )}

              {sortedItems.map((item) => (
                <Marker
                  key={item.placeId}
                  position={{ lat: item.lat, lng: item.lng }}
                  label={{
                    text: String(item.visitOrder),
                    color: "#ffffff",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                  icon={{
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 13,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2,
                  }}
                  title={`${item.visitOrder}. ${item.placeName}`}
                />
              ))}
            </div>
          );
        })}
      </GoogleMap>
    </div>
  );
}