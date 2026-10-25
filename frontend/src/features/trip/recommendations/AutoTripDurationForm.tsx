
import { useEffect, useState } from "react";
import type { AutoTripResponse } from "../e-tinerary/auto/autoTripTypes";

interface AutoTripCategory {
  categoryId: string;
  categoryName: string;
}

interface AutoTripDurationFormProps {
  tripId: string;
  accessToken: string;
  onGenerated: (result: AutoTripResponse) => void;
}

const VISIT_DURATION_OPTIONS = [30, 60, 90, 120, 150, 180];

function getMessage(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return undefined;
}

function isAutoTripCategory(value: unknown): value is AutoTripCategory {
  if (typeof value !== "object" || value === null) return false;

  return (
    "categoryId" in value &&
    typeof value.categoryId === "string" &&
    "categoryName" in value &&
    typeof value.categoryName === "string"
  );
}

function isAutoTripResponse(value: unknown): value is AutoTripResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "trip_id" in value &&
    typeof value.trip_id === "string" &&
    "days" in value &&
    Array.isArray(value.days)
  );
}

export default function AutoTripDurationForm({
  tripId,
  accessToken,
  onGenerated,
}: AutoTripDurationFormProps) {
  const [categories, setCategories] = useState<AutoTripCategory[]>([]);
  const [durations, setDurations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/itinerary/trips/${encodeURIComponent(tripId)}/auto/categories`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal: controller.signal,
          }
        );

        let payload: unknown;

        try {
          payload = await response.json();
        } catch {
          throw new Error(
            `API ไม่ได้ส่ง JSON กลับมา (status ${response.status})`
          );
        }

        if (!response.ok) {
          throw new Error(
            getMessage(payload) ?? "ไม่สามารถโหลดประเภทสถานที่ได้"
          );
        }

        if (
          typeof payload !== "object" ||
          payload === null ||
          !("categories" in payload) ||
          !Array.isArray(payload.categories) ||
          !payload.categories.every(isAutoTripCategory)
        ) {
          throw new Error(
            "รูปแบบข้อมูลประเภทสถานที่ไม่ถูกต้อง กรุณาตรวจสอบ API auto/categories"
          );
        }

        setCategories(payload.categories);
        setDurations({});
        if (payload.categories.length === 0) {
          setError("ทริปนี้ยังไม่มีประเภทสถานที่ที่เลือก");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "เกิดข้อผิดพลาดในการโหลดสถานที่"
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, [tripId, accessToken, loadAttempt]);

  function updateDuration(categoryId: string, value: string) {
    setDurations((previous) => ({
      ...previous,
      [categoryId]: value,
    }));
  }

  async function handleGenerate() {
    setError("");

    if (categories.length === 0) {
      setError("ทริปนี้ยังไม่มีประเภทสถานที่ที่เลือก");
      return;
    }

    const invalidCategory = categories.find((category) => {
      const value = durations[category.categoryId];
      const minutes = Number(value);

      return (
        value === undefined ||
        value.trim() === "" ||
        !VISIT_DURATION_OPTIONS.includes(minutes)
      );
    });

    if (invalidCategory) {
      setError(
        `กรุณาเลือกเวลาเที่ยวของ "${invalidCategory.categoryName}" จากตัวเลือกที่กำหนด`
      );
      return;
    }

    const visitDurationByCategory: Record<string, number> = {};

    for (const category of categories) {
      visitDurationByCategory[category.categoryId] = Number(
        durations[category.categoryId]
      );
    }

    setGenerating(true);

    try {
      const response = await fetch(
        `/api/itinerary/trips/${encodeURIComponent(tripId)}/auto`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ visitDurationByCategory }),
        }
      );

      let payload: unknown;

      try {
        payload = await response.json();
      } catch {
        throw new Error(
          `API ไม่ได้ส่ง JSON กลับมา (status ${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          getMessage(payload) ?? "ไม่สามารถจัดทริปอัตโนมัติได้"
        );
      }

      if (!isAutoTripResponse(payload)) {
        throw new Error("รูปแบบผลการจัดทริปไม่ถูกต้อง");
      }

      onGenerated(payload);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "เกิดข้อผิดพลาดในการจัดทริป"
      );
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <p role="status">กำลังโหลดสถานที่...</p>;
  }

  return (
    <section className="w-full space-y-4 text-left">
      <h2 className="font-prompt font-semibold text-lg text-[color:var(--navy)]">
        กำหนดเวลาเที่ยวแต่ละประเภท
      </h2>

      <p className="text-sm text-[color:var(--muted)]">
        กำหนดเวลาเที่ยวต่อสถานที่ในแต่ละประเภท โดยไม่รวมเวลาเดินทาง สถานที่แต่ละแห่งที่จัดได้จะใช้เวลาตามที่เลือก
      </p>

      {categories.length > 0 && (
        <div className="grid grid-cols-1 gap-3 max-h-[55vh] overflow-y-auto pr-1">
          {categories.map((category) => (
            <div
              key={category.categoryId}
              className="flex flex-col gap-1.5 rounded-xl border border-[color:var(--line)] p-3"
            >
              <label
                htmlFor={`duration-${category.categoryId}`}
                className="text-sm font-medium text-[color:var(--navy)]"
              >
                {category.categoryName}
              </label>

              <select
                id={`duration-${category.categoryId}`}
                required
                value={durations[category.categoryId] ?? ""}
                onChange={(event) =>
                  updateDuration(category.categoryId, event.target.value)
                }
                className="min-h-11 rounded-lg border border-[color:var(--line)] bg-white px-3 text-[color:var(--navy)] outline-none focus:border-[color:var(--sky)]"
                aria-label={`เวลาเที่ยวประเภท${category.categoryName} (นาที)`}
              >
                <option value="" disabled>
                  เลือกระยะเวลาเที่ยว
                </option>
                {VISIT_DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} นาที
                  </option>
                ))}
              </select>
              <p className="text-xs text-[color:var(--muted)]">
                เวลาเที่ยว 30, 60, 90, 120, 150 หรือ 180 นาที (ไม่รวมเวลาเดินทาง)
              </p>
            </div>
          ))}
        </div>
      )}

      {categories.length === 0 && !error && (
        <p className="text-sm text-[color:var(--muted)]">
          ทริปนี้ยังไม่มีประเภทสถานที่ที่เลือก
        </p>
      )}

      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-[color:var(--danger)]">
            {error}
          </p>
          {categories.length === 0 && (
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="min-h-10 rounded-lg border border-[color:var(--sky)] px-3 text-sm font-medium text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)]"
            >
              ลองโหลดอีกครั้ง
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || categories.length === 0}
        className="min-h-11 w-full rounded-xl bg-[color:var(--navy)] px-5 font-medium text-white transition-colors hover:bg-[color:var(--navy-dark)] disabled:pointer-events-none disabled:opacity-60"
      >
        {generating ? "กำลังจัดทริป..." : "จัดทริปอัตโนมัติ"}
      </button>
    </section>
  );
}
