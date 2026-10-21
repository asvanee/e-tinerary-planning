import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CloudDownload, Loader2, TriangleAlert, X } from "lucide-react";
import { useAuth } from "../../system/auth/useAuth";
import { adminRequest, errorMessage } from "../lib/adminApi";
import type { ImportJob, ImportJobStatus, ImportPreview } from "../lib/importTypes";
import ImportItemsTable from "./ImportItemsTable";
import PendingReview from "./PendingReview";

const POLL_MS = 2000;
const DEFAULT_LIMIT = "10"; // เริ่มทีละน้อยเพราะทุกแถวเรียก Google (มีค่าใช้จ่าย) — ลบออกได้ถ้าต้องการทั้งหมด

const JOB_STATUS_LABELS: Record<ImportJobStatus, string> = {
  queued: "รอเริ่ม",
  running: "กำลังนำเข้า",
  done: "เสร็จแล้ว",
  failed: "ล้มเหลว",
  cancelled: "ยกเลิกแล้ว",
};

const isActive = (job: ImportJob) => job.status === "queued" || job.status === "running";
const formatDateTime = (iso: string) => new Date(iso).toLocaleString("th-TH");

const cardClass = "rounded-2xl bg-white border border-[color:var(--line)] [box-shadow:var(--shadow)] p-4 sm:p-5";
const primaryBtn =
  "font-prompt inline-flex items-center gap-2 px-4 min-h-10 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] disabled:opacity-50";
const secondaryBtn =
  "font-prompt inline-flex items-center gap-2 px-4 min-h-10 rounded-xl border border-[color:var(--navy)] text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] disabled:opacity-50";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[color:var(--sky-soft)] px-4 py-3">
      <p className="text-xs text-[color:var(--deep)]">{label}</p>
      <p className="font-prompt font-semibold text-xl text-[color:var(--navy)]">{value.toLocaleString()}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)] mb-3">{children}</h2>;
}

