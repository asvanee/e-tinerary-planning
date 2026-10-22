// ตรวจ body ของหน้า Category Mapping (R5 P5e — D-40)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ค่าที่ CHECK ของตาราง categories ยอมรับ
export const PARENT_GROUPS = ["HISTORY_CULTURE", "NATURE", "RECREATION"] as const;
export const ENVIRONMENT_TYPES = ["INDOOR", "OUTDOOR", "MIXED"] as const;
export const PRICE_NATURES = ["free", "paid"] as const;

export const MAX_CATEGORY_NAME_LENGTH = 100;

export interface CategoryUpdate {
  category_name: string;
  parent_group: (typeof PARENT_GROUPS)[number];
  environment_type: (typeof ENVIRONMENT_TYPES)[number];
  price_nature: (typeof PRICE_NATURES)[number];
}

export type Parsed<T> = { value: T } | { error: string };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

/** body ของ PUT /api/admin/categories/:categoryId — ต้องส่งครบทุกช่อง · ตัดช่องว่างหัวท้ายชื่อ */
export function parseCategoryUpdate(body: unknown): Parsed<CategoryUpdate> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const name = typeof input.category_name === "string" ? input.category_name.trim() : "";
  if (!name) return { error: "กรุณากรอกชื่อหมวด" };
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return { error: `ชื่อหมวดยาวได้ไม่เกิน ${MAX_CATEGORY_NAME_LENGTH} ตัวอักษร` };
  }
  if (!isOneOf(PARENT_GROUPS, input.parent_group)) return { error: "กลุ่มใหญ่ไม่ถูกต้อง" };
  if (!isOneOf(ENVIRONMENT_TYPES, input.environment_type)) return { error: "ประเภทสถานที่ (ในร่ม/กลางแจ้ง) ไม่ถูกต้อง" };
  if (!isOneOf(PRICE_NATURES, input.price_nature)) return { error: "ค่าเข้าชม (ฟรี/เสียค่าใช้จ่าย) ไม่ถูกต้อง" };

  return {
    value: {
      category_name: name,
      parent_group: input.parent_group,
      environment_type: input.environment_type,
      price_nature: input.price_nature,
    },
  };
}

/** body ของ PUT /api/admin/categories/labels/:labelId — { category_id } ของหมวดปลายทาง */
export function parseLabelMove(body: unknown): Parsed<string> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  return isUuid(input.category_id) ? { value: input.category_id } : { error: "กรุณาเลือกหมวดปลายทาง" };
}
