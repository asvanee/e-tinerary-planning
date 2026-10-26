import { calculateCategoryScore, calculatePoiScore } from "../poiScoreCalculator";

// rating 4, ระยะ 1 กม., ไม่มีพยากรณ์ฝน (weather 1.0), ไม่ใช้งบ
function scoreWith(categoryMatch: boolean | null) {
  return calculatePoiScore(categoryMatch, 4, 1, null, null, "free", false, "MIXED", null);
}

describe("calculateCategoryScore (D-48)", () => {
  test.each([
    ["ตรงหมวดที่เลือก", true, 1],
    ["ไม่ตรงหมวดที่เลือก", false, 0],
    ["ไม่ได้เลือกหมวด", null, null],
  ])("%s → %p", (_label, match, expected) => {
    expect(calculateCategoryScore(match)).toBe(expected);
  });
});

describe("calculatePoiScore กับ category score (D-48)", () => {
  const rating = 4 / 5;
  const distance = 1 / (1 + 1);
  const weather = 1;

  test("ตรงหมวด → คะแนนเท่าสูตรเดิม (category 1.0, ไม่ใช้งบ: weight หาร 0.85)", () => {
    const expected = (0.35 * 1 + 0.25 * rating + 0.15 * distance + 0.1 * weather) / 0.85;
    expect(scoreWith(true).poiScore).toBeCloseTo(expected, 10);
  });

  test("ไม่ตรงหมวด → ต่ำกว่าตรงหมวดเท่ากับ weight ของ category พอดี", () => {
    expect(scoreWith(true).poiScore - scoreWith(false).poiScore).toBeCloseTo(0.35 / 0.85, 10);
    expect(scoreWith(false).categoryScore).toBe(0);
  });

  test("ไม่ได้เลือกหมวด → ตัด category ออก แบ่ง weight คืนให้ rating/distance/weather", () => {
    const result = scoreWith(null);
    const expected = (0.25 * rating + 0.15 * distance + 0.1 * weather) / 0.5;
    expect(result.categoryScore).toBeNull();
    expect(result.poiScore).toBeCloseTo(expected, 10);
  });

  test("ไม่ได้เลือกหมวด + ใช้งบ (free มีราคาจริง) → weight รวมยังเป็น 1", () => {
    const result = calculatePoiScore(null, 5, 0, 1000, 0, "free", true, "INDOOR", null);
    // ทุกด้านได้เต็ม ยกเว้น price (free + ราคาจริง = 0.9 ที่ weight 0.15)
    expect(result.poiScore).toBeCloseTo(0.85 + 0.15 * 0.9, 10);
  });
});

describe("calculatePoiScore กับงบต่อคน (D-51)", () => {
  test("daily_budget เป็นงบต่อคนแล้ว → perPersonDailyBudget ไม่หารจำนวนคนซ้ำ", () => {
    const result = calculatePoiScore(true, 4, 1, 1000, 2, "paid", true, "MIXED", null);
    expect(result.perPersonDailyBudget).toBe(1000);
    expect(result.placeCost).toBe(450);
  });

  test("ไม่ตั้งงบ → perPersonDailyBudget เป็น null", () => {
    expect(scoreWith(true).perPersonDailyBudget).toBeNull();
  });
});
