import { WEIGHTS, calculateCategoryScore, calculatePoiScore, calculatePriceScore } from "../poiScoreCalculator";

const { category: C, rating: R, distance: D, budget: B, weather: W } = WEIGHTS;

describe("น้ำหนักจาก AHP", () => {
  test("ตรงกับผลแบบสอบถาม 42 คน และรวมเป็น 1", () => {
    expect(WEIGHTS).toEqual({ category: 0.1421, rating: 0.0869, distance: 0.1637, budget: 0.3926, weather: 0.2147 });
    expect(C + R + D + B + W).toBeCloseTo(1, 10);
  });
});

// rating 4, ระยะ 1 กม., ไม่มีพยากรณ์ฝน (weather 1.0), ไม่ใช้งบ
function scoreWith(categoryMatch: boolean | null) {
  return calculatePoiScore(categoryMatch, 4, 1, null, null, null, "free", false, "MIXED", null);
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

  test("ตรงหมวด (category 1.0, ไม่ใช้งบ: weight หาร 1 − budget)", () => {
    const expected = (C * 1 + R * rating + D * distance + W * weather) / (1 - B);
    expect(scoreWith(true).poiScore).toBeCloseTo(expected, 10);
  });

  test("ไม่ตรงหมวด → ต่ำกว่าตรงหมวดเท่ากับ weight ของ category พอดี", () => {
    expect(scoreWith(true).poiScore - scoreWith(false).poiScore).toBeCloseTo(C / (1 - B), 10);
    expect(scoreWith(false).categoryScore).toBe(0);
  });

  test("ไม่ได้เลือกหมวด → ตัด category ออก แบ่ง weight คืนให้ rating/distance/weather", () => {
    const result = scoreWith(null);
    const expected = (R * rating + D * distance + W * weather) / (R + D + W);
    expect(result.categoryScore).toBeNull();
    expect(result.poiScore).toBeCloseTo(expected, 10);
  });

  test("ไม่ได้เลือกหมวด + ใช้งบ (ฟรี) → weight รวมยังเป็น 1", () => {
    const result = calculatePoiScore(null, 5, 0, 1000, null, null, "free", true, "INDOOR", null);
    // ทุกด้านได้เต็ม รวม price (ฟรี = 1)
    expect(result.poiScore).toBeCloseTo(1, 10);
  });
});

describe("calculatePoiScore เมื่อไม่มี rating (D-57)", () => {
  const distance = 1 / (1 + 1);
  const weather = 1;

  test("ไม่มี rating → ตัดรีวิวออก แบ่ง weight คืนให้ category/distance/weather", () => {
    const result = calculatePoiScore(true, null, 1, null, null, null, "free", false, "MIXED", null);
    const expected = (C * 1 + D * distance + W * weather) / (C + D + W);
    expect(result.ratingScore).toBeNull();
    expect(result.poiScore).toBeCloseTo(expected, 10);
  });

  test("ไม่มี rating + รู้ราคา → price weight ยังเท่า WEIGHTS.budget", () => {
    const result = calculatePoiScore(true, null, 0, 1000, 1, 200, "paid", true, "INDOOR", null);
    // category/distance/weather ได้เต็มทั้งหมด → รวม 1 − budget · price 0.8
    expect(result.poiScore).toBeCloseTo(1 - B + B * 0.8, 10);
  });

  test("ไม่มี rating + ไม่ได้เลือกหมวด → weight ที่เหลือรวมเป็น 1", () => {
    const result = calculatePoiScore(null, null, 0, null, null, null, "free", false, "INDOOR", null);
    expect(result.poiScore).toBeCloseTo(1, 10);
  });
});

describe("calculatePoiScore กับงบต่อคน (D-51)", () => {
  test("daily_budget เป็นงบต่อคนแล้ว → perPersonDailyBudget ไม่หารจำนวนคนซ้ำ", () => {
    const result = calculatePoiScore(true, 4, 1, 1000, 1, 200, "paid", true, "MIXED", null);
    expect(result.perPersonDailyBudget).toBe(1000);
    expect(result.placeCost).toBe(200);
  });

  test("ไม่ตั้งงบ → perPersonDailyBudget เป็น null", () => {
    expect(scoreWith(true).perPersonDailyBudget).toBeNull();
  });
});

describe("price score จาก priceRange เทียบงบต่อคน (D-52)", () => {
  test.each([
    ["ฟรี", 0, 1000, 1],
    ["ครึ่งหนึ่งของงบ", 500, 1000, 0.5],
    ["เท่างบพอดี", 1000, 1000, 0],
    ["แพงกว่างบ (cap ที่ 0)", 1500, 1000, 0],
    ["ไม่ทราบราคา → ไม่คิด", null, 1000, null],
    ["งบ 0 กับที่ฟรี", 0, 0, 1],
  ])("%s", (_label, cost, budget, expected) => {
    expect(calculatePriceScore(cost, budget)).toBe(expected);
  });

  test("ไม่ทราบราคา (paid ไม่มี priceRange) → ตัดมิติราคา ได้คะแนนเท่าไม่ตั้งงบ", () => {
    const withBudget = calculatePoiScore(true, 4, 1, 1000, null, null, "paid", true, "MIXED", null);
    const noBudget = calculatePoiScore(true, 4, 1, null, null, null, "paid", false, "MIXED", null);
    expect(withBudget.budgetScore).toBeNull();
    expect(withBudget.poiScore).toBeCloseTo(noBudget.poiScore, 10);
  });

  test("รู้ราคา → price weight เท่า WEIGHTS.budget ใช้ขอบบนของ priceRange", () => {
    const result = calculatePoiScore(true, 5, 0, 1000, 1, 200, "paid", true, "INDOOR", null);
    expect(result.budgetScore).toBeCloseTo(0.8, 10);
    expect(result.poiScore).toBeCloseTo(1 - B + B * 0.8, 10);
  });
});
