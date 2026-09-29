import {
  Fragment,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ---------------------------------------------------------------------------
// OpenRouteService config (ตั้งใน .env — Vite ต้องขึ้นต้นด้วย VITE_)
//   VITE_ORS_API_KEY    : key จาก openrouteservice.org (ถ้าใช้ proxy ฝั่ง backend ไม่ต้องใส่)
//   VITE_ORS_BASE_URL   : default https://api.heigit.org/openrouteservice (ไม่ต้องมี / ท้ายสุด)
//                         เปลี่ยนเป็น proxy ของ backend ได้ — โดเมนเก่า api.openrouteservice.org ถูกปิดแล้ว
//   VITE_ORS_PROFILE    : default driving-car (driving-car | foot-walking | cycling-regular ...)
// ---------------------------------------------------------------------------
const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY as string | undefined;
const ORS_BASE_URL = (
  (import.meta.env.VITE_ORS_BASE_URL as string | undefined) ??
  "https://api.heigit.org/openrouteservice"
).replace(/\/+$/, "");
const ORS_PROFILE =
  (import.meta.env.VITE_ORS_PROFILE as string | undefined) ?? "driving-car";

// ORS directions รับได้สูงสุด 50 waypoints ต่อ request — เกินจากนี้ใช้เส้นตรงแทน
const ORS_MAX_WAYPOINTS = 50;

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Routing by <a href="https://openrouteservice.org">openrouteservice</a>';

type LatLng = [number, number]; // [lat, lng] (รูปแบบของ Leaflet)

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

// ---------------------------------------------------------------------------
// ORS: ขอเส้นทางจริงตามถนน + cache ระดับ module (อยู่ข้าม re-render / ข้ามการ mount ใหม่)
// ---------------------------------------------------------------------------
interface RouteResult {
  /** geometry ทั้งเส้น [lat, lng][] */
  coords: LatLng[];
  /** index ใน coords ของแต่ละ waypoint ที่ส่งไป (ใช้แยกช่วง start -> จุดแรก) */
  wayPoints: number[];
}

const routeCache = new Map<string, RouteResult>();

function routeKey(points: LatLng[]): string {
  return `${ORS_PROFILE}:${points
    .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join("|")}`;
}

async function fetchRoute(
  points: LatLng[],
  signal: AbortSignal
): Promise<RouteResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ORS_API_KEY) headers.Authorization = ORS_API_KEY;

  const res = await fetch(`${ORS_BASE_URL}/v2/directions/${ORS_PROFILE}/geojson`, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      // ORS ใช้ [lng, lat]
      coordinates: points.map(([lat, lng]) => [lng, lat]),
      // -1 = ไม่จำกัดระยะ snap เข้าถนน (ค่า default 350 ม. ทำให้จุดกลางเกาะ/ป่า 404)
      radiuses: points.map(() => -1),
    }),
  });

  if (!res.ok) {
    throw new Error(`ORS ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = await res.json();
  const feature = json?.features?.[0];
  const raw = feature?.geometry?.coordinates as [number, number][] | undefined;
  if (!raw || raw.length < 2) throw new Error("ORS: empty geometry");

  return {
    coords: raw.map(([lng, lat]) => [lat, lng] as LatLng),
    wayPoints: (feature.properties?.way_points as number[] | undefined) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Marker icons (divIcon — ไม่ต้องพึ่งไฟล์รูป default ของ Leaflet ที่มักพังใน Vite)
// ---------------------------------------------------------------------------
const iconCache = new Map<string, L.DivIcon>();

function numberIcon(order: number, color: string): L.DivIcon {
  const key = `${order}-${color}`;
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: "",
      html: `<div style="width:26px;height:26px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:700 12px/22px sans-serif;text-align:center;">${order}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const startIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#102a6b;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ---------------------------------------------------------------------------
// fit bounds ให้เห็นทุก marker ที่โชว์อยู่ — ทำงานเฉพาะเมื่อ "ชุดจุด" เปลี่ยนจริง
// (ไม่ refit ทุก re-render เหมือนเดิม เลย user ซูม/แพนแล้วไม่เด้งกลับ)
// ---------------------------------------------------------------------------
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const signature = points.map(([a, b]) => `${a},${b}`).join("|");

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

export default function RouteMap({ startLat, startLng, days }: RouteMapProps) {
  const hasStart = startLat != null && startLng != null;
  const startPoint: LatLng | null = hasStart ? [startLat!, startLng!] : null;

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

  const visibleDays = useMemo(
    () => daysWithItems.filter((d) => visibleDayNumbers.has(d.dayNumber)),
    [daysWithItems, visibleDayNumbers]
  );

  // ---- จุดของแต่ละวัน (เรียงตาม visitOrder) + request ที่ต้องยิง ORS ----
  const dayRoutes = useMemo(() => {
    return visibleDays.map((day) => {
      const dayIndex = daysWithItems.findIndex((d) => d.tripDayId === day.tripDayId);
      const sortedItems = [...day.items].sort((a, b) => a.visitOrder - b.visitOrder);
      const itemPoints: LatLng[] = sortedItems.map((i) => [i.lat, i.lng]);

      // วันที่ 1 ใส่จุดเริ่มต้นเป็น waypoint แรก แล้วค่อยแยกช่วงเส้นประตอนวาด
      const withStart = day.dayNumber === 1 && startPoint != null && itemPoints.length > 0;
      const routePoints: LatLng[] = withStart ? [startPoint!, ...itemPoints] : itemPoints;

      return {
        day,
        color: getDayColor(dayIndex),
        sortedItems,
        withStart,
        routePoints,
        key: routePoints.length >= 2 ? routeKey(routePoints) : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDays, daysWithItems, startLat, startLng]);

  // ---- ยิง ORS (debounce + abort) — ลากสถานที่ถี่ ๆ จะไม่ยิงรัว ----
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const failedRef = useRef<Set<string>>(new Set());
  const requestsRef = useRef<{ key: string; points: LatLng[] }[]>([]);

  requestsRef.current = dayRoutes.flatMap((r) =>
    r.key && r.routePoints.length <= ORS_MAX_WAYPOINTS
      ? [{ key: r.key, points: r.routePoints }]
      : []
  );
  const requestsSignature = requestsRef.current.map((r) => r.key).join("##");

  useEffect(() => {
    const pending = requestsRef.current.filter(
      (r) => !routeCache.has(r.key) && !failedRef.current.has(r.key)
    );
    if (pending.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      pending.forEach(async (r) => {
        try {
          routeCache.set(r.key, await fetchRoute(r.points, controller.signal));
        } catch (err) {
          if (controller.signal.aborted) return;
          console.warn("[RouteMap] ขอเส้นทางจาก ORS ไม่สำเร็จ ใช้เส้นตรงแทน:", err);
          failedRef.current.add(r.key);
        }
        rerender();
      });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestsSignature]);

  const isRouting = requestsRef.current.some(
    (r) => !routeCache.has(r.key) && !failedRef.current.has(r.key)
  );
  const hasFallback = dayRoutes.some(
    (r) => r.key && !routeCache.has(r.key) && !isRouting
  );

  // ---- จุดทั้งหมดที่ใช้ fit bounds ----
  const boundsPoints = useMemo<LatLng[]>(() => {
    const pts: LatLng[] = [];
    if (startPoint) pts.push(startPoint);
    for (const day of visibleDays) {
      for (const item of day.items) pts.push([item.lat, item.lng]);
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDays, startLat, startLng]);

  if (daysWithItems.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-md px-5 py-10 flex items-center justify-center text-center">
        <p className="text-sm text-[#5990c0]">
          ยังไม่มีสถานที่จัดลงวันไหนเลย — ลากสถานที่ลงวันเพื่อดูเส้นทางบนแผนที่
        </p>
      </div>
    );
  }

  const defaultCenter: LatLng =
    startPoint ?? [daysWithItems[0].items[0].lat, daysWithItems[0].items[0].lng];

  return (
    <div className="bg-white rounded-2xl shadow-md px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-prompt font-semibold text-sm text-[#102a6b]">
            เส้นทางบนแผนที่
          </h3>
          {isRouting && (
            <span className="text-xs text-[#5990c0]">กำลังคำนวณเส้นทาง...</span>
          )}
          {hasFallback && (
            <span className="text-xs text-amber-600">
              คำนวณเส้นทางถนนไม่สำเร็จ แสดงเป็นเส้นตรงแทน
            </span>
          )}
        </div>

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

      {/* isolate: กัน z-index ของ Leaflet pane (สูงสุด ~1000) ไปทับ modal / drag overlay ของหน้า */}
      <div className="isolate">
        <MapContainer
          center={defaultCenter}
          zoom={12}
          scrollWheelZoom
          style={{ width: "100%", height: "420px", borderRadius: "16px" }}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
          <FitBounds points={boundsPoints} />

          {startPoint && (
            <Marker
              position={startPoint}
              icon={startIcon}
              zIndexOffset={1000}
              title="จุดเริ่มต้น"
            >
              <Tooltip direction="top" offset={[0, -10]}>
                จุดเริ่มต้น
              </Tooltip>
            </Marker>
          )}

          {dayRoutes.map(({ day, color, sortedItems, withStart, routePoints, key }) => {
            const route = key ? routeCache.get(key) : undefined;

            // แยกเส้นเป็น 2 ส่วน: จุดเริ่มต้น -> จุดแรก (เส้นประ) และจุดแรก -> ที่เหลือ (เส้นทึบ)
            let startLeg: LatLng[] | null = null;
            let mainLeg: LatLng[] = [];

            if (route) {
              const splitAt = withStart ? route.wayPoints[1] : undefined;
              if (withStart && splitAt != null) {
                startLeg = route.coords.slice(0, splitAt + 1);
                mainLeg = route.coords.slice(splitAt);
              } else {
                mainLeg = route.coords;
              }
            } else {
              // ยังไม่ได้เส้นทางจาก ORS (กำลังโหลด / ล้มเหลว) -> เส้นตรงจางๆ ไปก่อน
              if (withStart) {
                startLeg = routePoints.slice(0, 2);
                mainLeg = routePoints.slice(1);
              } else {
                mainLeg = routePoints;
              }
            }

            return (
              <Fragment key={day.tripDayId}>
                {startLeg && startLeg.length > 1 && (
                  <Polyline
                    positions={startLeg}
                    pathOptions={{
                      color,
                      opacity: 0.6,
                      weight: 3,
                      dashArray: "6 8",
                    }}
                  />
                )}

                {mainLeg.length > 1 && (
                  <Polyline
                    positions={mainLeg}
                    pathOptions={{
                      color,
                      opacity: route ? 0.9 : 0.45,
                      weight: 4,
                      lineCap: "round",
                      lineJoin: "round",
                      dashArray: route ? undefined : "2 8",
                    }}
                  />
                )}

                {sortedItems.map((item) => (
                  <Marker
                    key={`${day.tripDayId}-${item.placeId}`}
                    position={[item.lat, item.lng]}
                    icon={numberIcon(item.visitOrder, color)}
                    title={`${item.visitOrder}. ${item.placeName}`}
                  >
                    <Tooltip direction="top" offset={[0, -12]}>
                      {`${item.visitOrder}. ${item.placeName}`}
                    </Tooltip>
                  </Marker>
                ))}
              </Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}