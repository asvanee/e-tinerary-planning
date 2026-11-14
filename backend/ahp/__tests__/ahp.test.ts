import {
  PAIRS,
  aggregateAij,
  buildMatrix,
  compatibility,
  consistency,
  evaluateRespondent,
  principalEigen,
  type PairAnswer,
} from "../ahp";

// ตัวอย่างเลือกมหาวิทยาลัยใน R.W. Saaty (1987) น. 164–165 · ค่าในเปเปอร์ปัด 3 ตำแหน่ง
describe("เทียบกับตัวอย่างใน Saaty (1987)", () => {
  test("เมทริกซ์ LOCATION 5×5 → น้ำหนัก .115/.402/.283/.163/.037, CR .092", () => {
    const location = [
      [1, 1 / 4, 1 / 3, 1 / 3, 7],
      [4, 1, 2, 3, 7],
      [3, 1 / 2, 1, 3, 6],
      [3, 1 / 3, 1 / 3, 1, 4],
      [1 / 7, 1 / 7, 1 / 6, 1 / 4, 1],
    ];
    const { weights, lambdaMax } = principalEigen(location);
    [0.115, 0.402, 0.283, 0.163, 0.037].forEach((w, i) => expect(Math.abs(weights[i] - w)).toBeLessThan(0.0015));
    expect(Math.abs(consistency(lambdaMax, 5).cr - 0.092)).toBeLessThan(0.0015);
  });

  // น. 165 พิมพ์ .213 แต่ น. 166 ใช้ .218 และผลรวมต้องเป็น 1
  test("เมทริกซ์เกณฑ์ 4×4 → น้ำหนัก .053/.491/.238/.218, CR .02", () => {
    const criteria = [
      [1, 1 / 7, 1 / 5, 1 / 5],
      [7, 1, 2, 3],
      [5, 1 / 2, 1, 1],
      [5, 1 / 3, 1, 1],
    ];
    const { weights, lambdaMax } = principalEigen(criteria);
    [0.053, 0.491, 0.238, 0.218].forEach((w, i) => expect(Math.abs(weights[i] - w)).toBeLessThan(0.0015));
    // consistency() มี RI เฉพาะ 5×5 จึงคิด CR ของ 4×4 ตรงนี้ด้วย RI = 0.90 (น. 171)
    expect(Math.abs((lambdaMax - 4) / 3 / 0.9 - 0.02)).toBeLessThan(0.005);
  });
});

// น้ำหนักจริง category .4 · rating .2 · distance .2 · budget .1 · weather .1
// ตอบตามอัตราส่วนพอดีทุกข้อ → เมทริกซ์สอดคล้องสมบูรณ์
const TRUE_WEIGHTS = [0.4, 0.2, 0.2, 0.1, 0.1];
const FACTOR_INDEX = { category: 0, rating: 1, distance: 2, budget: 3, weather: 4 } as const;

const consistentAnswers: PairAnswer[] = PAIRS.map(([a, b]) => {
  const ratio = TRUE_WEIGHTS[FACTOR_INDEX[a]] / TRUE_WEIGHTS[FACTOR_INDEX[b]];
  return ratio >= 1 ? { winner: a, intensity: Math.round(ratio) } : { winner: b, intensity: Math.round(1 / ratio) };
});

describe("buildMatrix", () => {
  test("เป็นเมทริกซ์ส่วนกลับ แนวทแยง = 1", () => {
    const m = buildMatrix(consistentAnswers);
    for (let i = 0; i < 5; i++) {
      expect(m[i][i]).toBe(1);
      for (let j = 0; j < 5; j++) expect(m[i][j] * m[j][i]).toBeCloseTo(1, 12);
    }
  });

  test("เลือกฝั่งขวา → ค่าในช่องเป็นส่วนกลับ", () => {
    const answers = consistentAnswers.map((a) => ({ ...a }));
    answers[0] = { winner: "rating", intensity: 3 };
    expect(buildMatrix(answers)[0][1]).toBeCloseTo(1 / 3, 12);
  });

  test("ตอบ 1 = สำคัญเท่ากัน ไม่ว่าเลือกฝั่งไหน", () => {
    const answers = consistentAnswers.map((a) => ({ ...a }));
    answers[0] = { winner: "rating", intensity: 1 };
    expect(buildMatrix(answers)[0][1]).toBe(1);
  });

  test("ตัวเลือกไม่ตรงคู่หรือค่านอก 1–9 → error", () => {
    const wrongSide = consistentAnswers.map((a) => ({ ...a }));
    wrongSide[0] = { winner: "weather", intensity: 3 };
    expect(() => buildMatrix(wrongSide)).toThrow();

    const outOfScale = consistentAnswers.map((a) => ({ ...a }));
    outOfScale[0] = { winner: "category", intensity: 10 };
    expect(() => buildMatrix(outOfScale)).toThrow();
  });
});

