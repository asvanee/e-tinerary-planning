import { useCallback, useRef, useState } from "react";
import {
    GoogleMap,
    Marker,
    Autocomplete,
    useJsApiLoader,
} from "@react-google-maps/api";

// ต้องตรงกับชื่อ key ที่ตั้งใน .env (Vite ต้องขึ้นต้นด้วย VITE_)
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// libraries ต้องประกาศเป็น array นอก component ไม่งั้น useJsApiLoader จะ re-load ทุก render
const LIBRARIES: ("places")[] = ["places"];

const mapContainerStyle = {
    width: "100%",
    height: "320px",
    borderRadius: "16px",
};

// default center: กรุงเทพมหานคร (กรณียังไม่เคยปักหมุดมาก่อน)
const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 };

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
    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: LIBRARIES,
    });

    const [markerPos, setMarkerPos] = useState<{ lat: number; lng: number }>(
        initialLat && initialLng
            ? { lat: initialLat, lng: initialLng }
            : DEFAULT_CENTER
    );
    const [pendingAddress, setPendingAddress] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    const mapRef = useRef<google.maps.Map | null>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

    const onMapLoad = useCallback((map: google.maps.Map) => {
        mapRef.current = map;
    }, []);

    const onAutocompleteLoad = useCallback(
        (autocomplete: google.maps.places.Autocomplete) => {
            autocompleteRef.current = autocomplete;
        },
        []
    );

    const handlePlaceChanged = () => {
        const place = autocompleteRef.current?.getPlace();
        if (!place || !place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        setMarkerPos({ lat, lng });
        setPendingAddress(place.formatted_address || place.name || null);
        setConfirmed(false); // ค้นหาใหม่ = ต้องกดยืนยันใหม่เสมอ

        mapRef.current?.panTo({ lat, lng });
        mapRef.current?.setZoom(16);
    };

    const handleMarkerDragEnd = (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        setMarkerPos({ lat, lng });
        setPendingAddress(null); // ลากเองแล้ว ไม่รู้ที่อยู่ชัวร์ ให้ reverse geocode คร่าวๆ ทีหลังได้ถ้าต้องการ
        setConfirmed(false); // ลากใหม่ = ต้องกดยืนยันใหม่เสมอ
    };

    const handleConfirm = () => {
        setConfirmed(true);
        onConfirm(markerPos.lat, markerPos.lng, pendingAddress);
    };

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

    return (
        <div className="flex flex-col gap-3">
            <Autocomplete
                onLoad={onAutocompleteLoad}
                onPlaceChanged={handlePlaceChanged}
            >
                <input
                    type="text"
                    placeholder="ค้นหาโรงแรม/จุดเริ่มต้น เช่น ชื่อโรงแรมหรือสถานที่"
                    className="w-full px-4 py-3 rounded-xl border border-[#5990c0]/40 bg-white text-[#102a6b] placeholder-[#5990c0]/60 focus:outline-none focus:ring-2 focus:ring-[#015185] transition-all duration-200 font-sarabun"
                />
            </Autocomplete>

            <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={markerPos}
                zoom={initialLat && initialLng ? 16 : 11}
                onLoad={onMapLoad}
                options={{
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false,
                }}
            >
                <Marker
                    position={markerPos}
                    draggable
                    onDragEnd={handleMarkerDragEnd}
                />
            </GoogleMap>

            <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-[#5990c0] font-sarabun">
                    {confirmed ? (
                        <span className="text-green-600 font-semibold">
                            ✅ ยืนยันจุดเริ่มต้นแล้ว ({markerPos.lat.toFixed(5)}, {markerPos.lng.toFixed(5)})
                        </span>
                    ) : (
                        <span>
                            ลากหมุดหรือค้นหาสถานที่ แล้วกดยืนยันเพื่อบันทึกจุดเริ่มต้น
                        </span>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleConfirm}
                    className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                        confirmed
                            ? "bg-green-600 text-white"
                            : "bg-gradient-to-r from-[#102a6b] to-[#015185] text-white"
                    }`}
                >
                    {confirmed ? "ยืนยันแล้ว ✓" : "ยืนยันปักหมุด"}
                </button>
            </div>
        </div>
    );
}