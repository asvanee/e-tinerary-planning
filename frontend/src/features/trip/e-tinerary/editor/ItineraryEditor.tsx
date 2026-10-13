import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, ArrowUpDown, Car, Check, ChevronDown, ChevronUp, CircleCheck, Clock, GripVertical,
  Info, Loader2, MapPin, TriangleAlert, Wallet, X,
} from "lucide-react";
import Navbar from "../../../../components/navbar";
import { useAuth } from "../../../auth/hooks/useAuth";
import RouteMap from "../components/RouteMap";
import {
  buildDayItems,
  type DayAssignment,
  type ItineraryItemResult,
  type PlaceInput,
  type PriceNature,
  type TravelMatrix,
} from "../lib/itineraryBuilder";

// ---------- Types ----------

interface PlaceInfo {
  place_id: string;
  place_name: string;
  province: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  rating: number | null;
  // ✅ v2 (sync กับ placesController.ts): เลิก coalesce กับ categories.default_price_level แล้ว —
  // ราคาจริงจาก Google ตรงๆ null ได้จริง (เดิม comment นี้บอกว่า coalesce เสร็จจาก backend เสมอ
  // ซึ่งไม่ตรงกับ backend เวอร์ชันปัจจุบันแล้ว)
  price_level: number | null;
  // ✅ ใหม่ — แทน has_price_level เดิม backend ส่งมาให้ตัดสิน cost แทนการเดา (ดู
  // itineraryBuilder.ts::getPlaceCost) — null ได้เผื่อ category ไม่ครบ (ไม่ควรเกิดจริง)
  price_nature: PriceNature | null;
  formatted_address: string | null;
  phone_number?: string | null;
  website?: string | null;
  opening_hours?: any;
  user_ratings_total?: number | null;
  att_type_label?: string | null;
  att_category_label?: string | null;
  default_duration_min: number;
}

interface MergedPlace {
  placeId: string;
  place?: PlaceInfo;
  poiScore?: number;
}

interface DraftTripDay {
  tripDayId: number;
  dayNumber: number;
  visitDate: string;
  startTime: string | null;
  endTime: string | null;
  dailyBudget: number | null;
  // ✅ เพิ่มใหม่ — ต้องส่งต่อเข้า DayAssignment ตอน recompute client-side ให้ isBudgetConflict
  // ตรงกับที่ backend คำนวณ (ดู itineraryBuilder.ts::buildDayItems)
  useBudget: boolean;
}

interface DraftResponse {
  message: string;
  tripStartLat: number;
  tripStartLng: number;
  tripDays: DraftTripDay[];
  items: ItineraryItemResult[];
  // ✅ ระยะทาง/เวลาเดินทางตามถนน (ORS + fallback รายคู่) จาก backend — buildDayItems lookup จากนี้ตอนลาก
  // ไม่ยิง ORS เอง (มี key __trip_start__ สำหรับ leg แรกของ Day 1)
  travelMatrix: TravelMatrix;
}

interface LocationState {
  tripId: string;
  draft: DraftResponse;
  places: MergedPlace[];
}

const UNASSIGNED_KEY = "unassigned";

// ref คงที่ กัน useMemo recompute โดยไม่จำเป็นเมื่อ draft ไม่มี matrix (เช่น router state เก่า)
const EMPTY_TRAVEL_MATRIX: TravelMatrix = {};

function dayKey(tripDayId: number) {
  return `day-${tripDayId}`;
}

function formatTime(time: string | null): string {
  if (!time) return "—";
  return time.slice(0, 5) + " น.";
}