// นำเข้าสถานที่ของจังหวัดจาก CSV + Google (R5 P4b): ดูตัวอย่าง → เริ่ม → ความคืบหน้า → ผล
// + ตัดสินแถวที่รอตรวจหลังนำเข้า (P4c)
export default function ProvinceImport() {
  const navigate = useNavigate();
  const { province = "" } = useParams();
  const { session } = useAuth();
  const token: string | undefined = session?.access_token;
  const base = `/provinces/${encodeURIComponent(province)}`;

  const [limitInput, setLimitInput] = useState(DEFAULT_LIMIT);
  const [appliedLimit, setAppliedLimit] = useState(DEFAULT_LIMIT); // limit ที่ใช้คำนวณตัวอย่างล่าสุด
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [jobs, setJobs] = useState<ImportJob[] | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [resolveCount, setResolveCount] = useState(0); // เพิ่มทุกครั้งที่ตัดสินแถว → ตารางผลโหลดใหม่

  // ---- ดูตัวอย่าง (ไม่เรียก Google) ----
  useEffect(() => {
    let ignore = false;
    const query = appliedLimit ? `?limit=${appliedLimit}` : "";
    adminRequest<ImportPreview>(`${base}/import/preview${query}`, token)
      .then((data) => {
        if (!ignore) {
          setPreview(data);
          setPreviewError("");
        }
      })
      .catch((err) => {
        if (!ignore) setPreviewError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [base, token, appliedLimit, reloadKey]);

  // ---- ประวัติ job ของจังหวัด (ล่าสุดก่อน) ----
  useEffect(() => {
    let ignore = false;
    adminRequest<{ jobs: ImportJob[] }>(`${base}/imports`, token)
      .then((data) => {
        if (!ignore) setJobs(data.jobs);
      })
      .catch((err) => {
        if (!ignore) setActionError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [base, token, reloadKey]);

  // job ที่กำลังดู: ที่เลือกไว้ ไม่งั้นล่าสุด
  const viewedJob = jobs?.find((j) => j.job_id === selectedJobId) ?? jobs?.[0] ?? null;
  const runningJobId = viewedJob && isActive(viewedJob) ? viewedJob.job_id : null;

  // ---- ความคืบหน้า: poll ระหว่างที่ job ทำงาน · จบแล้วโหลดตัวอย่าง/ประวัติใหม่ ----
  useEffect(() => {
    if (!runningJobId) return;
    const timer = setInterval(() => {
      adminRequest<{ job: ImportJob }>(`/imports/${runningJobId}`, token)
        .then(({ job }) => {
          setJobs((prev) => prev?.map((j) => (j.job_id === job.job_id ? job : j)) ?? prev);
          if (!isActive(job)) setReloadKey((k) => k + 1);
        })
        .catch((err) => setActionError(errorMessage(err)));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [runningJobId, token]);

  const limitValid = limitInput === "" || /^[1-9]\d*$/.test(limitInput);
  const canStart = !!preview && preview.blockers.length === 0 && limitInput === appliedLimit && !busy;

  const startImport = async () => {
    if (!preview) return;
    const { toProcess, googleRequests } = preview;
    const confirmed = window.confirm(
      `เริ่มนำเข้า ${toProcess.toLocaleString()} สถานที่ของ${province}?\n` +
        `จะเรียก Google Find Place ${googleRequests.findPlace.toLocaleString()} ครั้ง ` +
        `และ Place Details ไม่เกิน ${googleRequests.detailsMax.toLocaleString()} ครั้ง (มีค่าใช้จ่าย)`
    );
    if (!confirmed) return;

    setBusy(true);
    setActionError("");
    try {
      const { job } = await adminRequest<{ job: ImportJob }>(`${base}/import`, token, {
        method: "POST",
        body: { limit_rows: appliedLimit ? Number(appliedLimit) : undefined },
      });
      setSelectedJobId(job.job_id);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
      setReloadKey((k) => k + 1);
    }
  };

  const cancelJob = async (jobId: string) => {
    setBusy(true);
    setActionError("");
    try {
      const { job } = await adminRequest<{ job: ImportJob }>(`/imports/${jobId}/cancel`, token, { method: "POST" });
      setJobs((prev) => prev?.map((j) => (j.job_id === job.job_id ? job : j)) ?? prev);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-in flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate(`/admin${base}`)}
        className="inline-flex items-center gap-1 text-sm text-[color:var(--deep)] underline self-start"
      >
        <ArrowLeft size={16} strokeWidth={1.75} /> กลับไปหน้าตรวจข้อมูล
      </button>
      <div>
        <h1 className="font-prompt font-semibold text-2xl sm:text-3xl text-[color:var(--navy)]">นำเข้า{province}</h1>
        <p className="text-[color:var(--deep)] mt-1">
          นำสถานที่ที่ตรวจแล้วเข้าระบบ โดยดึงข้อมูลจาก Google และส่งแถวที่จับคู่ไม่ได้ให้ตรวจภายหลัง
        </p>
      </div>

      {actionError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-[color:var(--danger)]">
          <TriangleAlert size={16} strokeWidth={1.75} /> {actionError}
        </p>
      )}

      {/* 1. ดูตัวอย่าง + 2. เริ่มนำเข้า */}
      <section className={cardClass}>
        <SectionTitle>ดูตัวอย่างก่อนนำเข้า</SectionTitle>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-prompt text-[color:var(--navy)]">จำนวนสถานที่รอบนี้ (เว้นว่าง = ทั้งหมดที่เหลือ)</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="min-h-10 w-40 px-3 rounded-lg border border-[color:var(--line)]"
            />
          </label>
          <button
            type="button"
            disabled={!limitValid || limitInput === appliedLimit}
            onClick={() => setAppliedLimit(limitInput)}
            className={secondaryBtn}
          >
            คำนวณใหม่
          </button>
          {!limitValid && <span className="text-sm text-[color:var(--danger)]">ต้องเป็นจำนวนเต็มตั้งแต่ 1</span>}
        </div>

        {previewError && (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-[color:var(--danger)]">
            <TriangleAlert size={18} strokeWidth={1.75} /> {previewError}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={primaryBtn}>
              ลองใหม่
            </button>
          </div>
        )}

        {!preview && !previewError && (
          <p className="mt-4 flex items-center gap-2 text-[color:var(--navy)]">
            <Loader2 size={18} strokeWidth={1.75} className="animate-spin" /> กำลังเตรียมข้อมูล...
          </p>
        )}

        {preview && (
          <>
            <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat label="สถานที่หลังตรวจข้อมูล" value={preview.importRows} />
              <Stat label="มีผลจากรอบก่อนแล้ว (ข้าม)" value={preview.alreadyDone} />
              <Stat label="จะนำเข้ารอบนี้" value={preview.toProcess} />
              <Stat label="เรียก Google ไม่เกิน (ครั้ง)" value={preview.googleRequests.findPlace + preview.googleRequests.detailsMax} />
            </div>
            {preview.invalidLocation > 0 && (
              <p className="mt-2 text-sm text-[color:var(--deep)]">
                พิกัดใน CSV ใช้ไม่ได้ {preview.invalidLocation} แถว — จะบันทึกเป็นผิดพลาดโดยไม่เรียก Google
              </p>
            )}

            {preview.blockers.length > 0 && (
              <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-[color:var(--danger)]">
                <p className="font-prompt font-medium">ยังเริ่มนำเข้าไม่ได้</p>
                <ul className="list-disc pl-5 mt-1">
                  {preview.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                {preview.pendingDecisions > 0 && (
                  <button type="button" onClick={() => navigate(`/admin${base}`)} className="mt-2 underline">
                    ไปตรวจข้อมูลให้ครบ
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" disabled={!canStart} onClick={startImport} className={primaryBtn}>
                <CloudDownload size={18} strokeWidth={1.75} /> เริ่มนำเข้า {preview.toProcess.toLocaleString()} สถานที่
              </button>
              {limitInput !== appliedLimit && limitValid && (
                <span className="text-sm text-[color:var(--muted)]">กด "คำนวณใหม่" ก่อนเริ่ม</span>
              )}
            </div>
          </>
        )}
      </section>

      {/* ตัดสินแถวที่รอตรวจ (ทุก job ของจังหวัด) */}
      <section className={cardClass}>
        <SectionTitle>รอตรวจหลังนำเข้า</SectionTitle>
        <PendingReview base={base} token={token} reloadKey={reloadKey} onResolved={() => setResolveCount((c) => c + 1)} />
      </section>

      {/* 3. ความคืบหน้า + 4. ผล */}
      {viewedJob && (
        <section className={cardClass}>
          <SectionTitle>{isActive(viewedJob) ? "กำลังนำเข้า" : "ผลการนำเข้า"}</SectionTitle>
          <p className="text-sm text-[color:var(--deep)]">
            เริ่ม {formatDateTime(viewedJob.created_at)} · {JOB_STATUS_LABELS[viewedJob.status]}
            {viewedJob.cancel_requested && isActive(viewedJob) ? " (กำลังยกเลิก...)" : ""}
          </p>
          {viewedJob.error && <p className="text-sm text-[color:var(--danger)] mt-1">{viewedJob.error}</p>}

          <div className="mt-3 h-3 rounded-full bg-[color:var(--sky-soft)] overflow-hidden">
            <div
              className="h-full bg-[color:var(--navy)] transition-all"
              style={{ width: `${viewedJob.total > 0 ? (viewedJob.processed / viewedJob.total) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-3 grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label={`ทำแล้ว / ${viewedJob.total.toLocaleString()}`} value={viewedJob.processed} />
            <Stat label="นำเข้าแล้ว" value={viewedJob.imported} />
            <Stat label="รอตรวจ" value={viewedJob.needs_review} />
            <Stat label="ผิดพลาด" value={viewedJob.failed} />
          </div>

          {isActive(viewedJob) && !viewedJob.cancel_requested && (
            <button type="button" disabled={busy} onClick={() => cancelJob(viewedJob.job_id)} className={`${secondaryBtn} mt-3`}>
              <X size={18} strokeWidth={1.75} /> ยกเลิก (หยุดก่อนสถานที่ถัดไป)
            </button>
          )}

          <div className="mt-4">
            <ImportItemsTable
              jobId={viewedJob.job_id}
              token={token}
              refreshKey={`${viewedJob.processed}-${resolveCount}`}
            />
          </div>
        </section>
      )}

      {/* ประวัติ */}
      {jobs && jobs.length > 1 && (
        <section className={cardClass}>
          <SectionTitle>ประวัติการนำเข้า</SectionTitle>
          <ul className="flex flex-col gap-2">
            {jobs.map((job) => (
              <li key={job.job_id}>
                <button
                  type="button"
                  onClick={() => setSelectedJobId(job.job_id)}
                  aria-pressed={job.job_id === viewedJob?.job_id}
                  className={`w-full text-left text-sm rounded-xl px-3 py-2 border transition-colors ${
                    job.job_id === viewedJob?.job_id
                      ? "border-[color:var(--navy)] bg-[color:var(--sky-soft)]"
                      : "border-[color:var(--line)] hover:bg-[color:var(--sky-soft)]"
                  }`}
                >
                  {formatDateTime(job.created_at)} · {JOB_STATUS_LABELS[job.status]} · {job.total.toLocaleString()} สถานที่ ·
                  นำเข้า {job.imported} · รอตรวจ {job.needs_review} · ผิดพลาด {job.failed}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
