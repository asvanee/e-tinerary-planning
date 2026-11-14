import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { CircleCheck, Loader2, MapPin, Search, TriangleAlert } from "lucide-react";

// ค้นหาที่อยู่ด้วย Nominatim ของ OpenStreetMap (ฟรี ไม่ต้องใช้ key)
// นโยบาย: ไม่เกิน 1 คำขอต่อวินาที และห้ามค้นขณะพิมพ์ จึงค้นเฉพาะตอนกดปุ่มหรือกด Enter
const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const SEARCH_LIMIT = 5;

// default center: กรุงเทพมหานคร (กรณียังไม่เคยปักหมุดมาก่อน)
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 };

type Position = { lat: number; lng: number };
type MapFocus = Position & { zoom: number };

interface SearchResult {
    id: number;
    label: string;
    lat: number;
    lng: number;
}

interface NominatimItem {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
}

// หมุดเป็น divIcon — ไม่พึ่งไฟล์รูป default ของ Leaflet ที่มักพังใน Vite
const pinIcon = L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:#102a6b;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
});

async function searchPlaces(query: string, signal: AbortSignal): Promise<SearchResult[]> {
    const params = new URLSearchParams({
        format: "jsonv2",
        q: query,
        countrycodes: "th",
        limit: String(SEARCH_LIMIT),
        "accept-language": "th",
    });
    const res = await fetch(`${SEARCH_URL}?${params}`, { signal });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);

    const items = (await res.json()) as NominatimItem[];
    return items
        .map((item) => ({
            id: item.place_id,
            label: item.display_name,
            lat: Number(item.lat),
            lng: Number(item.lon),
        }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

// เลื่อนแผนที่ไปที่จุดที่สั่ง (เฉพาะตอน focus เปลี่ยน ผู้ใช้เลื่อนเองต่อได้)
function FocusMap({ focus }: { focus: MapFocus }) {
    const map = useMap();

    useEffect(() => {
        map.setView([focus.lat, focus.lng], focus.zoom);
    }, [map, focus]);

    return null;
}

// คลิกบนแผนที่ = ย้ายหมุดไปจุดนั้น
function ClickToPin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click(e) {
            onPick(e.latlng.lat, e.latlng.lng);
        },
    });
    return null;
}

interface LocationPinPickerProps {
    initialLat?: number | null;
    initialLng?: number | null;
    /** เรียกทุกครั้งที่ผู้ใช้กด "ยืนยันปักหมุด" เท่านั้น ไม่เรียกตอนแค่ลากเฉยๆ */
    onConfirm: (lat: number, lng: number, address: string | null) => void;
}

