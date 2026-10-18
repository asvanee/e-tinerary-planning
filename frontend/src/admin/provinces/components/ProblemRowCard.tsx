import { useState } from "react";
import { CheckCircle2, ExternalLink, MapPin, Trash2, Undo2 } from "lucide-react";
import type { AttractionRow, ReviewRow, RowDecisionInput } from "../../lib/reviewTypes";
import { ISSUE_LABELS, displayName, mapsUrl, parseLatLng } from "../../lib/placeFields";

interface ProblemRowCardProps {
  item: ReviewRow;
  row: AttractionRow | undefined;
  busy: boolean;
  onSave: (attId: string, input: RowDecisionInput) => void;
  onUndo: (attId: string) => void;
}

const DECISION_TEXT = {
  exclude: "ตัดทิ้ง (ไม่นำเข้า)",
  ok: "ตรวจแล้ว ไม่ใช่ปัญหา",
  fix_location: "แก้พิกัดแล้ว",
} as const;

// สถานที่ที่มีปัญหา: ตัดทิ้ง / แก้พิกัด / ยืนยันว่าปกติ
export default function ProblemRowCard({ item, row, busy, onSave, onUndo }: ProblemRowCardProps) {
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const url = mapsUrl(row);
  const decision = item.decision;
  const noteValue = note.trim() || undefined;

  const saveLocation = () => {
    const coords = parseLatLng(location);
    if (!coords) {
      setFormError('พิกัดต้องเป็นรูปแบบ "lat, lng" เช่น 18.7883, 98.9853');
      return;
    }
    setFormError("");
    onSave(item.attId, { kind: "fix_location", ...coords, note: noteValue });
  };

  return (
    <article className="rounded-2xl bg-white border border-[color:var(--line)] [box-shadow:var(--shadow)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-prompt font-medium text-[color:var(--navy)]">{displayName(row)}</p>
          <p className="text-xs text-[color:var(--muted)]">
            {item.attId} · {row?.DISTRICT_NAME_TH || "ไม่ระบุอำเภอ"} · พิกัด: {row?.ATT_LOCATION?.trim() || "–"}
          </p>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[color:var(--deep)] underline">
            เปิดใน Google Maps <ExternalLink size={14} strokeWidth={1.75} />
          </a>
        )}
      </div>

      {item.issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {item.issues.map((issue) => (
            <li key={issue.type} className="text-amber-800">
              <span className="font-medium">{ISSUE_LABELS[issue.type]}</span> — {issue.detail}
            </li>
          ))}
        </ul>
      )}

      {decision ? (
        <div className="mt-3 rounded-xl bg-[color:var(--sky-soft)] p-3 text-sm flex flex-wrap items-center gap-3">
          <span>
            {DECISION_TEXT[decision.kind as keyof typeof DECISION_TEXT]}
            {decision.kind === "fix_location" ? ` → ${decision.lat}, ${decision.lng}` : ""}
            {decision.note ? ` · หมายเหตุ: ${decision.note}` : ""}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onUndo(item.attId)}
            className="inline-flex items-center gap-1 font-prompt text-[color:var(--deep)] underline disabled:opacity-60"
          >
            <Undo2 size={16} strokeWidth={1.75} /> ยกเลิก
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-prompt text-[color:var(--navy)]">พิกัดที่ถูกต้อง</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="lat, lng"
                className="min-h-10 px-3 rounded-lg border border-[color:var(--line)]"
              />
            </label>
            <label className="flex flex-col gap-1 grow">
              <span className="font-prompt text-[color:var(--navy)]">หมายเหตุ (ไม่บังคับ)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-10 px-3 rounded-lg border border-[color:var(--line)]"
              />
            </label>
          </div>
          {formError && <p role="alert" className="text-sm text-[color:var(--danger)]">{formError}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={saveLocation}
              className="font-prompt inline-flex items-center gap-2 px-4 min-h-10 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] disabled:opacity-50"
            >
              <MapPin size={18} strokeWidth={1.75} /> บันทึกพิกัด
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave(item.attId, { kind: "ok", note: noteValue })}
              className="font-prompt inline-flex items-center gap-2 px-4 min-h-10 rounded-xl border border-[color:var(--navy)] text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] disabled:opacity-50"
            >
              <CheckCircle2 size={18} strokeWidth={1.75} /> ไม่ใช่ปัญหา
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave(item.attId, { kind: "exclude", note: noteValue })}
              className="font-prompt inline-flex items-center gap-2 px-4 min-h-10 rounded-xl border border-[color:var(--danger)] text-[color:var(--danger)] hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={18} strokeWidth={1.75} /> ตัดทิ้ง
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
