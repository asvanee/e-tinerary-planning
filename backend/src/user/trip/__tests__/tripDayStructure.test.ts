import { dayStructureChanged, DayStructure } from "../tripDayStructure";

const base: DayStructure = {
  start_date: "2026-11-01",
  end_date: "2026-11-03",
  start_time: "09:00:00",
  available_time_per_day: 8,
  daily_budget: 1500,
};

describe("dayStructureChanged (Known Issue #6)", () => {
  test("ค่าเหมือนเดิม → ไม่ล้างแผน", () => {
    expect(dayStructureChanged(base, { ...base })).toBe(false);
  });

  test("numeric ที่คลาดเล็กน้อยหรือมาเป็น string ถือว่าเท่ากัน", () => {
    expect(dayStructureChanged(base, { ...base, daily_budget: 1500.0001 })).toBe(false);
    expect(dayStructureChanged(base, { ...base, daily_budget: "1500" })).toBe(false);
  });

  test.each([
    ["วันเริ่ม", { start_date: "2026-11-02" }],
    ["วันจบ", { end_date: "2026-11-05" }],
    ["เวลาเริ่ม", { start_time: "10:00:00" }],
    ["เวลาว่างต่อวัน", { available_time_per_day: 6 }],
    ["งบต่อวัน", { daily_budget: 2000 }],
    ["เลิกใช้งบ (งบต่อวันเป็น null)", { daily_budget: null }],
  ])("เปลี่ยน%s → ล้างแผน", (_label, change) => {
    expect(dayStructureChanged(base, { ...base, ...change })).toBe(true);
  });

  test("null ทั้งคู่ถือว่าเท่ากัน", () => {
    expect(dayStructureChanged({ ...base, daily_budget: null }, { ...base, daily_budget: null })).toBe(false);
  });
});
