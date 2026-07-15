import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Navbar from "../../../../components/navbar";
import { useAuth } from "../../../auth/hooks/useAuth";
import RouteMap from "../components/RouteMap";
import {
  buildDayItems,
  type DayAssignment,
  type ItineraryItemResult,
  type PlaceInput,
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
  // ✅ coalesce เสร็จจาก backend เสมอแล้ว (places.price_level -> categories.default_price_level -> 0)
  price_level: number;
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
}

interface LocationState {
  tripId: string;
  draft: DraftResponse;
  places: MergedPlace[];
}

const UNASSIGNED_KEY = "unassigned";

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

// ---------- Conflict badges ----------

function ConflictBadges({ item }: { item: ItineraryItemResult }) {
  const badges: { label: string; className: string }[] = [];

  if (item.isClosedConflict) {
    badges.push({
      label: "ปิดแล้วช่วงนี้",
      className: "bg-red-100 text-red-700 border border-red-200",
    });
  }
  if (item.isTimeConflict) {
    badges.push({
      label: "เวลาไม่พอ",
      className: "bg-orange-100 text-orange-700 border border-orange-200",
    });
  }
  if (item.isBudgetConflict) {
    badges.push({
      label: "งบเกิน",
      className: "bg-purple-100 text-purple-700 border border-purple-200",
    });
  }
  if (item.isHoursUnknown) {
    badges.push({
      label: "ไม่ทราบเวลาเปิด-ปิด",
      className: "bg-amber-50 text-amber-700 border border-amber-300",
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${b.className}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ---------- Sortable card ----------

function PlaceCard({
  placeId,
  placeInfo,
  item,
  onRemove,
}: {
  placeId: string;
  placeInfo?: PlaceInfo;
  item?: ItineraryItemResult;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: placeId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl shadow-sm border border-black/5 px-4 py-3 flex items-start gap-3 touch-none"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 w-8 h-8 rounded-full bg-[#102a6b] text-white text-xs font-prompt font-bold flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        title="ลากเพื่อจัดลำดับ/ย้ายวัน"
      >
        {item ? item.visitOrder : "≡"}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-prompt font-semibold text-sm text-[#102a6b] truncate">
          {placeInfo?.place_name ?? "ไม่พบชื่อสถานที่"}
        </h4>
        <p className="text-xs text-[#5990c0] mt-0.5 truncate">
          {placeInfo?.district ? `${placeInfo.district}, ` : ""}
          {placeInfo?.province ?? ""}
        </p>

        {item && (
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-[#015185]">
            <span>
              {formatTime(item.startTime)} - {formatTime(item.endTime)}
            </span>
            {item.travelTimeFromPrev !== null && (
              <span>เดินทาง {item.travelTimeFromPrev} นาที</span>
            )}
            <span>{formatBaht(item.placeCost)}</span>
          </div>
        )}

        {item && <ConflictBadges item={item} />}
      </div>

      <button
        onClick={onRemove}
        title="เอาออกจากวันนี้"
        className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 flex items-center justify-center text-sm transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

// ---------- Droppable column wrapper ----------

function DroppableColumn({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2.5 min-h-[80px] rounded-xl transition-colors ${
        isOver ? "bg-blue-50" : ""
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
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
        priceLevel: p.place.price_level,
        // ✅ เพิ่มที่ขาดไป — PlaceInput.hasPriceLevel เป็น required field ใน itineraryBuilder.ts
        // ไม่ใส่มาก่อนหน้านี้ทำให้ type ไม่ครบ p.place.price_level ตอนนี้ coalesce จาก backend
        // เสมอแล้ว (ไม่ nullable ในทางปฏิบัติ) แต่ hasPriceLevel ยังมีประโยชน์เผื่ออนาคตอยากโชว์
        // badge "ราคาโดยประมาณ" แยกจากราคาจริง — เทียบจาก opening_hours/price_level ที่ backend
        // เคยส่ง raw price_level มา (ตอนนี้ placesController.ts coalesce แล้วจึงเป็น true เสมอ
        // ในทางปฏิบัติ แต่เก็บไว้ให้ type ตรงตาม contract ของ itineraryBuilder.ts)
        hasPriceLevel: p.place.price_level !== null,
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
        visitDate: day.visitDate,
        startTime: day.startTime,
        endTime: day.endTime,
        dailyBudget: day.dailyBudget,
        useBudget: day.useBudget,
        orderedPlaceIds: containers[key] ?? [],
      };
      result[key] = buildDayItems(assignment, placesById);
    }
    return result;
  }, [containers, tripDaysMeta, placesById]);

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

  async function handleConfirm() {
    if (!session || !tripId) return;

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
      <div className="font-sarabun min-h-screen bg-[#fcedd3] flex items-center justify-center">
        <p className="text-[#5990c0]">กำลังตรวจสอบข้อมูล...</p>
      </div>
    );
  }

  const activePlaceInfo = activeId ? placesInfoById.get(activeId) : undefined;
  const activeItem = activeId ? itemByPlaceId.get(activeId) : undefined;

  const unassignedIds = containers[UNASSIGNED_KEY] ?? [];

  return (
    <div className="font-sarabun min-h-screen bg-[#fcedd3] pb-32">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-[#102a6b] font-prompt font-semibold shadow-md hover:shadow-lg hover:-translate-x-1 transition-all duration-200"
        >
          <span className="text-lg transition-transform duration-200 group-hover:-translate-x-1">
            ←
          </span>
          <span>กลับ</span>
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg">
          <h2 className="font-prompt font-bold text-2xl text-white mb-1">
            จัดเรียงแผนการเดินทาง
          </h2>
          <p className="text-[#5990c0] text-sm">
            ลากสถานที่เพื่อสลับลำดับ หรือย้ายไปวันอื่นได้เลย ระบบคำนวณเวลา/งบให้ทันที
          </p>
        </div>

        <div className="mb-6">
          <RouteMap
            startLat={state.draft.tripStartLat}
            startLng={state.draft.tripStartLng}
            days={mapDays}
          />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* ---- คลังสถานที่ที่ยังไม่จัดวัน ---- */}
          <div className="bg-white/60 border-2 border-dashed border-[#5990c0]/40 rounded-2xl px-5 py-4 mb-6">
            <h3 className="font-prompt font-semibold text-sm text-[#102a6b] mb-3">
              สถานที่ที่ยังไม่จัดลงวัน ({unassignedIds.length})
            </h3>
            <SortableContext
              items={unassignedIds}
              strategy={verticalListSortingStrategy}
            >
              <DroppableColumn id={UNASSIGNED_KEY}>
                {unassignedIds.length === 0 ? (
                  <p className="text-xs text-[#5990c0] py-2">
                    ลากการ์ดมาวางที่นี่เพื่อเอาออกจากแผนวันนั้นๆ
                  </p>
                ) : (
                  unassignedIds.map((placeId) => (
                    <PlaceCard
                      key={placeId}
                      placeId={placeId}
                      placeInfo={placesInfoById.get(placeId)}
                      onRemove={() => {}}
                    />
                  ))
                )}
              </DroppableColumn>
            </SortableContext>
          </div>

          {/* ---- วันต่างๆ ---- */}
          <div className="flex gap-5 overflow-x-auto pb-4">
            {tripDaysMeta.map((day) => {
              const key = dayKey(day.tripDayId);
              const items = computedByDay[key] ?? [];

              return (
                <div
                  key={day.tripDayId}
                  className="bg-white rounded-2xl shadow-md px-5 py-4 flex-shrink-0 w-80"
                >
                  <div className="mb-3">
                    <h3 className="font-prompt font-bold text-base text-[#102a6b]">
                      วันที่ {day.dayNumber}
                    </h3>
                    <p className="text-xs text-[#5990c0]">
                      {formatVisitDate(day.visitDate)}
                      {day.startTime && day.endTime && (
                        <> · {formatTime(day.startTime)} - {formatTime(day.endTime)}</>
                      )}
                      {day.dailyBudget !== null && (
                        <> · งบ {formatBaht(day.dailyBudget)}</>
                      )}
                    </p>
                  </div>

                  <SortableContext
                    items={containers[key] ?? []}
                    strategy={verticalListSortingStrategy}
                  >
                    <DroppableColumn id={key}>
                      {items.length === 0 ? (
                        <div className="text-xs text-[#5990c0] py-6 text-center border-2 border-dashed border-[#5990c0]/30 rounded-xl">
                          ลากสถานที่มาวางที่นี่
                        </div>
                      ) : (
                        items.map((item) => (
                          <PlaceCard
                            key={item.placeId}
                            placeId={item.placeId}
                            placeInfo={placesInfoById.get(item.placeId)}
                            item={item}
                            onRemove={() => handleRemoveFromDay(item.placeId, key)}
                          />
                        ))
                      )}
                    </DroppableColumn>
                  </SortableContext>
                </div>
              );
            })}
          </div>

          <DragOverlay>
            {activeId ? (
              <div className="bg-white rounded-xl shadow-lg border border-black/10 px-4 py-3 w-72">
                <h4 className="font-prompt font-semibold text-sm text-[#102a6b] truncate">
                  {activePlaceInfo?.place_name ?? "สถานที่"}
                </h4>
                {activeItem && (
                  <p className="text-xs text-[#5990c0] mt-1">
                    {formatTime(activeItem.startTime)} - {formatTime(activeItem.endTime)}
                  </p>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ---- แถบยืนยันแผน ---- */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <div className="max-w-6xl mx-auto px-4 pb-5">
          <div className="bg-white rounded-2xl shadow-2xl px-6 py-4 flex items-center justify-between gap-4 border border-black/5">
            <div className="text-sm text-[#102a6b] font-prompt font-semibold">
              {places.length} สถานที่ · {tripDaysMeta.length} วัน
              {saveError && (
                <div className="text-xs text-red-600 font-normal mt-1">
                  {saveError}
                </div>
              )}
            </div>
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="px-6 py-3 rounded-xl text-white font-bold bg-gradient-to-r from-[#102a6b] to-[#015185] shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "กำลังบันทึก..." : "ยืนยันแผน"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}