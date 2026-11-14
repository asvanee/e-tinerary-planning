import { parseCategoryUpdate, parseLabelMove } from "../categoryInput";

const valid = {
  category_name: "  น้ำตก  ",
  parent_group: "NATURE",
  environment_type: "OUTDOOR",
  price_nature: "free",
};

describe("parseCategoryUpdate (D-40)", () => {
  test("ค่าครบ → ตัดช่องว่างหัวท้ายชื่อ", () => {
    expect(parseCategoryUpdate(valid)).toEqual({ value: { ...valid, category_name: "น้ำตก" } });
  });

  test.each([
    ["ไม่ส่ง body", undefined, "กรุณากรอกชื่อหมวด"],
    ["ชื่อว่าง", { ...valid, category_name: "   " }, "กรุณากรอกชื่อหมวด"],
    ["ชื่อยาวเกิน", { ...valid, category_name: "ก".repeat(101) }, "ชื่อหมวดยาวได้ไม่เกิน 100 ตัวอักษร"],
    ["กลุ่มไม่มีจริง", { ...valid, parent_group: "FOOD" }, "กลุ่มใหญ่ไม่ถูกต้อง"],
    ["env ไม่ถูกต้อง", { ...valid, environment_type: "outdoor" }, "ประเภทสถานที่ (ในร่ม/กลางแจ้ง) ไม่ถูกต้อง"],
    ["price ไม่ถูกต้อง", { ...valid, price_nature: "food" }, "ค่าเข้าชม (ฟรี/เสียค่าใช้จ่าย) ไม่ถูกต้อง"],
  ])("%s → error", (_label, body, error) => {
    expect(parseCategoryUpdate(body)).toEqual({ error });
  });
});

describe("parseLabelMove (D-40)", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  test("uuid → ผ่าน", () => {
    expect(parseLabelMove({ category_id: id })).toEqual({ value: id });
  });

  test.each([
    ["ไม่ส่ง", {}],
    ["ไม่ใช่ uuid", { category_id: "abc" }],
    ["body ไม่ใช่ object", "x"],
  ])("%s → ต้องเลือกหมวด", (_label, body) => {
    expect(parseLabelMove(body)).toEqual({ error: "กรุณาเลือกหมวดปลายทาง" });
  });
});
