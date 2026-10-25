const AUTO_TRIP_DURATION_OPTIONS = new Set([30, 60, 90, 120, 150, 180]);
const AUTO_TRIP_DURATION_LABEL = "30, 60, 90, 120, 150 หรือ 180 นาที";

export type ParsedAutoTripDurations =
  | { durations: Map<string, number> }
  | { error: string };

export function parseAutoTripDurations(
  value: unknown,
  categoryIds: string[]
): ParsedAutoTripDurations {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { error: "กรุณากรอกเวลาเที่ยวของทุกประเภทสถานที่" };
  }

  const input = value as Record<string, unknown>;
  const categoryIdSet = new Set(categoryIds);
  const hasUnknownCategory = Object.keys(input).some(
    (categoryId) => !categoryIdSet.has(categoryId)
  );

  if (hasUnknownCategory) {
    return { error: "พบประเภทสถานที่ที่ไม่ถูกต้อง" };
  }

  const durations = new Map<string, number>();
  let missing = 0;

  for (const categoryId of categoryIds) {
    const minutes = input[categoryId];

    if (minutes === undefined || minutes === null) {
      missing += 1;
      continue;
    }

    if (
      typeof minutes !== "number" ||
      !Number.isInteger(minutes) ||
      !AUTO_TRIP_DURATION_OPTIONS.has(minutes)
    ) {
      return {
        error: `เวลาเที่ยวต้องเลือก ${AUTO_TRIP_DURATION_LABEL}`,
      };
    }

    durations.set(categoryId, minutes);
  }

  if (missing > 0) {
    return {
      error: `กรุณากรอกเวลาเที่ยวให้ครบ (ยังขาด ${missing} ประเภท)`,
    };
  }

  return { durations };
}
