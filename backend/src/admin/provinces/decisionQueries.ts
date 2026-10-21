import { supabase } from "../../config/db";
import { NewDecision } from "../pipeline/review/decisionInput";
import { PlaceDecision } from "../pipeline/review/reviewTypes";

const TABLE = "admin_place_decisions";
const PAGE_SIZE = 1000; // Supabase จำกัดแถวต่อ request (T7) — ต้อง paginate ทุก query ที่อาจเกิน

export async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export function listDecisions(province: string): Promise<PlaceDecision[]> {
  return selectAll<PlaceDecision>((from, to) =>
    supabase.from(TABLE).select("*").eq("province", province).order("decided_at").order("decision_id").range(from, to)
  );
}

// จำนวนการตัดสินใจต่อจังหวัด (หน้า list จังหวัด)
export async function countDecisionsByProvince(): Promise<Map<string, number>> {
  const rows = await selectAll<{ province: string }>((from, to) =>
    supabase.from(TABLE).select("province").order("decided_at").order("decision_id").range(from, to)
  );
  const counts = new Map<string, number>();
  rows.forEach((r) => counts.set(r.province, (counts.get(r.province) ?? 0) + 1));
  return counts;
}

// จำนวนสถานที่ที่อยู่ใน places แล้วต่อจังหวัด
export async function countImportedByProvince(): Promise<Map<string, number>> {
  const rows = await selectAll<{ province: string | null }>((from, to) =>
    supabase.from("places").select("province").order("place_id").range(from, to)
  );
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    if (r.province) counts.set(r.province, (counts.get(r.province) ?? 0) + 1);
  });
  return counts;
}

export async function insertDecisions(decisions: NewDecision[]): Promise<void> {
  if (decisions.length === 0) return;
  const { error } = await supabase.from(TABLE).insert(decisions);
  if (error) throw error;
}

// ลบด้วย decision_id เท่านั้น (ห้าม delete ที่ไม่มีเงื่อนไข)
export async function deleteDecisions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from(TABLE).delete().in("decision_id", ids);
  if (error) throw error;
}
