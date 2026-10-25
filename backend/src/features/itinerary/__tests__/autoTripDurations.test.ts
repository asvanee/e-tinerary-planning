import { parseAutoTripDurations } from "../autoTripDurations";

describe("parseAutoTripDurations", () => {
  test.each([
    ["ไม่มีค่า", undefined],
    ["ไม่ใช่ object", 60],
    ["เป็น array", [60]],
  ])("%s → ต้องกรอกเวลาเที่ยว", (_label, value) => {
    expect(parseAutoTripDurations(value, ["food"])).toEqual({
      error: "กรุณากรอกเวลาเที่ยวของทุกประเภทสถานที่",
    });
  });

  test("ขาดบางประเภท → แจ้งจำนวนประเภทที่ขาด", () => {
    expect(
      parseAutoTripDurations({ food: 60 }, ["food", "museum"])
    ).toEqual({
      error: "กรุณากรอกเวลาเที่ยวให้ครบ (ยังขาด 1 ประเภท)",
    });
  });

  test.each([
    ["ต่ำกว่าตัวเลือก", 1],
    ["ค่าระหว่างตัวเลือก", 45],
    ["เกินตัวเลือกสูงสุด", 240],
    ["ทศนิยม", 30.5],
    ["ข้อความ", "60"],
  ])("ค่าที่เป็น%sไม่ถูกต้อง", (_label, minutes) => {
    expect(
      parseAutoTripDurations({ food: minutes }, ["food"])
    ).toEqual({
      error: "เวลาเที่ยวต้องเลือก 30, 60, 90, 120, 150 หรือ 180 นาที",
    });
  });

  test.each([30, 60, 90, 120, 150, 180])(
    "รับเวลาที่อนุญาต %i นาที",
    (minutes) => {
      expect(
        parseAutoTripDurations({ food: minutes }, ["food"])
      ).toEqual({
        durations: new Map([["food", minutes]]),
      });
    }
  );

  test("คืนค่าตาม category id", () => {
    expect(
      parseAutoTripDurations({ food: 60, museum: 180 }, ["food", "museum"])
    ).toEqual({
      durations: new Map([
        ["food", 60],
        ["museum", 180],
      ]),
    });
  });

  test("ปฏิเสธ category id ที่ไม่ได้เป็นของทริป", () => {
    expect(
      parseAutoTripDurations({ food: 60, unknown: 45 }, ["food"])
    ).toEqual({ error: "พบประเภทสถานที่ที่ไม่ถูกต้อง" });
  });
});
