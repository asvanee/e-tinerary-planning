import { useState } from "react";
import { Combine, ExternalLink, Split, Undo2 } from "lucide-react";
import type { AttractionRow, GroupDecisionInput, MergeSetInput, PlaceDecision, ReviewGroup } from "../../lib/reviewTypes";
import { KEY_FIELDS, MERGE_FIELDS, REASON_LABELS, displayName, fieldLabel, mapsUrl, parseLatLng } from "../../lib/placeFields";

interface GroupCardProps {
  group: ReviewGroup;
  rows: Record<string, AttractionRow>;
  decisions: PlaceDecision[];
  busy: boolean;
  onSave: (input: GroupDecisionInput) => void;
  onUndo: (attIds: string[]) => void;
}

const valueOf = (row: AttractionRow | undefined, column: string) => row?.[column]?.trim() ?? "";

// ค่าใน sources ที่แปลว่า "ใช้ค่าที่พิมพ์เอง" แทนการเลือกจากแถว (D-32)
const MANUAL = "__manual__";

// กลุ่มสถานที่ที่อาจเป็นที่เดียวกัน: เลือกแถวที่จะรวม → เลือกแถวหลัก → เลือกค่าทีละช่อง (D-26)
// ตอนเลือกรวม: แสดงทุกช่องที่ใช้ตอนนำเข้า (MERGE_FIELDS — D-31) เลือกค่าจากแถวไหนก็ได้ หรือพิมพ์เอง (D-32)
// ยังไม่เลือกรวม: แสดงเฉพาะช่องสำคัญ (KEY_FIELDS) · พิกัดพิมพ์เองผ่านช่อง "กรอกพิกัดเอง"
// แถวที่ไม่ได้เลือกจะถือว่าเป็นสถานที่แยก
export default function GroupCard({ group, rows, decisions, busy, onSave, onUndo }: GroupCardProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.category === "likely_duplicate" ? group.attIds : [])
  );
  const [primary, setPrimary] = useState(group.suggestedPrimaryAttId);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [manualLocation, setManualLocation] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");

  const formId = `${group.reasons[0]?.type}-${group.attIds.join("-")}`; // name ของ radio ต้องไม่ชนกับการ์ดอื่น
  const selectedIds = group.attIds.filter((id) => selected.has(id));
  const canMerge = selectedIds.length >= 2;
  const effectivePrimary = selected.has(primary) ? primary : selectedIds[0];
  const manualCoords = parseLatLng(manualLocation);

  const differs = (column: string, ids: string[]) => new Set(ids.map((id) => valueOf(rows[id], column))).size > 1;
  const mergeable = (column: string) => MERGE_FIELDS.includes(column);
  const typeable = (column: string) => mergeable(column) && column !== "ATT_LOCATION";

  const visibleColumns =
    canMerge && !group.decided ? [...KEY_FIELDS, ...MERGE_FIELDS.filter((c) => !KEY_FIELDS.includes(c))] : KEY_FIELDS;

  const sourceFor = (column: string) =>
    sources[column] === MANUAL || (sources[column] && selected.has(sources[column])) ? sources[column] : effectivePrimary;

  const typeValue = (column: string, value: string) => {
    setManualValues((prev) => ({ ...prev, [column]: value }));
    setSources((prev) => ({ ...prev, [column]: MANUAL }));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitMerge = () => {
    if (manualLocation.trim() && !manualCoords) {
      setFormError('พิกัดที่กรอกต้องเป็นรูปแบบ "lat, lng" เช่น 18.7883, 98.9853');
      return;
    }
    setFormError("");
    const fieldSources: Record<string, string> = {};
    const fieldValues: Record<string, string> = {};
    for (const column of MERGE_FIELDS) {
      if (column === "ATT_LOCATION" && manualCoords) continue;
      const source = sourceFor(column);
      if (source === MANUAL) {
        if (typeable(column)) fieldValues[column] = manualValues[column] ?? "";
      } else if (source !== effectivePrimary && differs(column, selectedIds)) {
        fieldSources[column] = source;
      }
    }
    const set: MergeSetInput = { attIds: selectedIds, primaryAttId: effectivePrimary, fieldSources, fieldValues };
    if (manualCoords) Object.assign(set, manualCoords);
    onSave({ attIds: group.attIds, sets: [set], note: note.trim() || undefined });
  };

  const groupDecisions = decisions.filter((d) => group.decisionIds.includes(d.decision_id));
  const ownDecision = groupDecisions.some((d) => d.att_ids.every((id) => group.attIds.includes(id)));

  return (
    <article className="rounded-2xl bg-white border border-[color:var(--line)] [box-shadow:var(--shadow)] p-4 sm:p-5">
      <header className="flex flex-wrap items-center gap-2">
        {group.reasons.map((r) => (
          <span
            key={r.type}
            className={`font-prompt text-xs font-medium px-2 py-1 rounded-full ${
              group.category === "likely_duplicate"
                ? "bg-[color:var(--sky-soft)] text-[color:var(--navy)]"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {REASON_LABELS[r.type]}
          </span>
        ))}
        <span className="text-sm text-[color:var(--muted)]">{group.attIds.length} แถว</span>
      </header>
      <p className="text-sm text-[color:var(--deep)] mt-2">{group.reasons.map((r) => r.detail).join(" · ")}</p>

      {group.decided ? (
        <div className="mt-4 rounded-xl bg-[color:var(--sky-soft)] p-3 text-sm">
          {groupDecisions.map((d) => (
            <p key={d.decision_id}>
              {d.kind === "merge"
                ? `รวม ${d.att_ids.length} แถวเป็นที่เดียว — แถวหลัก "${displayName(rows[d.primary_att_id ?? ""])}"`
                : "สถานที่ที่ไม่ได้รวมกันถือเป็นคนละที่"}
              {d.field_values && Object.keys(d.field_values).length > 0
                ? ` · พิมพ์เอง: ${Object.keys(d.field_values).map(fieldLabel).join(", ")}`
                : ""}
              {d.note ? ` · หมายเหตุ: ${d.note}` : ""}
            </p>
          ))}
          {ownDecision ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onUndo(group.attIds)}
              className="mt-2 inline-flex items-center gap-1 font-prompt text-sm text-[color:var(--deep)] underline disabled:opacity-60"
            >
              <Undo2 size={16} strokeWidth={1.75} /> ยกเลิกการตัดสินใจ
            </button>
          ) : (
            <p className="mt-1 text-[color:var(--muted)]">ตัดสินใจจากกลุ่มอื่นที่มีสถานที่เหล่านี้อยู่</p>
          )}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="text-sm border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white" />
              {group.attIds.map((id) => {
                const url = mapsUrl(rows[id]);
                return (
                  <th key={id} className="align-top text-left font-normal px-3 py-2 min-w-48 max-w-64 border-b border-[color:var(--line)]">
                    {!group.decided && (
                      <div className="flex flex-col gap-1 mb-2">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
                          รวม
                        </label>
                        {canMerge && selected.has(id) && (
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`primary-${formId}`}
                              checked={effectivePrimary === id}
                              onChange={() => setPrimary(id)}
                            />
                            แถวหลัก
                          </label>
                        )}
                      </div>
                    )}
                    <p className="font-prompt font-medium text-[color:var(--navy)]">{displayName(rows[id])}</p>
                    <p className="text-xs text-[color:var(--muted)]">{id}</p>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[color:var(--deep)] underline">
                        เปิดใน Google Maps <ExternalLink size={12} strokeWidth={1.75} />
                      </a>
                    )}
                  </th>
                );
              })}
              {canMerge && !group.decided && (
                <th className="align-bottom text-left font-prompt font-medium text-[color:var(--navy)] px-3 py-2 min-w-48 border-b border-[color:var(--line)]">
                  พิมพ์เอง
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleColumns.map((column) => {
              // ช่องที่พิมพ์เองได้ให้เลือกจากทุกแถวเสมอ (ไว้สลับกลับจาก "พิมพ์เอง") · พิกัดเลือกได้เมื่อค่าต่างกัน
              const choosable =
                !group.decided &&
                canMerge &&
                mergeable(column) &&
                (typeable(column) || differs(column, selectedIds)) &&
                !(column === "ATT_LOCATION" && manualCoords);
              const manualChosen = choosable && sourceFor(column) === MANUAL;
              return (
                <tr key={column} className="border-b border-[color:var(--line)]">
                  <th className="sticky left-0 bg-white text-left font-prompt font-medium text-[color:var(--navy)] px-3 py-2 whitespace-nowrap">
                    {fieldLabel(column)}
                  </th>
                  {group.attIds.map((id) => {
                    const value = valueOf(rows[id], column);
                    const isChoice = choosable && selected.has(id);
                    const chosen = isChoice && sourceFor(column) === id;
                    return (
                      <td key={id} className={`align-top px-3 py-2 max-w-64 ${chosen ? "bg-[color:var(--sky-soft)]" : ""}`}>
                        <label className={`flex gap-2 ${isChoice ? "cursor-pointer" : ""}`}>
                          {isChoice && (
                            <input
                              type="radio"
                              name={`${column}-${formId}`}
                              checked={chosen}
                              onChange={() => setSources((prev) => ({ ...prev, [column]: id }))}
                            />
                          )}
                          <span className="line-clamp-3 break-words" title={value}>
                            {value || <span className="text-[color:var(--muted)]">–</span>}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                  {canMerge && !group.decided && (
                    <td className={`align-top px-3 py-2 ${manualChosen ? "bg-[color:var(--sky-soft)]" : ""}`}>
                      {choosable && typeable(column) ? (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`${column}-${formId}`}
                            checked={manualChosen}
                            onChange={() => typeValue(column, manualValues[column] ?? "")}
                          />
                          <input
                            value={manualValues[column] ?? ""}
                            onChange={(e) => typeValue(column, e.target.value)}
                            placeholder="พิมพ์ค่าใหม่"
                            aria-label={`พิมพ์${fieldLabel(column)}เอง`}
                            className="min-h-9 w-full px-2 rounded-lg border border-[color:var(--line)]"
                          />
                        </label>
                      ) : column === "ATT_LOCATION" ? (
                        <span className="text-xs text-[color:var(--muted)]">ใช้ช่อง "กรอกพิกัดเอง" ด้านล่าง</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canMerge && !group.decided && (
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          แสดงเฉพาะช่องที่ใช้ตอนนำเข้า · เลือกได้ว่าจะใช้ค่าของแถวไหน หรือพิมพ์เอง (เว้นว่าง = ไม่มีข้อมูลช่องนั้น)
        </p>
      )}

      {!group.decided && (
        <div className="mt-4 flex flex-col gap-3">
          {canMerge && (
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className="font-prompt text-[color:var(--navy)]">กรอกพิกัดเอง (ไม่บังคับ)</span>
                <input
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
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
          )}
          {formError && <p role="alert" className="text-sm text-[color:var(--danger)]">{formError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !canMerge}
              onClick={submitMerge}
              className="font-prompt inline-flex items-center gap-2 px-4 min-h-10 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] disabled:opacity-50"
            >
              <Combine size={18} strokeWidth={1.75} /> รวมที่เลือกเป็นที่เดียว ({selectedIds.length})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSave({ attIds: group.attIds, sets: [], note: note.trim() || undefined })}
              className="font-prompt inline-flex items-center gap-2 px-4 min-h-10 rounded-xl border border-[color:var(--navy)] text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] disabled:opacity-50"
            >
              <Split size={18} strokeWidth={1.75} /> แยกทั้งหมด (คนละที่)
            </button>
            {canMerge && selectedIds.length < group.attIds.length && (
              <span className="text-xs text-[color:var(--muted)]">แถวที่ไม่ได้เลือกจะถือว่าเป็นสถานที่แยก</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
