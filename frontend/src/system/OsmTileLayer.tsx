import { TileLayer } from "react-leaflet";

// ชั้นแผนที่พื้นหลังจาก OpenStreetMap ใช้ในทุกแผนที่ (ใส่เครดิตเพิ่มได้ผ่าน extraAttribution)
export default function OsmTileLayer({ extraAttribution = "" }: { extraAttribution?: string }) {
  return (
    <TileLayer
      attribution={`&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors${extraAttribution}`}
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={19}
    />
  );
}
