import { useEffect, useState } from "react";
import { Check, FileText, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { adminRequest, errorMessage } from "../lib/adminApi";
import { ITEM_STATUS_CLASS, ITEM_STATUS_LABELS } from "../lib/importLabels";
import type { ImportItem } from "../lib/importTypes";
import MapLink from "./MapLink";

type ResolveAction = "accept_google" | "csv_only" | "skip";

const actionBtn =
  "font-prompt inline-flex items-center gap-1.5 px-3 min-h-9 rounded-lg text-sm border disabled:opacity-50";

interface PendingReviewProps {
  base: string; // /provinces/<จังหวัด>
  token: string | undefined;
  reloadKey: number; // เปลี่ยนเมื่อมี job จบ → โหลดรายการใหม่
  onResolved: () => void;
}

// แถวที่รอ admin ตัดสินหลังนำเข้า (R5 P4c): ยอมรับผล Google / นำเข้าจาก CSV อย่างเดียว / ตัดทิ้ง
export default function PendingReview({ base, token, reloadKey, onResolved }: PendingReviewProps) {
  const [items, setItems] = useState<ImportItem[] | null>(null);
  const [error, setError] = useState("");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ itemId: string; message: string } | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let ignore = false;
    adminRequest<{ items: ImportItem[] }>(`${base}/import/pending`, token)
      .then((data) => {
        if (!ignore) {
          setItems(data.items);
          setError("");
        }
      })
      .catch((err) => {
        if (!ignore) setError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [base, token, reloadKey, refresh]);

  const resolve = async (item: ImportItem, action: ResolveAction) => {
    if (action === "accept_google" && !window.confirm("ยอมรับผล Google จะเรียก Place Details และราคา (Places API New) อย่างละ 1 ครั้ง (มีค่าใช้จ่าย) ต้องการต่อไหม")) {
      return;
    }
    setBusyItemId(item.item_id);
    setActionError(null);
    try {
      await adminRequest(`/imports/items/${item.item_id}/resolve`, token, { method: "POST", body: { action } });
      setRefresh((k) => k + 1);
      onResolved();
    } catch (err) {
      setActionError({ itemId: item.item_id, message: errorMessage(err) });
    } finally {
      setBusyItemId(null);
    }
  };

  if (error) {
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-[color:var(--danger)]">
        <TriangleAlert size={16} strokeWidth={1.75} /> {error}
      </p>
    );
  }

  if (!items) {
    return (
      <p className="flex items-center gap-2 text-sm text-[color:var(--navy)]">
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> กำลังโหลดรายการรอตรวจ...
      </p>
    );
  }

  if (items.length === 0) return <p className="text-sm text-[color:var(--muted)]">ไม่มีรายการรอตรวจ</p>;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const candidate = item.candidate;
        const candidateLocation =
          candidate?.lat != null && candidate.lng != null ? `${candidate.lat}, ${candidate.lng}` : null;
        // แถวซ้ำ/ไม่พบใน Google ไม่มีผลให้ยอมรับ (backend ตรวจซ้ำ)
        const canAccept = item.status !== "needs_review_duplicate" && !!item.google_place_id;
        const busy = busyItemId !== null;
        return (
          <li key={item.item_id} className="rounded-xl border border-[color:var(--line)] p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-prompt text-xs font-medium px-2 py-1 rounded-full ${ITEM_STATUS_CLASS[item.status]}`}>
                {ITEM_STATUS_LABELS[item.status]}
              </span>
              {item.distance_m != null && (
                <span className="text-xs text-[color:var(--muted)]">ห่าง {item.distance_m.toLocaleString()} m</span>
              )}
              {item.message && <span className="text-xs text-[color:var(--deep)]">· {item.message}</span>}
            </div>

            <div className="mt-2 grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs text-[color:var(--muted)]">ใน CSV</p>
                <p className="font-medium text-[color:var(--text)]">{item.csv_name ?? "(ไม่พบใน CSV)"}</p>
                <p className="text-xs text-[color:var(--muted)]">{item.att_id}</p>
                <MapLink location={item.csv_location} />
              </div>
              <div>
                <p className="text-xs text-[color:var(--muted)]">Google</p>
                {candidate ? (
                  <>
                    <p className="text-[color:var(--text)]">{candidate.name ?? "–"}</p>
                    {candidate.formatted_address && (
                      <p className="text-xs text-[color:var(--muted)]">{candidate.formatted_address}</p>
                    )}
                    <MapLink location={candidateLocation} />
                  </>
                ) : (
                  <p className="text-[color:var(--muted)]">–</p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !canAccept}
                onClick={() => resolve(item, "accept_google")}
                className={`${actionBtn} text-white bg-[color:var(--navy)] border-[color:var(--navy)] hover:bg-[color:var(--navy-dark)]`}
              >
                <Check size={16} strokeWidth={1.75} /> ยอมรับผล Google
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => resolve(item, "csv_only")}
                className={`${actionBtn} text-[color:var(--navy)] border-[color:var(--navy)] hover:bg-[color:var(--sky-soft)]`}
              >
                <FileText size={16} strokeWidth={1.75} /> นำเข้าจาก CSV อย่างเดียว
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => resolve(item, "skip")}
                className={`${actionBtn} text-[color:var(--danger)] border-[color:var(--line)] hover:bg-red-50`}
              >
                <Trash2 size={16} strokeWidth={1.75} /> ตัดทิ้ง
              </button>
              {busyItemId === item.item_id && (
                <Loader2 size={18} strokeWidth={1.75} className="animate-spin self-center text-[color:var(--navy)]" />
              )}
            </div>
            {actionError?.itemId === item.item_id && (
              <p role="alert" className="mt-2 text-sm text-[color:var(--danger)]">
                {actionError.message}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
