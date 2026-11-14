// ตรวจ category_ids และหาว่าต้องเพิ่ม/ลบแถวไหนใน trip_categories

import { isUuid } from "../../utils/uuid";

export type ParsedCategoryIds = { ids: string[] } | { error: string };

// ต้องเป็น array ของ uuid อย่างน้อย 1 ตัว · ตัด id ซ้ำออก
export function parseCategoryIds(value: unknown): ParsedCategoryIds {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: "กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด" };
  }

  if (!value.every(isUuid)) {
    return { error: "รหัสหมวดหมู่ไม่ถูกต้อง" };
  }

  return { ids: [...new Set(value)] };
}

export interface TripCategoryLink {
  trip_category_id: string;
  category_id: string;
}

// เทียบหมวดเดิมกับชุดใหม่ — ลบแถวที่ไม่อยู่ในชุดใหม่หรือซ้ำ (ตารางไม่มี UNIQUE จึงอาจมีแถวซ้ำ)
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
