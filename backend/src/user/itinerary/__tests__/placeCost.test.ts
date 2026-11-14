import { getKnownPrice, getPlaceCost } from "../../../utils/placePrice";
import { buildItinerary, type DayAssignment, type PlaceInput } from "../itineraryBuilder";

describe("getKnownPrice / getPlaceCost (D-52)", () => {
  test.each([
    ["มี priceRange ครบ → ใช้ขอบบน", 1, 200, 200],
    ["ช่วงแบบ 'มากกว่า X' (ไม่มีขอบบน) → ใช้ขอบล่าง", 1000, null, 1000],
    ["ไม่มี priceRange → null", null, null, null],
  ])("%s", (_label, start, end, expected) => {
    expect(getKnownPrice(start, end)).toBe(expected);
  });

  test("ไม่มีข้อมูลราคา: free → 0 · paid → null (ไม่เดา)", () => {
    expect(getPlaceCost(null, null, "free")).toBe(0);
    expect(getPlaceCost(null, null, "paid")).toBeNull();
  });

  test("priceRange มาก่อนการถือว่าฟรีจากหมวด", () => {
    expect(getPlaceCost(1, 200, "free")).toBe(200);
  });
});

describe("buildItinerary คิดงบด้วย priceRange (D-52)", () => {
  const place = (placeId: string, rangeEnd: number | null): PlaceInput => ({
    placeId,
    latitude: 18.78,
    longitude: 100.77,
    priceRangeStart: rangeEnd === null ? null : 1,
    priceRangeEnd: rangeEnd,
    priceNature: "paid",
    openingHours: null,
    visitDurationMin: 60,
  });
  const day: DayAssignment = {
    tripDayId: "d1",
    dayNumber: 1,
    visitDate: "2026-11-02",
    startTime: "08:00:00",
    endTime: "20:00:00",
    dailyBudget: 300, // งบต่อคนต่อวัน (D-51)
    useBudget: true,
    orderedPlaceIds: ["A", "B", "C"],
  };

  test("ยอดสะสมใช้ขอบบนของ priceRange · ไม่ทราบราคาไม่นับ", () => {
    const placesById = new Map([
      ["A", place("A", 150)],
      ["B", place("B", null)],
      ["C", place("C", 200)],
    ]);
    const items = buildItinerary([day], placesById, {});
    expect(items.map((i) => i.placeCost)).toEqual([150, null, 200]);
    expect(items.map((i) => i.isBudgetConflict)).toEqual([false, false, true]);
  });
});