function formatVisitDate(visitDate: string): string {
  const date = new Date(visitDate + "T00:00:00");
  return date.toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatBaht(amount: number): string {
  return amount.toLocaleString("th-TH") + " ฿";
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "—";
  return `${start ? start.slice(0, 5) : "—"} - ${end ? end.slice(0, 5) : "—"} น.`;
}

function formatTravelTime(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 1) return "น้อยกว่า 1 นาที";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} ม.` : `${km.toFixed(1)} กม.`;
}

const cardClass =
  "bg-white rounded-2xl border border-[color:var(--line)] [box-shadow:var(--shadow)]";

const primaryBtn =
  "font-prompt font-medium min-h-12 px-6 flex items-center justify-center gap-2 rounded-xl text-white bg-[color:var(--navy)] hover:bg-[color:var(--navy-dark)] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none transition-all duration-200 whitespace-nowrap";

// ---------- แยกเหตุผลที่ "ไม่อยู่ในเวลาเปิด" ----------
// ใช้ periods ชุดเดียวกับ isPlaceOpenAt() (ดู openingHoursChecker.ts) แต่บอกเหตุผลละเอียดขึ้น:
// ปิดทั้งวัน / ยังไม่เปิด / ปิดแล้ว / ปิดก่อนจบเวลาที่อยู่ — คำนวณเพื่อแสดงผลเท่านั้น ไม่กระทบ flag เดิม

const DAY_NAMES_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

function hhmmToMin(t: string): number {
  return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2, 4), 10);
}

function fmtMin(m: number): string {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

// ช่วงเวลาเปิดที่ทับวัน day (หน่วยนาทีนับจากเที่ยงคืนของวันนั้น) รวมช่วงข้ามเที่ยงคืนจากเมื่อวาน
function openIntervalsForDay(oh: any, day: number): { start: number; end: number }[] | "24h" | null {
  const periods = oh?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;
  if (periods.length === 1 && !periods[0]?.close) return "24h";

  const out: { start: number; end: number }[] = [];
  for (const p of periods) {
    if (!p?.close || !p?.open) continue;
    const openMin = hhmmToMin(p.open.time);
    let span = ((p.close.day - p.open.day + 7) % 7) * 1440 + hhmmToMin(p.close.time) - openMin;
    if (span <= 0) span += 7 * 1440;
    for (const off of [0, 1]) {
      if ((p.open.day + off) % 7 !== day) continue;
      const start = openMin - off * 1440;
      if (start + span > 0) out.push({ start, end: start + span });
    }
  }
  return out;
}

function describeClosure(
  oh: any,
  dayOfWeek: number,
  startTime: string | null,
  endTime: string | null
): { label: string; detail: string } | null {
  if (!startTime || !endTime) return null;
  const a = parseInt(startTime.slice(0, 2), 10) * 60 + parseInt(startTime.slice(3, 5), 10);
  const d = parseInt(endTime.slice(0, 2), 10) * 60 + parseInt(endTime.slice(3, 5), 10);

  const ivs = openIntervalsForDay(oh, dayOfWeek);
  if (ivs === null || ivs === "24h") return null;

  if (ivs.length === 0) {
    return {
      label: "ปิดทั้งวัน",
      detail: `วัน${DAY_NAMES_TH[dayOfWeek]}สถานที่นี้ปิดทำการ`,
    };
  }
  if (ivs.some((iv) => iv.start <= a && d <= iv.end)) return null; // เปิดครอบคลุมจริง

  const inside = ivs.find((iv) => iv.start <= a && a < iv.end);
  if (inside) {
    return {
      label: "ปิดก่อนจบเวลาที่อยู่",
      detail: `อยู่ถึง ${fmtMin(d)} น. แต่ปิดเวลา ${fmtMin(inside.end)} น.`,
    };
  }
  const upcoming = ivs.filter((iv) => iv.start > a).sort((x, y) => x.start - y.start)[0];
  if (upcoming) {
    return {
      label: "ยังไม่เปิด",
      detail: `ไปถึง ${fmtMin(a)} น. แต่เปิด ${fmtMin(upcoming.start)} น.`,
    };
  }
  const lastEnd = Math.max(...ivs.map((iv) => iv.end));
  return {
    label: "ปิดแล้ว",
    detail: `ไปถึง ${fmtMin(a)} น. แต่ปิดเวลา ${fmtMin(lastEnd)} น.`,
  };
}

// ---------- Conflict badges ----------
// ปัญหาที่ต้องระวัง (ปิด/เวลาไม่พอ/งบเกิน) ใช้สีแดง ส่วน "ไม่ทราบข้อมูล" ใช้สีกลาง

function ConflictBadges({
  item,
  closedLabel,
}: {
  item: ItineraryItemResult;
  closedLabel?: string;
}) {
  const badges: { label: string; warn: boolean }[] = [];

  if (item.isClosedConflict) badges.push({ label: closedLabel ?? "ไม่อยู่ในเวลาเปิด", warn: true });
  if (item.isTimeConflict) badges.push({ label: "เวลาไม่พอ", warn: true });
  if (item.isBudgetConflict) badges.push({ label: "งบเกิน", warn: true });
  if (item.isHoursUnknown) badges.push({ label: "ไม่ทราบเวลาเปิด-ปิด", warn: false });
  // "ไม่ทราบราคา" ≠ "เกินงบ" — แยกให้ผู้ใช้เห็นความต่าง
  if (item.isCostUnknown) badges.push({ label: "ไม่ทราบราคา", warn: false });

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-white ${
            b.warn
              ? "text-[color:var(--danger)] border-[color:var(--danger)]"
              : "text-[color:var(--muted)] border-[color:var(--line)]"
          }`}
        >
          {b.warn ? (
            <TriangleAlert size={12} strokeWidth={1.75} />
          ) : (
            <Info size={12} strokeWidth={1.75} />
          )}
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ---------- Sortable card ----------
// ลากได้ที่ไอคอนจับด้านซ้ายเท่านั้น (ส่วนอื่นของการ์ดเลื่อนหน้าจอบนมือถือได้ตามปกติ)
// เดสก์ท็อป (lg ขึ้นไป): ลากอย่างเดียว (รองรับคีย์บอร์ดที่ไอคอนจับ)
// จอเล็ก/มือถือ: มีปุ่มจัดลำดับ/ย้ายวัน/เอาออก ซ่อนอยู่หลังปุ่มลูกศรสลับ (กดเพื่อเปิด/ปิด)

