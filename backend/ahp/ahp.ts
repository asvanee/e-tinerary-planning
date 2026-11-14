// คำนวณน้ำหนัก AHP จากการเปรียบเทียบเป็นคู่ ตาม R.W. Saaty (1987)
// รวมผลกลุ่มและตรวจผู้ตอบที่ CR สูงตาม Battistoni et al. (2013)

export const FACTORS = ["category", "rating", "distance", "budget", "weather"] as const;
export type Factor = (typeof FACTORS)[number];

// คู่ที่ถามในแบบสอบถาม ตามลำดับข้อ 1–10
export const PAIRS: ReadonlyArray<readonly [Factor, Factor]> = [
  ["category", "rating"],
  ["category", "distance"],
  ["category", "budget"],
  ["category", "weather"],
  ["rating", "distance"],
  ["rating", "budget"],
  ["rating", "weather"],
  ["distance", "budget"],
  ["distance", "weather"],
  ["budget", "weather"],
];

// คำตอบ 1 ข้อ: ปัจจัยที่เลือกว่าสำคัญกว่า และสำคัญกว่ากี่เท่า (สเกล 1–9)
export interface PairAnswer {
  winner: Factor;
  intensity: number;
}

// ค่า RI ของเมทริกซ์ 5×5 (Saaty 1987 น. 171)
const RANDOM_INDEX_5 = 1.12;
export const CR_LIMIT = 0.1;

// เมทริกซ์ส่วนกลับ: a[i][j] = ค่าที่ตอบ, a[j][i] = 1 / ค่าที่ตอบ, แนวทแยง = 1
export function buildMatrix(answers: PairAnswer[]): number[][] {
  if (answers.length !== PAIRS.length) throw new Error(`ต้องมีคำตอบ ${PAIRS.length} ข้อ`);
  const n = FACTORS.length;
  const matrix = Array.from({ length: n }, () => Array<number>(n).fill(1));

  answers.forEach(({ winner, intensity }, q) => {
    const [a, b] = PAIRS[q];
    if (winner !== a && winner !== b) throw new Error(`ข้อ ${q + 1}: ตัวเลือกไม่ตรงคู่ ${a}/${b}`);
    if (!Number.isInteger(intensity) || intensity < 1 || intensity > 9) {
      throw new Error(`ข้อ ${q + 1}: ค่าต้องเป็นจำนวนเต็ม 1–9`);
    }
    const i = FACTORS.indexOf(a);
    const j = FACTORS.indexOf(b);
    const value = winner === a ? intensity : 1 / intensity;
    matrix[i][j] = value;
    matrix[j][i] = 1 / value;
  });
  return matrix;
}

// principal eigenvector ด้วย power iteration แล้ว normalize ให้ผลรวม = 1
export function principalEigen(matrix: number[][]): { weights: number[]; lambdaMax: number } {
  const n = matrix.length;
  let w = Array<number>(n).fill(1 / n);

  for (let iter = 0; iter < 1000; iter++) {
    const next = multiply(matrix, w);
    const sum = next.reduce((s, x) => s + x, 0);
    const normalized = next.map((x) => x / sum);
    const diff = Math.max(...normalized.map((x, i) => Math.abs(x - w[i])));
    w = normalized;
    if (diff < 1e-12) break;
  }

  const aw = multiply(matrix, w);
  const lambdaMax = aw.reduce((s, x, i) => s + x / w[i], 0) / n;
  return { weights: w, lambdaMax };
}

function multiply(matrix: number[][], v: number[]): number[] {
  return matrix.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
}

// CI = (λmax − n) / (n − 1) · CR = CI / RI
export function consistency(lambdaMax: number, n: number): { ci: number; cr: number } {
  if (n !== FACTORS.length) throw new Error("มีค่า RI เฉพาะเมทริกซ์ 5×5");
  const ci = (lambdaMax - n) / (n - 1);
  return { ci, cr: ci / RANDOM_INDEX_5 };
}

export interface RespondentResult {
  matrix: number[][];
  weights: number[];
  lambdaMax: number;
  ci: number;
  cr: number;
  passed: boolean;
}

export function evaluateRespondent(answers: PairAnswer[]): RespondentResult {
  const matrix = buildMatrix(answers);
  const { weights, lambdaMax } = principalEigen(matrix);
  const { ci, cr } = consistency(lambdaMax, matrix.length);
  return { matrix, weights, lambdaMax, ci, cr, passed: cr < CR_LIMIT };
}

// AIJ: ค่าเฉลี่ยเรขาคณิตของคำตอบทีละช่อง (ทุกคนมีน้ำหนักเท่ากัน) แล้วหา eigenvector
// ตาม Battistoni et al. (2013) น. 6 · ค่าเฉลี่ยเรขาคณิตคงความเป็นส่วนกลับ (Saaty 1987 น. 174)
export function aggregateAij(matrices: number[][][]): number[] {
  if (matrices.length === 0) throw new Error("ไม่มีผู้ตอบให้รวมผล");
  const n = matrices[0].length;
  const group = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      Math.exp(matrices.reduce((s, m) => s + Math.log(m[i][j]), 0) / matrices.length)
    )
  );
  return principalEigen(group).weights;
}

// Compatibility Index ของ Saaty (1994) น. 52–53 = (1/n²)·Σᵢⱼ (wᵢ/wⱼ)(vⱼ/vᵢ) · เท่ากันพอดี = 1
export const COMPATIBILITY_LIMIT = 1.1;

export function compatibility(w: number[], v: number[]): number {
  const n = w.length;
  let sum = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sum += (w[i] / w[j]) * (v[j] / v[i]);
  return sum / (n * n);
}
