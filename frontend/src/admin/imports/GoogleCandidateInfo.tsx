import type { ImportItem } from "../lib/importTypes";
import MapLink from "./MapLink";

// ข้อมูลสถานที่ที่ Google ตอบกลับ (ชื่อ ที่อยู่ ลิงก์แผนที่) รับผลของแถวนำเข้านั้น
export default function GoogleCandidateInfo({ candidate }: { candidate: NonNullable<ImportItem["candidate"]> }) {
  const location = candidate.lat != null && candidate.lng != null ? `${candidate.lat}, ${candidate.lng}` : null;

  return (
    <>
      <p className="text-[color:var(--text)]">{candidate.name ?? "–"}</p>
      {candidate.formatted_address && (
        <p className="text-xs text-[color:var(--muted)]">{candidate.formatted_address}</p>
      )}
      <MapLink location={location} />
    </>
  );
}