function PlaceCard({
  placeId,
  placeInfo,
  item,
  isFirst,
  dayOfWeek,
  currentKey,
  moveOptions,
  canUp,
  canDown,
  onShift,
  onMoveTo,
  onRemove,
}: {
  placeId: string;
  placeInfo?: PlaceInfo;
  item?: ItineraryItemResult;
  isFirst?: boolean;
  dayOfWeek?: number; // 0 = อาทิตย์ ... 6 = เสาร์ ใช้แสดงเวลาเปิดของวันนั้นตอนติด conflict
  currentKey: string;
  moveOptions: { key: string; label: string }[];
  canUp?: boolean;
  canDown?: boolean;
  onShift?: (delta: -1 | 1) => void;
  onMoveTo: (toKey: string) => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: placeId });

  // การ์ดในคลัง (ยังไม่จัดวัน) เปิดแผงไว้เลย เพราะการกระทำหลักคือ "เพิ่มลงวัน"
  const [showActions, setShowActions] = useState(currentKey === UNASSIGNED_KEY);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const name = placeInfo?.place_name ?? "ไม่พบชื่อสถานที่";
  const hasProblem =
    !!item && (item.isClosedConflict || item.isTimeConflict || item.isBudgetConflict);
  const closure =
    item?.isClosedConflict && dayOfWeek !== undefined
      ? describeClosure(placeInfo?.opening_hours, dayOfWeek, item.startTime, item.endTime)
      : null;

  const iconBtn =
    "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--navy)] hover:bg-[color:var(--sky-soft)] disabled:opacity-30 disabled:pointer-events-none transition-colors duration-200";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border p-2.5 ${
        hasProblem ? "border-[color:var(--danger)]" : "border-[color:var(--line)]"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`ลากเพื่อจัดลำดับหรือย้ายวัน: ${name}`}
          className={`${iconBtn} -ml-1 touch-none cursor-grab active:cursor-grabbing`}
        >
          <GripVertical size={18} strokeWidth={1.75} />
        </button>

        {item && (
          <span className="shrink-0 mt-1 w-7 h-7 rounded-full bg-[color:var(--navy)] text-white font-prompt font-semibold text-sm flex items-center justify-center">
            {item.visitOrder}
          </span>
        )}

        <div className="flex-1 min-w-0 pt-0.5">
          <h4 className="font-prompt font-medium text-[color:var(--navy)] leading-snug">
            {name}
          </h4>
          <p className="flex items-center gap-1 text-xs text-[color:var(--muted)] mt-0.5">
            <MapPin size={12} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">
              {placeInfo?.district ? `${placeInfo.district}, ` : ""}
              {placeInfo?.province ?? ""}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowActions((v) => !v)}
          aria-expanded={showActions}
          aria-label={`จัดลำดับหรือย้ายวัน: ${name}`}
          title="จัดลำดับ / ย้ายวัน"
          className={`${iconBtn} lg:hidden ${showActions ? "bg-[color:var(--sky-soft)] text-[color:var(--navy)]" : ""}`}
        >
          <ArrowUpDown size={18} strokeWidth={1.75} />
        </button>
      </div>

      {item && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-[color:var(--deep)]">
          <span className="flex items-center gap-1 font-prompt font-medium">
            <Clock size={13} strokeWidth={1.75} className="shrink-0" />
            {formatTimeRange(item.startTime, item.endTime)}
          </span>

          {item.travelTimeFromPrev !== null && (
            <span
              title={isFirst ? "เดินทางจากจุดเริ่มต้น" : "เดินทางจากสถานที่ก่อนหน้า"}
              className="flex items-center gap-1 text-[color:var(--muted)]"
            >
              <Car size={13} strokeWidth={1.75} className="shrink-0 text-[color:var(--sky)]" />
              {isFirst && "จากจุดเริ่มต้น "}
              {formatTravelTime(item.travelTimeFromPrev)}
              {item.distanceFromPrev !== null && ` · ${formatDistance(item.distanceFromPrev)}`}
            </span>
          )}

          {/* ✅ v2: placeCost เป็น number | null — ไม่ทราบราคาแน่ชัดต้องบอกตรงๆ ไม่ใช่ "0 ฿" */}
          <span className="flex items-center gap-1">
            <Wallet size={13} strokeWidth={1.75} className="shrink-0" />
            {item.isCostUnknown ? (
              <span className="text-[color:var(--muted)]">ไม่ทราบราคาแน่ชัด</span>
            ) : (
              formatBaht(item.placeCost as number)
            )}
          </span>
        </div>
      )}

      {item && <ConflictBadges item={item} closedLabel={closure?.label} />}

      {item?.isClosedConflict && (
        <p className="mt-2 text-xs text-[color:var(--danger)]">
          {closure
            ? closure.detail
            : `แผน ${formatTimeRange(item.startTime, item.endTime)} อยู่นอกเวลาเปิดของสถานที่`}
        </p>
      )}

      {showActions && (
        <div className="lg:hidden mt-2 pt-2 border-t border-[color:var(--line)] flex flex-wrap items-center gap-1.5">
          {onShift && (
            <>
              <button
                type="button"
                onClick={() => onShift(-1)}
                disabled={!canUp}
                aria-label={`เลื่อน ${name} ขึ้น`}
                className={iconBtn}
              >
                <ChevronUp size={18} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => onShift(1)}
                disabled={!canDown}
                aria-label={`เลื่อน ${name} ลง`}
                className={iconBtn}
              >
                <ChevronDown size={18} strokeWidth={1.75} />
              </button>
            </>
          )}

          <div className="relative">
            <select
              aria-label={`ย้าย ${name} ไปวัน`}
              value=""
              onChange={(e) => {
                if (e.target.value) onMoveTo(e.target.value);
              }}
              className="appearance-none min-h-9 pl-3 pr-8 rounded-lg border border-[color:var(--line)] bg-white text-sm text-[color:var(--navy)] focus:outline-none focus:border-[color:var(--navy)] focus:ring-4 focus:ring-[color:var(--line)] transition-all duration-200"
            >
              <option value="">{currentKey === UNASSIGNED_KEY ? "เพิ่มลงวัน" : "ย้ายไป"}</option>
              {moveOptions
                .filter((o) => o.key !== currentKey)
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--deep)]"
            />
          </div>

          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`เอา ${name} ออกจากวันนี้`}
              className="ml-auto min-h-9 px-2.5 rounded-lg flex items-center gap-1 text-sm text-[color:var(--muted)] hover:text-[color:var(--danger)] hover:bg-[color:var(--sky-soft)] transition-colors duration-200"
            >
              <X size={16} strokeWidth={1.75} />
              เอาออก
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Droppable column wrapper ----------

