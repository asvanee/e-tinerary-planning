import { parseVisitDurations } from "../visitDurations";
import { buildDayItems, DayAssignment, PlaceInput } from "../itineraryBuilder";

describe("parseVisitDurations (D-36)", () => {
  test("ไม่มีสถานที่ในแผน → ผ่านโดยไม่ต้องส่งค่า", () => {
    expect(parseVisitDurations(undefined, [])).toEqual({ durations: new Map() });
  });

  test.each([
    ["ไม่ส่งมา", undefined],
    ["ไม่ใช่ object", 60],
    ["เป็น array", [60]],
  ])("%s → ต้องกรอกเวลา", (_label, value) => {
    expect(parseVisitDurations(value, ["a"])).toEqual({ error: "กรุณากรอกเวลาที่จะอยู่ของทุกสถานที่" });
  });

  test("ขาดบางแห่ง → บอกจำนวนที่ขาด", () => {
    expect(parseVisitDurations({ a: 60, b: null }, ["a", "b", "c"])).toEqual({
      error: "กรุณากรอกเวลาที่จะอยู่ให้ครบ (ยังขาด 2 แห่ง)",
    });
  });

  test.each([
    ["0", 0],
    ["ติดลบ", -5],
    ["เกิน 1440", 1441],
    ["ทศนิยม", 30.5],
    ["string", "60"],
  ])("ค่า %s → ไม่ถูกต้อง", (_label, minutes) => {
    expect(parseVisitDurations({ a: minutes }, ["a"])).toEqual({
      error: "เวลาที่จะอยู่ต้องเป็นจำนวนเต็ม 1–1440 นาที",
    });
  });

  test("ครบและถูกช่วง → คืนเฉพาะสถานที่ในแผน", () => {
    const result = parseVisitDurations({ a: 1, b: 1440, extra: 30 }, ["a", "b"]);
    expect(result).toEqual({ durations: new Map([["a", 1], ["b", 1440]]) });
  });
});

describe("buildDayItems กับเวลาที่ผู้ใช้กรอก (D-36)", () => {
  // 2026-10-26 เป็นวันจันทร์ · เปิด 08:00–12:00 ทุกวัน
  const openingHours = {
    periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      open: { day, time: "0800" },
      close: { day, time: "1200" },
    })),
  };

  const place = (placeId: string, visitDurationMin: number | null): PlaceInput => ({
    placeId,
    latitude: 18.8,
    longitude: 98.98,
    rawPriceLevel: 0,
    priceNature: "free",
    openingHours,
    visitDurationMin,
  });

  const day: DayAssignment = {
    tripDayId: "d1",
    dayNumber: 2, // ไม่มี leg จากจุดเริ่มต้น → สถานที่แรกเริ่มตามเวลาเริ่มของวัน
    visitDate: "2026-10-26",
    startTime: "09:00:00",
    endTime: "17:00:00",
    dailyBudget: null,
    useBudget: false,
    orderedPlaceIds: ["a", "b"],
  };

  const travelMatrix = {
    a: { b: { distanceKm: 1, durationMin: 10, source: "ors" as const } },
  };

  test("กรอกครบ → เวลาจบ = เวลาเริ่ม + เวลาที่กรอก และเช็คเวลาเปิดทั้งช่วง", () => {
    const places = new Map([["a", place("a", 90)], ["b", place("b", 120)]]);
    const [a, b] = buildDayItems(day, places, travelMatrix);
    expect([a.startTime, a.endTime]).toEqual(["09:00:00", "10:30:00"]);
    expect([b.startTime, b.endTime]).toEqual(["10:40:00", "12:40:00"]);
    expect(a.isClosedConflict).toBe(false);
    expect(b.isClosedConflict).toBe(true); // อยู่เลย 12:00 ที่ปิด
  });

  test("ยังไม่กรอก → ไม่มีเวลาจบ เช็คแค่ตอนไปถึง และสถานที่ถัดไปคิดเวลาไม่ได้", () => {
    const places = new Map([["a", place("a", null)], ["b", place("b", 60)]]);
    const [a, b] = buildDayItems(day, places, travelMatrix);
    expect([a.startTime, a.endTime]).toEqual(["09:00:00", null]);
    expect(a.isClosedConflict).toBe(false);
    expect(a.isHoursUnknown).toBe(false);
    expect(a.isTimeConflict).toBe(false);
    expect([b.startTime, b.endTime]).toEqual([null, null]);
  });
});
