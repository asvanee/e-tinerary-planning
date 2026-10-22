import { diffTripCategories, parseCategoryIds } from "../tripCategories";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("parseCategoryIds (D-38)", () => {
  test.each([
    ["ไม่ส่งมา", undefined],
    ["ไม่ใช่ array", A],
    ["array ว่าง", []],
  ])("%s → ต้องเลือกอย่างน้อย 1 หมวด", (_label, value) => {
    expect(parseCategoryIds(value)).toEqual({ error: "กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด" });
  });

  test.each([
    ["ไม่ใช่ uuid", [A, "abc"]],
    ["ไม่ใช่ string", [A, 5]],
  ])("%s → รหัสไม่ถูกต้อง", (_label, value) => {
    expect(parseCategoryIds(value)).toEqual({ error: "รหัสหมวดหมู่ไม่ถูกต้อง" });
  });

  test("ตัด id ซ้ำ · คงลำดับเดิม", () => {
    expect(parseCategoryIds([B, A, B])).toEqual({ ids: [B, A] });
  });
});

describe("diffTripCategories (D-38)", () => {
  test("ทริปยังไม่มีหมวด → เพิ่มทั้งหมด", () => {
    expect(diffTripCategories([], [A, B])).toEqual({ toAdd: [A, B], toRemoveRowIds: [] });
  });

  test("เพิ่มที่ขาด · ลบที่ไม่ได้เลือก · คงที่เลือกซ้ำ", () => {
    const existing = [
      { trip_category_id: "row-a", category_id: A },
      { trip_category_id: "row-c", category_id: C },
    ];
    expect(diffTripCategories(existing, [A, B])).toEqual({ toAdd: [B], toRemoveRowIds: ["row-c"] });
  });

  test("แถวซ้ำใน DB → เก็บแถวแรก ลบที่เหลือ", () => {
    const existing = [
      { trip_category_id: "row-a1", category_id: A },
      { trip_category_id: "row-a2", category_id: A },
    ];
    expect(diffTripCategories(existing, [A])).toEqual({ toAdd: [], toRemoveRowIds: ["row-a2"] });
  });
});
