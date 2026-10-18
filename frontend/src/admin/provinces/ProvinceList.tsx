import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, TriangleAlert, ChevronRight } from "lucide-react";
import { useAuth } from "../../system/auth/useAuth";
import { adminRequest, errorMessage } from "../lib/adminApi";
import type { ProvinceSummary } from "../lib/reviewTypes";

// รายชื่อจังหวัดจาก attraction.csv พร้อมสถานะ — เลือกเพื่อเข้าไปตรวจข้อมูล (R5 P3, D-26)
export default function ProvinceList() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const token: string | undefined = session?.access_token;
  const [provinces, setProvinces] = useState<ProvinceSummary[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    adminRequest<{ provinces: ProvinceSummary[] }>("/provinces", token)
      .then((data) => {
        if (!ignore) setProvinces(data.provinces);
      })
      .catch((err) => {
        if (!ignore) setError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [token, reloadKey]);

  const filtered = useMemo(
    () => (provinces ?? []).filter((p) => p.province.includes(query.trim())),
    [provinces, query]
  );

  return (
    <div className="fade-in">
      <h1 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">
        เพิ่มจังหวัด
      </h1>
      <p className="text-[color:var(--deep)] mt-1">
        เลือกจังหวัดเพื่อตรวจสถานที่ซ้ำและสถานที่ที่มีปัญหาก่อนนำเข้า (ข้อมูลจาก attraction.csv ยังไม่เรียก Google)
      </p>

      <div className="relative mt-6 max-w-sm">
        <Search size={18} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาจังหวัด"
          aria-label="ค้นหาจังหวัด"
          className="w-full min-h-11 pl-10 pr-4 rounded-xl border border-[color:var(--line)] bg-white focus:outline-none focus:border-[color:var(--navy)]"
        />
      </div>

      {error && (
        <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 text-[color:var(--danger)]">
          <TriangleAlert size={18} strokeWidth={1.75} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError("");
              setReloadKey((k) => k + 1);
            }}
            className="font-prompt text-sm px-3 min-h-9 rounded-lg text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)]"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {!provinces && !error && (
        <p className="mt-6 flex items-center gap-2 text-[color:var(--navy)]">
          <Loader2 size={18} strokeWidth={1.75} className="animate-spin" /> กำลังโหลดรายชื่อจังหวัด...
        </p>
      )}

      {provinces && (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-[color:var(--line)] bg-white [box-shadow:var(--shadow)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--sky-soft)] text-[color:var(--navy)] font-prompt">
              <tr>
                <th className="text-left px-4 py-3">จังหวัด</th>
                <th className="text-right px-4 py-3">สถานที่ใน CSV</th>
                <th className="text-right px-4 py-3">อยู่ในระบบแล้ว</th>
                <th className="text-right px-4 py-3">ตัดสินใจแล้ว</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.province} className="border-t border-[color:var(--line)] hover:bg-[color:var(--sky-soft)]">
                  <td className="px-4 py-3 font-medium text-[color:var(--text)]">{p.province}</td>
                  <td className="px-4 py-3 text-right">{p.csvRows.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{p.importedPlaces > 0 ? p.importedPlaces.toLocaleString() : "–"}</td>
                  <td className="px-4 py-3 text-right">{p.decisions > 0 ? p.decisions.toLocaleString() : "–"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/provinces/${encodeURIComponent(p.province)}`)}
                      className="font-prompt inline-flex items-center gap-1 px-3 min-h-9 rounded-lg text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)]"
                    >
                      ตรวจข้อมูล <ChevronRight size={16} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[color:var(--muted)]">
                    ไม่พบจังหวัดที่ค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
