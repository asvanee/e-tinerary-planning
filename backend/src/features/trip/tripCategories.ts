// ตรวจ category_ids และคำนวณว่าต้องเพิ่ม/ลบแถวไหนใน trip_categories (PUT /api/trips/:tripId/addcategories — D-38)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedCategoryIds = { ids: string[] } | { error: string };

/** ต้องเป็น array ของ uuid อย่างน้อย 1 ตัว · ตัด id ซ้ำออก */
export function parseCategoryIds(value: unknown): ParsedCategoryIds {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด" };
  }

  if (!value.every((id): id is string => typeof id === "string" && UUID_PATTERN.test(id))) {
    return { error: "รหัสหมวดหมู่ไม่ถูกต้อง" };
  }

  return { ids: [...new Set(value)] };
}

export interface TripCategoryLink {
  trip_category_id: string;
  category_id: string;
}

/**
 * เทียบหมวดเดิมกับชุดใหม่ · แถวที่หมวดไม่อยู่ในชุดใหม่หรือซ้ำกับแถวก่อนหน้าให้ลบ
 * (DB ไม่มี UNIQUE (trip_id, category_id) จึงอาจมีแถวซ้ำอยู่แล้ว)
 */
export function diffTripCategories(
  existing: TripCategoryLink[],
  wanted: string[]
): { toAdd: string[]; toRemoveRowIds: string[] } {
  const wantedSet = new Set(wanted);
  const kept = new Set<string>();
  const toRemoveRowIds: string[] = [];

  for (const row of existing) {
    if (wantedSet.has(row.category_id) && !kept.has(row.category_id)) {
      kept.add(row.category_id);
    } else {
      toRemoveRowIds.push(row.trip_category_id);
    }
  }

  return { toAdd: wanted.filter((id) => !kept.has(id)), toRemoveRowIds };
}
