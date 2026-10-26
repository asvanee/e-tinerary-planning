import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { categoryColor } from "./categoryColors";

// ---------- ชนิดข้อมูล ----------
export interface MapPlace {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  categoryName: string;
  rank: number; // อันดับเดียวกับเลขบนการ์ด
  score: number; // 0-100
}

export interface MapFocus {
  id: string;
  nonce: number; // เปลี่ยนทุกครั้งที่ขอโฟกัส เพื่อให้กดหมุดเดิมซ้ำแล้วยังเลื่อนแผนที่ได้
}

interface Props {
  places: MapPlace[];
  selectedIds: string[];
  isCustomMode: boolean;
  focus: MapFocus | null;
  onShowCard: (placeId: string) => void;
  onToggleSelect: (placeId: string) => void;
  className?: string;
}

// กรอบประเทศไทยคร่าวๆ — กันพิกัดผิด (เช่น หลุดไปต่างประเทศ) ไม่ให้ดึงแผนที่ไปไกล
const TH = { minLat: 5.5, maxLat: 20.6, minLng: 97.3, maxLng: 105.7 };
const inThailand = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= TH.minLat &&
  lat <= TH.maxLat &&
  lng >= TH.minLng &&
  lng <= TH.maxLng;

// ---------- หมุด ----------
// หมุดรูปหยดน้ำ: สี่เหลี่ยมโค้งมน 3 มุมหมุน -45° ปลายแหลมชี้ลง เลขอันดับหมุนกลับ 45°
// ปลายหมุดอยู่ต่ำกว่ากล่อง ~0.21×ขนาด จึงตั้ง iconAnchor ที่ y ≈ 1.21×ขนาด
function makePinIcon(color: string, rank: number, selected: boolean, active: boolean) {
  const s = active ? 38 : 32;
  const ring = selected
    ? "0 0 0 3px #0b2a4a,0 2px 6px rgba(0,0,0,.4)"
    : "0 2px 6px rgba(0,0,0,.35)";
  const html =
    `<div style="width:${s}px;height:${s}px;background:${color};border:2px solid #fff;` +
    `border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:${ring};` +
    `display:flex;align-items:center;justify-content:center;">` +
    `<span style="transform:rotate(45deg);color:#fff;font-weight:600;font-size:${rank > 99 ? 10 : 12}px;` +
    `line-height:1;text-shadow:0 0 2px rgba(0,0,0,.5);">${rank}</span></div>`;
  return L.divIcon({
    className: "", // ตัด style เริ่มต้นของ leaflet-div-icon (พื้นขาว+ขอบ)
    html,
    iconSize: [s, s],
    iconAnchor: [s / 2, Math.round(s * 1.21)],
    popupAnchor: [0, -Math.round(s * 1.15)],
  });
}

// icon ขึ้นกับสี/อันดับ/สถานะเท่านั้น — cache ระดับ module ใช้ซ้ำได้ทุก render (ไม่ต้องอ่าน ref ระหว่าง render)
const pinIconCache = new Map<string, L.DivIcon>();

function getPinIcon(color: string, rank: number, selected: boolean, active: boolean) {
  const key = `${color}|${rank}|${selected}|${active}`;
  let icon = pinIconCache.get(key);
  if (!icon) {
    icon = makePinIcon(color, rank, selected, active);
    pinIconCache.set(key, icon);
  }
  return icon;
}

// ---------- ตัวช่วยที่ใช้ map instance ----------
// ปรับมุมมองให้พอดีกับหมุดทั้งหมด + คำนวณขนาดแผนที่ใหม่เมื่อ container เปลี่ยนขนาด
// (บนมือถือแผนที่ถูกซ่อนด้วย display:none ตอนอยู่แท็บ "รายการ" ทำให้ขนาดเป็น 0 —
//  ถ้า fit ตอนนั้นจะได้ zoom เพี้ยน จึงจดไว้ว่ารอ fit แล้วค่อยทำเมื่อแผนที่โผล่ขึ้นมา)
function FitBounds({ points }: { points: MapPlace[] }) {
  const map = useMap();
  const pendingFit = useRef(false);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const fit = () => {
    const pts = pointsRef.current;
    if (pts.length === 0) return;
    const size = map.getSize();
    if (size.x === 0 || size.y === 0) {
      pendingFit.current = true;
      return;
    }
    pendingFit.current = false;
    map.fitBounds(
      L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [48, 48], maxZoom: 14 }
    );
  };

  // refit เฉพาะเมื่อชุดสถานที่เปลี่ยน (เช่น กรองหมวดหมู่) ไม่ใช่ตอนแค่เลือก/ไฮไลต์หมุด
  const key = points.map((p) => p.placeId).join(",");
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (pendingFit.current) fit();
    });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

