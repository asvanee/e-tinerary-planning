import { ExternalLink } from "lucide-react";
import { mapsUrl } from "../lib/placeFields";

// ลิงก์เปิดพิกัด "lat, lng" ใน Google Maps (ไม่มีพิกัด = ไม่แสดง)
export default function MapLink({ location }: { location: string | null }) {
  const url = location ? mapsUrl({ ATT_LOCATION: location }) : null;
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[color:var(--deep)] underline">
      แผนที่ <ExternalLink size={12} strokeWidth={1.75} />
    </a>
  );
}