describe("evaluateRespondent", () => {
  test("ตอบสอดคล้องสมบูรณ์ → ได้น้ำหนักจริง, λmax = 5, CR = 0", () => {
    const r = evaluateRespondent(consistentAnswers);
    r.weights.forEach((w, i) => expect(w).toBeCloseTo(TRUE_WEIGHTS[i], 10));
    expect(r.lambdaMax).toBeCloseTo(5, 10);
    expect(r.cr).toBeCloseTo(0, 10);
    expect(r.passed).toBe(true);
  });

  test("ตอบขัดกันเอง (หมวด > รีวิว > ระยะทาง แต่ระยะทาง > หมวด มาก) → CR ≥ 0.10", () => {
    const answers = consistentAnswers.map((a) => ({ ...a }));
    answers[0] = { winner: "category", intensity: 9 };
    answers[4] = { winner: "rating", intensity: 9 };
    answers[1] = { winner: "distance", intensity: 9 };
    const r = evaluateRespondent(answers);
    expect(r.cr).toBeGreaterThanOrEqual(0.1);
    expect(r.passed).toBe(false);
  });
});

// เมทริกซ์ที่สอดคล้องสมบูรณ์จากน้ำหนัก w: a[i][j] = wᵢ/wⱼ
const ratioMatrix = (w: number[]) => w.map((wi) => w.map((wj) => wi / wj));

describe("aggregateAij", () => {
  test("ทุกคนตอบเหมือนกัน → ได้น้ำหนักเดิม", () => {
    const m = ratioMatrix(TRUE_WEIGHTS);
    aggregateAij([m, m]).forEach((w, i) => expect(w).toBeCloseTo(TRUE_WEIGHTS[i], 10));
  });

  test("ค่าเฉลี่ยเรขาคณิตของ 2 เมทริกซ์ที่สอดคล้อง → น้ำหนัก ∝ √(wᵢ·vᵢ)", () => {
    const w = [0.4, 0.3, 0.2, 0.1];
    const v = [0.1, 0.2, 0.3, 0.4];
    const g = w.map((wi, i) => Math.sqrt(wi * v[i]));
    const sum = g.reduce((s, x) => s + x, 0);
    aggregateAij([ratioMatrix(w), ratioMatrix(v)]).forEach((x, i) => expect(x).toBeCloseTo(g[i] / sum, 10));
  });
});

describe("compatibility", () => {
  test("เวกเตอร์เดียวกัน → 1", () => {
    expect(compatibility(TRUE_WEIGHTS, TRUE_WEIGHTS)).toBeCloseTo(1, 12);
  });

  // ตัวอย่างใน Saaty (1994) น. 54–55 · ข้อสุดท้ายเปเปอร์พิมพ์ผลรวม 22.99 (1.437)
  // แต่เมทริกซ์ที่แสดงใน น. 55 รวมได้ 23.30 → ใช้ค่าที่คำนวณจริง 23.32/16 = 1.457 (ยังไม่ผ่าน 1.1 เหมือนเดิม)
  test.each([
    ["[4,2,1]/7 กับ [3,1,.6]/4.6", [4 / 7, 2 / 7, 1 / 7], [3 / 4.6, 1 / 4.6, 0.6 / 4.6], 1.028],
    ["[4,2,1]/7 กับ [9,3,1]/13", [4 / 7, 2 / 7, 1 / 7], [9 / 13, 3 / 13, 1 / 13], 1.114],
    ["[.05,.15,.30,.50] กับ [.08,.22,.25,.45]", [0.05, 0.15, 0.3, 0.5], [0.08, 0.22, 0.25, 0.45], 1.085],
    ["[.05,.15,.30,.50] กับ [.03,.25,.10,.62]", [0.05, 0.15, 0.3, 0.5], [0.03, 0.25, 0.1, 0.62], 1.457],
  ])("Saaty (1994): %s → %p", (_label, w, v, expected) => {
    expect(Math.abs(compatibility(w, v) - expected)).toBeLessThan(0.0015);
  });

  // น้ำหนักจาก Battistoni et al. (2013) Table 6 (ปัด 1 ตำแหน่ง %) → Comp ใน Table 5
  test.each([
    ["Group 1 CR ≤ 0.1 กับทุกคน", [0.37, 0.35, 0.156, 0.124], [0.383, 0.39, 0.108, 0.119], 0.0331],
    ["Group 2 CR ≤ 0.1 กับทุกคน", [0.403, 0.301, 0.13, 0.166], [0.401, 0.313, 0.119, 0.167], 0.0022],
    ["Group 1 กับ Group 2 ที่ CR ≤ 0.5", [0.408, 0.403, 0.087, 0.102], [0.401, 0.32, 0.119, 0.159], 0.0736],
  ])("Battistoni (2013): %s → ส่วนต่าง %p", (_label, w, v, expected) => {
    expect(Math.abs(compatibility(w, v) - 1 - expected)).toBeLessThan(0.001);
  });
});
