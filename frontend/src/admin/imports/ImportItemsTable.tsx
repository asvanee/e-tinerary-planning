import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { adminRequest, errorMessage } from "../lib/adminApi";
import { ITEM_STATUS_CLASS, ITEM_STATUS_LABELS } from "../lib/importLabels";
import type { ImportItemsPage, ImportItemStatus } from "../lib/importTypes";
import MapLink from "./MapLink";

const PAGE_SIZE = 100; // ตรงกับ backend importQueries.ts::ITEMS_PAGE_SIZE

const FILTERS: (ImportItemStatus | null)[] = [null, ...(Object.keys(ITEM_STATUS_LABELS) as ImportItemStatus[])];

interface ImportItemsTableProps {
  jobId: string;
  token: string | undefined;
  refreshKey: string; // เปลี่ยนเมื่อ job มีความคืบหน้าหรือมีการตัดสินแถว → โหลดหน้าปัจจุบันใหม่
}

// ผลรายสถานที่ของ job: ชื่อใน CSV เทียบกับที่ Google เสนอ กรองตามสถานะ และแบ่งหน้า
export default function ImportItemsTable({ jobId, token, refreshKey }: ImportItemsTableProps) {
  const [filter, setFilter] = useState<ImportItemStatus | null>(null);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ImportItemsPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    const query = new URLSearchParams({ page: String(page), ...(filter ? { status: filter } : {}) });
    adminRequest<ImportItemsPage>(`/imports/${jobId}/items?${query}`, token)
      .then((result) => {
        if (!ignore) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (!ignore) setError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [jobId, token, filter, page, refreshKey]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" className="flex flex-wrap gap-2">
        {FILTERS.map((status) => (
          <button
            key={status ?? "all"}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => {
              setFilter(status);
              setPage(0);
            }}
            className={`font-prompt text-sm px-3 min-h-9 rounded-lg transition-colors ${
              filter === status
                ? "text-white bg-[color:var(--navy)]"
                : "text-[color:var(--navy)] bg-white border border-[color:var(--line)] hover:bg-[color:var(--sky-soft)]"
            }`}
          >
            {status ? ITEM_STATUS_LABELS[status] : "ทั้งหมด"}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 text-sm text-[color:var(--danger)]">
          <TriangleAlert size={16} strokeWidth={1.75} /> {error}
        </p>
      )}

      {!data && !error && (
        <p className="flex items-center gap-2 text-sm text-[color:var(--navy)]">
          <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> กำลังโหลดผลการนำเข้า...
        </p>
      )}

      {data && (
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--line)] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--sky-soft)] text-[color:var(--navy)] font-prompt">
              <tr>
                <th className="text-left px-3 py-2">สถานที่ใน CSV</th>
                <th className="text-left px-3 py-2">ผล</th>
                <th className="text-left px-3 py-2">Google</th>
                <th className="text-right px-3 py-2">ระยะห่างคลาดเคลื่อน</th>
                <th className="text-left px-3 py-2">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                const candidate = item.candidate;
                const candidateLocation =
                  candidate?.lat != null && candidate.lng != null ? `${candidate.lat}, ${candidate.lng}` : null;
                return (
                  <tr key={item.item_id} className="border-t border-[color:var(--line)] align-top">
                    <td className="px-3 py-2 min-w-48">
                      <p className="font-medium text-[color:var(--text)]">{item.csv_name ?? "(ไม่พบใน CSV)"}</p>
                      <p className="text-xs text-[color:var(--muted)]">{item.att_id}</p>
                      <MapLink location={item.csv_location} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`font-prompt text-xs font-medium px-2 py-1 rounded-full ${ITEM_STATUS_CLASS[item.status]}`}>
                        {ITEM_STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 min-w-48">
                      {candidate ? (
                        <>
                          <p className="text-[color:var(--text)]">{candidate.name ?? "–"}</p>
                          {candidate.formatted_address && (
                            <p className="text-xs text-[color:var(--muted)]">{candidate.formatted_address}</p>
                          )}
                          <MapLink location={candidateLocation} />
                        </>
                      ) : (
                        <span className="text-[color:var(--muted)]">–</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {item.distance_m != null ? `${item.distance_m.toLocaleString()} m` : "–"}
                    </td>
                    <td className="px-3 py-2 min-w-40 text-[color:var(--deep)]">{item.message ?? ""}</td>
                  </tr>
                );
              })}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[color:var(--muted)]">
                    ไม่มีรายการในหมวดนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && pageCount > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="font-prompt px-3 min-h-9 rounded-lg border border-[color:var(--line)] bg-white disabled:opacity-50"
          >
            ก่อนหน้า
          </button>
          <span className="text-[color:var(--deep)]">
            หน้า {page + 1} / {pageCount} · ทั้งหมด {data.total.toLocaleString()} แถว
          </span>
          <button
            type="button"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="font-prompt px-3 min-h-9 rounded-lg border border-[color:var(--line)] bg-white disabled:opacity-50"
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  );
}
