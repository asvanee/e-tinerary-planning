import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, TriangleAlert } from "lucide-react";
import { useAuth } from "../../system/auth/useAuth";
import { adminRequest, errorMessage } from "../lib/adminApi";
import type { GroupDecisionInput, ProvinceReview as Review, RowDecisionInput } from "../lib/reviewTypes";
import GroupCard from "./components/GroupCard";
import ProblemRowCard from "./components/ProblemRowCard";

type Tab = "likely" | "review" | "problems" | "decided";

const groupKey = (g: Review["groups"][number]) => `${g.reasons[0]?.type}:${g.attIds.join(",")}`;

// หน้าตรวจข้อมูลของจังหวัด — ทุกการตัดสินใจบันทึกลง DB ทันที (R5 P3, D-26)
export default function ProvinceReview() {
  const navigate = useNavigate();
  const { province = "" } = useParams();
  const { session } = useAuth();
  const token: string | undefined = session?.access_token;
  const [review, setReview] = useState<Review | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("likely");
  const [reloadKey, setReloadKey] = useState(0);

  const base = `/provinces/${encodeURIComponent(province)}`;

  useEffect(() => {
    let ignore = false;
    adminRequest<Review>(`${base}/review`, token)
      .then((data) => {
        if (!ignore) setReview(data);
      })
      .catch((err) => {
        if (!ignore) setLoadError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [base, token, reloadKey]);

  // ทุก action ตอบผลรีวิวใหม่กลับมา จึงแทนที่ทั้งก้อน
  const run = async (request: Promise<Review>) => {
    setBusy(true);
    setActionError("");
    try {
      setReview(await request);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = (input: GroupDecisionInput) =>
    run(adminRequest<Review>(`${base}/groups`, token, { method: "PUT", body: input }));
  const undoGroup = (attIds: string[]) =>
    run(adminRequest<Review>(`${base}/groups`, token, { method: "DELETE", body: { attIds } }));
  const saveRow = (attId: string, input: RowDecisionInput) =>
    run(adminRequest<Review>(`${base}/rows/${encodeURIComponent(attId)}`, token, { method: "PUT", body: input }));
  const undoRow = (attId: string) =>
    run(adminRequest<Review>(`${base}/rows/${encodeURIComponent(attId)}`, token, { method: "DELETE" }));

  const back = (
    <button
      type="button"
      onClick={() => navigate("/admin/provinces")}
      className="inline-flex items-center gap-1 text-sm text-[color:var(--deep)] underline"
    >
      <ArrowLeft size={16} strokeWidth={1.75} /> กลับไปรายชื่อจังหวัด
    </button>
  );

  if (loadError) {
    return (
      <div className="fade-in flex flex-col gap-4">
        {back}
        <div role="alert" className="flex flex-wrap items-center gap-3 text-[color:var(--danger)]">
          <TriangleAlert size={18} strokeWidth={1.75} /> {loadError}
          <button
            type="button"
            onClick={() => {
              setLoadError("");
              setReloadKey((k) => k + 1);
            }}
            className="font-prompt text-sm px-3 min-h-9 rounded-lg text-white bg-[color:var(--navy)]"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="fade-in flex flex-col gap-4">
        {back}
        <p className="flex items-center gap-2 text-[color:var(--navy)]">
          <Loader2 size={18} strokeWidth={1.75} className="animate-spin" /> กำลังวิเคราะห์ข้อมูลของ{province}...
        </p>
      </div>
    );
  }

  const likely = review.groups.filter((g) => !g.decided && g.category === "likely_duplicate");
  const needsReview = review.groups.filter((g) => !g.decided && g.category === "needs_review");
  const problems = review.problemRows.filter((r) => r.issues.length > 0 && !r.decision);
  const decidedGroups = review.groups.filter((g) => g.decided);
  const decidedRows = review.problemRows.filter((r) => r.decision);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "likely", label: "น่าจะซ้ำ", count: likely.length },
    { id: "review", label: "ต้องตรวจสอบ", count: needsReview.length },
    { id: "problems", label: "สถานที่มีปัญหา", count: problems.length },
    { id: "decided", label: "ตัดสินใจแล้ว", count: decidedGroups.length + decidedRows.length },
  ];

  const groupCard = (g: Review["groups"][number]) => (
    <GroupCard
      key={groupKey(g)}
      group={g}
      rows={review.rows}
      decisions={review.decisions}
      busy={busy}
      onSave={saveGroup}
      onUndo={undoGroup}
    />
  );
  const rowCard = (r: Review["problemRows"][number]) => (
    <ProblemRowCard key={r.attId} item={r} row={review.rows[r.attId]} busy={busy} onSave={saveRow} onUndo={undoRow} />
  );

  const { summary } = review;
  return (
    <div className="fade-in flex flex-col gap-4">
      {back}
      <div>
        <h1 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">{review.province}</h1>
        <p className="text-[color:var(--deep)] mt-1">
          {summary.rows.toLocaleString()} สถานที่ใน CSV · ตัดทิ้ง {summary.excluded} · เหลือต้องตัดสินใจ{" "}
          <strong>{summary.pending}</strong> รายการ
        </p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`font-prompt text-sm font-medium px-4 min-h-10 rounded-xl transition-colors ${
              tab === t.id
                ? "text-white bg-[color:var(--navy)]"
                : "text-[color:var(--navy)] bg-white border border-[color:var(--line)] hover:bg-[color:var(--sky-soft)]"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {actionError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-[color:var(--danger)]">
          <TriangleAlert size={16} strokeWidth={1.75} /> {actionError}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {tab === "likely" && likely.map(groupCard)}
        {tab === "review" && needsReview.map(groupCard)}
        {tab === "problems" && problems.map(rowCard)}
        {tab === "decided" && [...decidedGroups.map(groupCard), ...decidedRows.map(rowCard)]}
        {tabs.find((t) => t.id === tab)?.count === 0 && (
          <p className="text-[color:var(--muted)]">ไม่มีรายการในหมวดนี้</p>
        )}
      </div>
    </div>
  );
}
