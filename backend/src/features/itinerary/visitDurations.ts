// ตรวจเวลาที่ผู้ใช้กรอกว่าจะอยู่แต่ละสถานที่ (PUT /api/itinerary/trips/:tripId — D-36)

export const MIN_VISIT_DURATION_MIN = 1;
export const MAX_VISIT_DURATION_MIN = 1440; // ตรงกับ CHECK ของ itineraries.visit_duration_min

export type ParsedVisitDurations = { durations: Map<string, number> } | { error: string };

/**
 * value = { [place_id]: นาที } · ทุก placeId ในแผนต้องมีค่าเป็นจำนวนเต็ม 1–1440
 * (ค่าของสถานที่ที่ไม่อยู่ในแผนไม่สนใจ — เช่น ที่ยังค้างใน "ยังไม่จัดลงวัน")
 */
export function parseVisitDurations(value: unknown, placeIds: string[]): ParsedVisitDurations {
  if (placeIds.length === 0) return { durations: new Map() };

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "กรุณากรอกเวลาที่จะอยู่ของทุกสถานที่" };
  }

  const input = value as Record<string, unknown>;
  const durations = new Map<string, number>();
  let missing = 0;

  for (const placeId of placeIds) {
    const minutes = input[placeId];
    if (minutes === undefined || minutes === null) {
      missing += 1;
      continue;
    }
    if (
      typeof minutes !== "number" ||
      !Number.isInteger(minutes) ||
      minutes < MIN_VISIT_DURATION_MIN ||
      minutes > MAX_VISIT_DURATION_MIN
    ) {
      return {
        error: `เวลาที่จะอยู่ต้องเป็นจำนวนเต็ม ${MIN_VISIT_DURATION_MIN}–${MAX_VISIT_DURATION_MIN} นาที`,
      };
    }
    durations.set(placeId, minutes);
  }

  if (missing > 0) {
    return { error: `กรุณากรอกเวลาที่จะอยู่ให้ครบ (ยังขาด ${missing} แห่ง)` };
  }

  return { durations };
}