function FocusHandler({
  focus,
  points,
  markerRefs,
}: {
  focus: MapFocus | null;
  points: MapPlace[];
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const p = points.find((x) => x.placeId === focus.id);
    if (!p) return;
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
    markerRefs.current.get(focus.id)?.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, focus?.nonce]);
  return null;
}

// ---------- คอมโพเนนต์หลัก ----------
export default function RecommendationMap({
  places,
  selectedIds,
  isCustomMode,
  focus,
  onShowCard,
  onToggleSelect,
  className = "",
}: Props) {
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const { points, hiddenCount } = useMemo(() => {
    const valid = places.filter((p) => inThailand(p.lat, p.lng));
    return { points: valid, hiddenCount: places.length - valid.length };
  }, [places]);

  const legend = useMemo(() => {
    const seen = new Set<string>();
    points.forEach((p) => seen.add(p.categoryName));
    return Array.from(seen);
  }, [points]);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* isolate: ให้ z-index ภายในของ Leaflet (400-1000) อยู่ในกล่องนี้ ไม่ทับ navbar / แถบเลือกด้านล่าง */}
      <div className="isolate relative flex-1 min-h-[320px] rounded-2xl overflow-hidden border border-[color:var(--line)] [box-shadow:var(--shadow)]">
        <MapContainer
          center={[13.0, 101.0]}
          zoom={6}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <FitBounds points={points} />
          <FocusHandler focus={focus} points={points} markerRefs={markerRefs} />

          {points.map((p) => {
            const selected = selectedIds.includes(p.placeId);
            const active = focus?.id === p.placeId;
            const color = categoryColor(p.categoryName);
            return (
              <Marker
                key={p.placeId}
                position={[p.lat, p.lng]}
                icon={getPinIcon(color, p.rank, isCustomMode && selected, active)}
                title={`${p.rank}. ${p.name}`}
                zIndexOffset={active ? 1000 : isCustomMode && selected ? 500 : 0}
                ref={(m) => {
                  if (m) markerRefs.current.set(p.placeId, m);
                  else markerRefs.current.delete(p.placeId);
                }}
              >
                <Popup>
                  <div className="font-sarabun" style={{ minWidth: 190 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>{p.name}</div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 4,
                        fontSize: 12,
                        color: "#475569",
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: color,
                          flexShrink: 0,
                        }}
                      />
                      {p.categoryName} · อันดับ {p.rank} · {p.score} คะแนน
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => onShowCard(p.placeId)}
                        style={{
                          minHeight: 36,
                          padding: "0 12px",
                          borderRadius: 8,
                          border: "1px solid #94a3b8",
                          background: "#fff",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        ดูในรายการ
                      </button>
                      {isCustomMode && (
                        <button
                          type="button"
                          onClick={() => onToggleSelect(p.placeId)}
                          style={{
                            minHeight: 36,
                            padding: "0 12px",
                            borderRadius: 8,
                            border: "1px solid #0b2a4a",
                            background: selected ? "#fff" : "#0b2a4a",
                            color: selected ? "#0b2a4a" : "#fff",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          {selected ? "ยกเลิกเลือก" : "เลือก"}
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {hiddenCount > 0 && (
        <p className="text-xs text-[color:var(--muted)]">
          ซ่อน {hiddenCount} สถานที่บนแผนที่ เพราะพิกัดอยู่นอกประเทศไทย (ยังแสดงในรายการตามปกติ)
        </p>
      )}

      {legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[color:var(--muted)]" aria-label="สีหมุดตามหมวดหมู่">
          {legend.map((cat) => (
            <li key={cat} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ background: categoryColor(cat) }}
              />
              {cat}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}