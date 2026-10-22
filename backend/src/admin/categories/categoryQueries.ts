import { supabase } from "../../config/db";
import { selectAll } from "../provinces/decisionQueries";
import { CategoryUpdate } from "./categoryInput";

export interface AdminCategoryLabel {
  category_label_id: string;
  att_type_label: string;
  place_count: number; // จำนวนสถานที่ใน places ที่มีป้ายนี้
}

export interface AdminCategory {
  category_id: string;
  category_name: string;
  parent_group: string;
  environment_type: string;
  price_nature: string;
  labels: AdminCategoryLabel[];
}

interface CategoryRow {
  category_id: string;
  category_name: string;
  parent_group: string;
  environment_type: string;
  price_nature: string;
}

interface LabelRow {
  category_label_id: string;
  att_type_label: string;
  category_id: string;
}

// หมวดทั้งหมด + ป้ายในแต่ละหมวด + จำนวนสถานที่ต่อป้าย (places เกิน 1000 แถว จึงใช้ selectAll)
export async function listAdminCategories(): Promise<AdminCategory[]> {
  const [categoriesResult, labelsResult, placeRows] = await Promise.all([
    supabase
      .from("categories")
      .select("category_id, category_name, parent_group, environment_type, price_nature")
      .order("category_name"),
    supabase.from("category_labels").select("category_label_id, att_type_label, category_id").order("att_type_label"),
    selectAll<{ att_type_label: string | null }>((from, to) =>
      supabase.from("places").select("att_type_label").order("place_id").range(from, to)
    ),
  ]);
  if (categoriesResult.error) throw categoriesResult.error;
  if (labelsResult.error) throw labelsResult.error;

  const placeCounts = new Map<string, number>();
  for (const { att_type_label } of placeRows) {
    if (att_type_label) placeCounts.set(att_type_label, (placeCounts.get(att_type_label) ?? 0) + 1);
  }

  const labelsByCategory = new Map<string, AdminCategoryLabel[]>();
  for (const label of (labelsResult.data ?? []) as LabelRow[]) {
    const list = labelsByCategory.get(label.category_id) ?? [];
    list.push({
      category_label_id: label.category_label_id,
      att_type_label: label.att_type_label,
      place_count: placeCounts.get(label.att_type_label) ?? 0,
    });
    labelsByCategory.set(label.category_id, list);
  }

  return ((categoriesResult.data ?? []) as CategoryRow[]).map((category) => ({
    ...category,
    labels: labelsByCategory.get(category.category_id) ?? [],
  }));
}

export async function categoryExists(categoryId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("categories")
    .select("category_id", { count: "exact", head: true })
    .eq("category_id", categoryId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ชื่อหมวดเป็น UNIQUE — เช็คก่อนแก้เพื่อตอบข้อความที่อ่านเข้าใจได้ (DB ยังกันซ้ำอีกชั้น)
export async function isCategoryNameTaken(name: string, exceptCategoryId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("categories")
    .select("category_id", { count: "exact", head: true })
    .eq("category_name", name)
    .neq("category_id", exceptCategoryId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** คืน false ถ้าไม่พบหมวดนี้ */
export async function updateCategory(categoryId: string, update: CategoryUpdate): Promise<boolean> {
  const { data, error } = await supabase
    .from("categories")
    .update(update)
    .eq("category_id", categoryId)
    .select("category_id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** ย้ายป้ายไปหมวดอื่น · คืน false ถ้าไม่พบป้ายนี้ */
export async function moveLabel(labelId: string, categoryId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("category_labels")
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .eq("category_label_id", labelId)
    .select("category_label_id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