export default function LocationPinPicker({
    initialLat,
    initialLng,
    onConfirm,
}: LocationPinPickerProps) {
    const hasInitial = initialLat != null && initialLng != null;

    const [markerPos, setMarkerPos] = useState<Position>(
        hasInitial ? { lat: initialLat, lng: initialLng } : DEFAULT_CENTER
    );
    const [focus, setFocus] = useState<MapFocus>({
        ...(hasInitial ? { lat: initialLat, lng: initialLng } : DEFAULT_CENTER),
        zoom: hasInitial ? 16 : 11,
    });
    const [pendingAddress, setPendingAddress] = useState<string | null>(null);
    // มีพิกัดตั้งแต่แรก = มาจากทริปที่บันทึกไว้แล้ว ถือว่ายืนยันอยู่แล้ว
    const [confirmed, setConfirmed] = useState(hasInitial);

    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchMessage, setSearchMessage] = useState<string | null>(null);
    const searchAbort = useRef<AbortController | null>(null);

    // โหมดแก้ไข: initialLat/initialLng มาจาก fetch แบบ async หลัง mount (useState ด้านบนไม่รู้)
    // จึง sync หมุดทุกครั้งที่ค่าเปลี่ยน (เช่น null -> ค่าที่โหลดมาจาก API) — ปรับ state ระหว่าง render
    // ตามที่ React แนะนำ แทนการ setState ใน effect
    const [syncedInitial, setSyncedInitial] = useState({ lat: initialLat, lng: initialLng });
    if (syncedInitial.lat !== initialLat || syncedInitial.lng !== initialLng) {
        setSyncedInitial({ lat: initialLat, lng: initialLng });
        if (initialLat != null && initialLng != null) {
            setMarkerPos({ lat: initialLat, lng: initialLng });
            setFocus({ lat: initialLat, lng: initialLng, zoom: 16 });
            setConfirmed(true); // ค่านี้มาจากทริปที่บันทึกไว้แล้ว ถือว่ายืนยันอยู่แล้ว
        }
    }

    // ย้ายหมุดด้วยมือ (ลากหรือคลิกแผนที่) ยังไม่รู้ที่อยู่ จึงให้ยืนยันใหม่
    const moveMarker = (lat: number, lng: number) => {
        setMarkerPos({ lat, lng });
        setPendingAddress(null);
        setConfirmed(false);
    };

    const runSearch = async () => {
        const text = query.trim();
        if (!text || searching) return;

        searchAbort.current?.abort();
        const controller = new AbortController();
        searchAbort.current = controller;

        setSearching(true);
        setSearchMessage(null);
        setResults([]);
        try {
            const found = await searchPlaces(text, controller.signal);
            setResults(found);
            if (found.length === 0) setSearchMessage("ไม่พบสถานที่ที่ค้นหา ลองใช้คำอื่น หรือคลิกบนแผนที่เพื่อปักหมุดเอง");
        } catch (err) {
            if (controller.signal.aborted) return;
            console.error("Search place error:", err);
            setSearchMessage("ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง หรือคลิกบนแผนที่เพื่อปักหมุดเอง");
        } finally {
            setSearching(false);
        }
    };

    const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        void runSearch();
    };

    const pickResult = (result: SearchResult) => {
        setMarkerPos({ lat: result.lat, lng: result.lng });
        setFocus({ lat: result.lat, lng: result.lng, zoom: 16 });
        setPendingAddress(result.label);
        setConfirmed(false); // ค้นหาใหม่ = ต้องกดยืนยันใหม่เสมอ
        setResults([]);
        setSearchMessage(null);
    };

    const handleConfirm = () => {
        setConfirmed(true);
        onConfirm(markerPos.lat, markerPos.lng, pendingAddress);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search
                            size={20}
                            strokeWidth={1.75}
                            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--sky)]"
                        />
                        <input
                            type="text"
                            aria-label="ค้นหาจุดเริ่มต้น"
                            placeholder="ค้นหาโรงแรมหรือสถานที่ เช่น ชื่อโรงแรม"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            className="w-full min-h-12 pl-12 pr-4 py-3 rounded-xl border border-[color:var(--line)] bg-white text-[color:var(--text)] placeholder:text-[color:var(--muted)] placeholder:opacity-60 focus:outline-none focus:border-[color:var(--navy)] focus:ring-4 focus:ring-[color:var(--line)] transition-all duration-200 font-sarabun"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void runSearch()}
                        disabled={searching || query.trim() === ""}
                        className="font-prompt font-medium shrink-0 min-h-12 px-5 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {searching ? (
                            <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
                        ) : (
                            "ค้นหา"
                        )}
                    </button>
                </div>

                {results.length > 0 && (
                    <ul
                        aria-label="ผลการค้นหา"
                        className="flex flex-col overflow-hidden rounded-xl border border-[color:var(--line)] bg-white"
                    >
                        {results.map((result) => (
                            <li key={result.id} className="border-b border-[color:var(--line)] last:border-b-0">
                                <button
                                    type="button"
                                    onClick={() => pickResult(result)}
                                    className="w-full flex items-start gap-2 px-4 py-3 text-left text-sm text-[color:var(--text)] hover:bg-[color:var(--sky-soft)] transition-colors duration-150 font-sarabun"
                                >
                                    <MapPin size={16} strokeWidth={1.75} className="shrink-0 mt-0.5 text-[color:var(--sky)]" />
                                    <span>{result.label}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {searchMessage && (
                    <p
                        role="alert"
                        className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 bg-white border text-[color:var(--danger)] border-[color:var(--danger)]"
                    >
                        <TriangleAlert size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                        <span>{searchMessage}</span>
                    </p>
                )}
            </div>

            {/* isolate: ให้ z-index ภายในของ Leaflet อยู่ในกล่องนี้ ไม่ทับ navbar */}
            <div className="isolate relative h-80 overflow-hidden rounded-xl border border-[color:var(--line)]">
                <MapContainer
                    center={[focus.lat, focus.lng]}
                    zoom={focus.zoom}
                    scrollWheelZoom
                    className="h-full w-full"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maxZoom={19}
                    />
                    <FocusMap focus={focus} />
                    <ClickToPin onPick={moveMarker} />
                    <Marker
                        position={[markerPos.lat, markerPos.lng]}
                        icon={pinIcon}
                        draggable
                        eventHandlers={{
                            dragend: (e) => {
                                const { lat, lng } = (e.target as L.Marker).getLatLng();
                                moveMarker(lat, lng);
                            },
                        }}
                    />
                </MapContainer>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p
                    className={`flex items-start gap-2 text-sm ${
                        confirmed
                            ? "text-[color:var(--success)] font-medium"
                            : "text-[color:var(--muted)]"
                    }`}
                >
                    {confirmed ? (
                        <CircleCheck size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                    ) : (
                        <MapPin size={18} strokeWidth={1.75} className="shrink-0 mt-0.5" />
                    )}
                    <span>
                        {confirmed
                            ? `ยืนยันจุดเริ่มต้นแล้ว (${markerPos.lat.toFixed(5)}, ${markerPos.lng.toFixed(5)})`
                            : "คลิกหรือลากหมุดบนแผนที่ หรือค้นหาสถานที่ แล้วกดยืนยันเพื่อบันทึกจุดเริ่มต้น"}
                    </span>
                </p>

                <button
                    type="button"
                    onClick={handleConfirm}
                    className={`font-prompt font-medium shrink-0 min-h-12 px-6 flex items-center justify-center gap-2 rounded-xl text-white active:scale-[0.98] transition-all duration-200 ${
                        confirmed
                            ? "bg-[color:var(--success)]"
                            : "bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)]"
                    }`}
                >
                    {confirmed ? (
                        <>
                            <CircleCheck size={20} strokeWidth={1.75} />
                            ยืนยันแล้ว
                        </>
                    ) : (
                        <>
                            <MapPin size={20} strokeWidth={1.75} />
                            ยืนยันปักหมุด
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