function DroppableColumn({
  id,
  grid,
  children,
}: {
  id: string;
  grid?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`${
        grid ? "grid grid-cols-1 sm:grid-cols-2 items-start" : "flex flex-col"
      } gap-2 min-h-[40px] rounded-xl transition-colors duration-200 ${
        isOver ? "bg-[color:var(--sky-soft)] ring-2 ring-[color:var(--sky)]" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ---------- Main page ----------

export default function ItineraryEditor() {
  const { tripId: tripIdParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();

  const state = location.state as LocationState | null;

  const [containers, setContainers] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const tripId = state?.tripId ?? tripIdParam ?? "";
  const tripDaysMeta: DraftTripDay[] = state?.draft?.tripDays ?? [];
  const places: MergedPlace[] = state?.places ?? [];
  const travelMatrix: TravelMatrix = state?.draft?.travelMatrix ?? EMPTY_TRAVEL_MATRIX;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ---- init containers จาก draft (ครั้งเดียวตอน mount) ----
  useEffect(() => {
    if (!state?.draft) return;

    const itemsByDay = new Map<number, ItineraryItemResult[]>();
    for (const item of state.draft.items) {
      const list = itemsByDay.get(item.tripDayId) ?? [];
      list.push(item);
      itemsByDay.set(item.tripDayId, list);
    }

    const initial: Record<string, string[]> = { [UNASSIGNED_KEY]: [] };
    const placedIds = new Set<string>();

    for (const day of state.draft.tripDays) {
      const items = (itemsByDay.get(day.tripDayId) ?? []).sort(
        (a, b) => a.visitOrder - b.visitOrder
      );
      initial[dayKey(day.tripDayId)] = items.map((i) => {
        placedIds.add(i.placeId);
        return i.placeId;
      });
    }

    // สถานที่ที่เลือกมาแต่ไม่ปรากฏในแผนเลย (ไม่ควรเกิด แต่กันไว้) -> ใส่ใน unassigned
    initial[UNASSIGNED_KEY] = state.places
      .map((p) => p.placeId)
      .filter((id) => !placedIds.has(id));

    setContainers(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      navigate("/login");
      return;
    }
    if (!state?.draft || !state?.places) {
      // ไม่มี draft มาด้วย (เช่น refresh หน้านี้ตรงๆ แล้ว router state หาย) — ย้อนกลับไปเลือกใหม่
      navigate(`/trip/${tripIdParam ?? ""}/recommendations`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  const placesById = useMemo(() => {
    const map = new Map<string, PlaceInput>();
    for (const p of places) {
      if (!p.place) continue;
      map.set(p.placeId, {
        placeId: p.placeId,
        latitude: p.place.latitude,
        longitude: p.place.longitude,
        // ✅ v2 (sync กับ itineraryBuilder.ts frontend port + placesController.ts): เลิกส่ง
        // priceLevel/hasPriceLevel (contract เก่า) — ส่ง rawPriceLevel ดิบๆ ไม่เดา ให้
        // getPlaceCost() ในนั้นเป็นคนตัดสินใจแปลงเป็นบาทเอง
        rawPriceLevel: p.place.price_level,
        // priceNature ไม่ควรเป็น null จริงในทางปฏิบัติ (categories!inner บังคับมีเสมอฝั่ง backend)
        // แต่ fallback เป็น "paid" กันไว้เผื่อข้อมูลผิดปกติ — เลือกฝั่งนี้เพราะ
        // "ไม่รู้ว่าฟรีไหม" ควรถือว่าไม่ฟรีไว้ก่อน (ปลอดภัยกับ isBudgetConflict มากกว่าเดาว่าฟรี)
        priceNature: p.place.price_nature ?? "paid",
        openingHours: p.place.opening_hours ?? null,
        defaultDurationMin: p.place.default_duration_min,
      });
    }
    return map;
  }, [places]);

  const placesInfoById = useMemo(() => {
    const map = new Map<string, PlaceInfo>();
    for (const p of places) {
      if (p.place) map.set(p.placeId, p.place);
    }
    return map;
  }, [places]);

  // ---- recompute ทุกวันทุกครั้งที่ containers เปลี่ยน (client-side, ไม่รอ network) ----
  const computedByDay = useMemo(() => {
    const result: Record<string, ItineraryItemResult[]> = {};
    for (const day of tripDaysMeta) {
      const key = dayKey(day.tripDayId);
      const assignment: DayAssignment = {
        tripDayId: day.tripDayId,
        dayNumber: day.dayNumber,
        visitDate: day.visitDate,
        startTime: day.startTime,
        endTime: day.endTime,
        dailyBudget: day.dailyBudget,
        useBudget: day.useBudget,
        orderedPlaceIds: containers[key] ?? [],
      };
      result[key] = buildDayItems(assignment, placesById, travelMatrix);
    }
    return result;
  }, [containers, tripDaysMeta, placesById, travelMatrix]);

  const itemByPlaceId = useMemo(() => {
    const map = new Map<string, ItineraryItemResult>();
    for (const key of Object.keys(computedByDay)) {
      for (const item of computedByDay[key]) {
        map.set(item.placeId, item);
      }
    }
    return map;
  }, [computedByDay]);

  // ---- ข้อมูลสำหรับ RouteMap: รวม lat/lng + ชื่อสถานที่เข้ากับผลคำนวณแล้ว (visitOrder) ----
  const mapDays = useMemo(() => {
    return tripDaysMeta.map((day) => {
      const key = dayKey(day.tripDayId);
      const items = (computedByDay[key] ?? []).flatMap((item) => {
        const info = placesInfoById.get(item.placeId);
        if (!info) return [];
        return [
          {
            placeId: item.placeId,
            lat: info.latitude,
            lng: info.longitude,
            placeName: info.place_name,
            visitOrder: item.visitOrder,
          },
        ];
      });
      return { tripDayId: day.tripDayId, dayNumber: day.dayNumber, items };
    });
  }, [tripDaysMeta, computedByDay, placesInfoById]);

  function findContainerKey(placeId: string): string | undefined {
    return Object.keys(containers).find((key) =>
      containers[key].includes(placeId)
    );
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const sourceKey = findContainerKey(activeId);
    if (!sourceKey) return;

    const destKey = containers[overId] ? overId : findContainerKey(overId);
    if (!destKey) return;

    setContainers((prev) => {
      const sourceItems = [...prev[sourceKey]];
      const sourceIndex = sourceItems.indexOf(activeId);
      if (sourceIndex === -1) return prev;

      if (sourceKey === destKey) {
        let destIndex = sourceItems.indexOf(overId);
        if (destIndex === -1) destIndex = sourceItems.length - 1;
        sourceItems.splice(sourceIndex, 1);
        sourceItems.splice(destIndex, 0, activeId);
        return { ...prev, [sourceKey]: sourceItems };
      }

      const destItems = [...prev[destKey]];
      sourceItems.splice(sourceIndex, 1);
      let destIndex = destItems.indexOf(overId);
      if (destIndex === -1) destIndex = destItems.length;
      destItems.splice(destIndex, 0, activeId);

      return { ...prev, [sourceKey]: sourceItems, [destKey]: destItems };
    });
  }

  function handleRemoveFromDay(placeId: string, fromKey: string) {
    if (fromKey === UNASSIGNED_KEY) return;
    setContainers((prev) => {
      const next = { ...prev };
      next[fromKey] = prev[fromKey].filter((id) => id !== placeId);
      next[UNASSIGNED_KEY] = [...prev[UNASSIGNED_KEY], placeId];
      return next;
    });
  }

  // ย้ายสถานที่ไปอีกวัน/คลัง โดยไม่ต้องลาก (ต่อท้ายลิสต์ปลายทาง) — state shape เดิม ไม่กระทบ payload
  function movePlace(placeId: string, toKey: string) {
    setContainers((prev) => {
      const fromKey = Object.keys(prev).find((k) => prev[k].includes(placeId));
      if (!fromKey || fromKey === toKey || !prev[toKey]) return prev;
      return {
        ...prev,
        [fromKey]: prev[fromKey].filter((id) => id !== placeId),
        [toKey]: [...prev[toKey], placeId],
      };
    });
  }

  // สลับลำดับขึ้น/ลงภายในวันเดียวกัน
  function shiftPlace(placeId: string, key: string, delta: -1 | 1) {
    setContainers((prev) => {
      const list = [...(prev[key] ?? [])];
      const i = list.indexOf(placeId);
      const j = i + delta;
      if (i === -1 || j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...prev, [key]: list };
    });
  }

  async function handleConfirm() {
    if (!session || !tripId) return;

    // กันซ้ำกับปุ่มที่ disable ไว้ — ห้ามบันทึกแผนที่ยังมีจุดขัดแย้ง (ปิด / เวลาไม่พอ / งบเกิน)
    const hasConflict = Object.values(computedByDay)
      .flat()
      .some((i) => i.isClosedConflict || i.isTimeConflict || i.isBudgetConflict);
    if (hasConflict) return;

    setSaving(true);
    setSaveError(null);

    try {
      const days = tripDaysMeta.map((day) => ({
        trip_day_id: day.tripDayId,
        place_ids: containers[dayKey(day.tripDayId)] ?? [],
      }));

      const res = await fetch(`/api/itinerary/trips/${tripId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ days }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "บันทึกแผนเดินทางไม่สำเร็จ");
      }

      navigate(`/trip/${tripId}/detail`);
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || "เกิดข้อผิดพลาดในการบันทึกแผนเดินทาง");
    } finally {
      setSaving(false);
    }
  }

  if (!state?.draft || !state?.places) {
    return (
      <div className="font-sarabun min-h-screen bg-[color:var(--cream)] flex items-center justify-center gap-3 text-[color:var(--muted)]">
        <Loader2 size={20} strokeWidth={1.75} className="animate-spin text-[color:var(--sky)]" />
        กำลังตรวจสอบข้อมูล...
      </div>
    );
  }

  const activePlaceInfo = activeId ? placesInfoById.get(activeId) : undefined;
  const activeItem = activeId ? itemByPlaceId.get(activeId) : undefined;

  const unassignedIds = containers[UNASSIGNED_KEY] ?? [];

  const moveOptions = [
    ...tripDaysMeta.map((d) => ({ key: dayKey(d.tripDayId), label: `วันที่ ${d.dayNumber}` })),
    { key: UNASSIGNED_KEY, label: "ยังไม่จัดลงวัน" },
  ];

  const placedCount = tripDaysMeta.reduce(
    (n, d) => n + (containers[dayKey(d.tripDayId)]?.length ?? 0),
    0
  );
  const isProblem = (i: ItineraryItemResult) =>
    i.isClosedConflict || i.isTimeConflict || i.isBudgetConflict;
  const conflictCount = Object.values(computedByDay).flat().filter(isProblem).length;

  return (
    <div className="font-sarabun min-h-screen bg-[color:var(--cream)] pb-44">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-4">
        <div className="fade-in mb-4 flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="กลับ"
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[color:var(--navy)] bg-white border border-[color:var(--line)] hover:bg-[color:var(--sky-soft)] active:scale-[0.95] transition-all duration-200"
          >
            <ArrowLeft size={20} strokeWidth={1.75} />
          </button>
          <div>
            <h1 className="font-prompt font-semibold text-2xl text-[color:var(--navy)] leading-tight">
              จัดเรียงแผนการเดินทาง
            </h1>
            <p className="text-xs sm:text-sm text-[color:var(--muted)] mt-1">
              <span className="hidden lg:inline">
                ลากที่ไอคอน <GripVertical size={14} strokeWidth={1.75} className="inline -mt-0.5" /> เพื่อสลับลำดับหรือย้ายวัน
                (ใช้คีย์บอร์ดได้: โฟกัสที่ไอคอน กด Space แล้วใช้ลูกศรย้าย)
              </span>
              <span className="lg:hidden">
                ลากที่ไอคอน <GripVertical size={14} strokeWidth={1.75} className="inline -mt-0.5" /> หรือกดปุ่ม{" "}
                <ArrowUpDown size={14} strokeWidth={1.75} className="inline -mt-0.5" /> ในการ์ดเพื่อใช้ปุ่มลูกศร/เมนูย้าย
              </span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          {/* แผนที่: มือถืออยู่บนสุด เดสก์ท็อปอยู่ขวาและติดหน้าจอตอนเลื่อน */}
          <aside className="lg:col-span-2 order-first lg:order-last lg:sticky lg:top-20">
            <RouteMap
              startLat={state.draft.tripStartLat}
              startLng={state.draft.tripStartLng}
              days={mapDays}
            />
          </aside>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="lg:col-span-3 flex flex-col gap-3">
              {/* ---- คลังสถานที่ที่ยังไม่จัดวัน ---- */}
              <section className={`bg-white/60 border-2 border-dashed border-[color:var(--line)] rounded-2xl ${
                unassignedIds.length === 0 ? "p-2.5" : "p-3"
              }`}>
                {unassignedIds.length > 0 && (
                  <h2 className="font-prompt font-semibold text-base text-[color:var(--navy)] mb-2 flex items-center gap-2">
                    <MapPin size={18} strokeWidth={1.75} className="text-[color:var(--sky)]" />
                    ยังไม่จัดลงวัน ({unassignedIds.length})
                  </h2>
                )}
                <SortableContext items={unassignedIds} strategy={rectSortingStrategy}>
                  <DroppableColumn id={UNASSIGNED_KEY} grid>
                    {unassignedIds.length === 0 ? (
                      <p className="col-span-full flex items-center gap-2 text-sm text-[color:var(--muted)] py-0.5">
                        <CircleCheck size={18} strokeWidth={1.75} className="text-[color:var(--success)]" />
                        จัดลงวันครบทุกสถานที่แล้ว ลากการ์ดมาวางที่นี่เพื่อเอาออกจากแผน
                      </p>
                    ) : (
                      unassignedIds.map((placeId) => (
                        <PlaceCard
                          key={placeId}
                          placeId={placeId}
                          placeInfo={placesInfoById.get(placeId)}
                          currentKey={UNASSIGNED_KEY}
                          moveOptions={moveOptions}
                          onMoveTo={(toKey) => movePlace(placeId, toKey)}
                        />
                      ))
                    )}
                  </DroppableColumn>
                </SortableContext>
              </section>

              {/* ---- วันต่างๆ ---- */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                {tripDaysMeta.map((day) => {
                  const key = dayKey(day.tripDayId);
                  const items = computedByDay[key] ?? [];
                  const dayConflicts = items.filter(isProblem).length;
                  const dayCost = items.reduce((sum, i) => sum + (i.placeCost ?? 0), 0);
                  const unknownCost = items.filter((i) => i.isCostUnknown).length;

                  return (
                    <section key={day.tripDayId} className={`${cardClass} p-3`}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-prompt font-semibold text-base text-[color:var(--navy)]">
                            วันที่ {day.dayNumber}
                          </h3>
                          <p className="text-xs text-[color:var(--muted)] mt-0.5">
                            {formatVisitDate(day.visitDate)}
                            {day.startTime && day.endTime && (
                              <> · {formatTime(day.startTime)} - {formatTime(day.endTime)}</>
                            )}
                            {day.dailyBudget !== null && <> · งบ {formatBaht(day.dailyBudget)}</>}
                          </p>
                          {items.length > 0 && (
                            <p className="text-xs text-[color:var(--muted)] mt-0.5">
                              {items.length} สถานที่ · รวม {formatBaht(dayCost)}
                              {unknownCost > 0 && ` (ไม่ทราบราคา ${unknownCost} แห่ง)`}
                            </p>
                          )}
                        </div>
                        {dayConflicts > 0 && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border bg-white text-[color:var(--danger)] border-[color:var(--danger)]">
                            <TriangleAlert size={12} strokeWidth={1.75} />
                            {dayConflicts} จุด
                          </span>
                        )}
                      </div>

                      <SortableContext
                        items={containers[key] ?? []}
                        strategy={verticalListSortingStrategy}
                      >
                        <DroppableColumn id={key}>
                          {items.length === 0 ? (
                            <div className="text-sm text-[color:var(--muted)] py-6 px-3 text-center border-2 border-dashed border-[color:var(--line)] rounded-xl">
                              ยังไม่มีสถานที่ ลากมาวางที่นี่
                              <span className="lg:hidden"> หรือใช้เมนู "เพิ่มลงวัน" ในการ์ดที่ยังไม่จัด</span>
                            </div>
                          ) : (
                            items.map((item, idx) => (
                              <PlaceCard
                                key={item.placeId}
                                placeId={item.placeId}
                                placeInfo={placesInfoById.get(item.placeId)}
                                item={item}
                                isFirst={idx === 0}
                                dayOfWeek={new Date(day.visitDate + "T00:00:00").getDay()}
                                currentKey={key}
                                moveOptions={moveOptions}
                                canUp={idx > 0}
                                canDown={idx < items.length - 1}
                                onShift={(delta) => shiftPlace(item.placeId, key, delta)}
                                onMoveTo={(toKey) => movePlace(item.placeId, toKey)}
                                onRemove={() => handleRemoveFromDay(item.placeId, key)}
                              />
                            ))
                          )}
                        </DroppableColumn>
                      </SortableContext>

                    </section>
                  );
                })}
              </div>

              <DragOverlay>
                {activeId ? (
                  <div className="bg-white rounded-xl border-2 border-[color:var(--navy)] [box-shadow:var(--shadow)] px-4 py-3 w-72 flex items-center gap-2">
                    <GripVertical size={18} strokeWidth={1.75} className="shrink-0 text-[color:var(--muted)]" />
                    <div className="min-w-0">
                      <p className="font-prompt font-medium text-[color:var(--navy)] truncate">
                        {activePlaceInfo?.place_name ?? "สถานที่"}
                      </p>
                      {activeItem && (
                        <p className="text-xs text-[color:var(--muted)] mt-0.5">
                          {formatTimeRange(activeItem.startTime, activeItem.endTime)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </div>
          </DndContext>
        </div>
      </main>

      {/* ---- แถบยืนยันแผน ---- */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-4">
          <div className={`${cardClass} px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}>
            <div className="text-sm flex flex-col gap-1">
              <p className="font-prompt font-medium text-[color:var(--navy)]">
                จัดลงวันแล้ว {placedCount}/{places.length} สถานที่ · {tripDaysMeta.length} วัน
              </p>
              {unassignedIds.length > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-[color:var(--muted)]">
                  <Info size={14} strokeWidth={1.75} className="shrink-0" />
                  อีก {unassignedIds.length} สถานที่ยังไม่ได้จัดลงวัน จะไม่ถูกบันทึกในแผน
                </p>
              )}
              {conflictCount > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-[color:var(--danger)]">
                  <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0" />
                  <span id="conflict-msg">
                    ยืนยันแผนไม่ได้ เพราะมี {conflictCount} จุดที่มีปัญหา (ไม่อยู่ในเวลาเปิด / เวลาไม่พอ / งบเกิน)
                    ให้ย้ายหรือเอาสถานที่นั้นออกก่อน
                  </span>
                </p>
              )}
              {saveError && (
                <p role="alert" className="flex items-center gap-1.5 text-xs text-[color:var(--danger)]">
                  <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0" />
                  {saveError}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || conflictCount > 0}
              aria-describedby={conflictCount > 0 ? "conflict-msg" : undefined}
              className={primaryBtn}
            >
              {saving ? (
                <>
                  <Loader2 size={20} strokeWidth={1.75} className="animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <Check size={20} strokeWidth={1.75} />
                  ยืนยันแผน
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}