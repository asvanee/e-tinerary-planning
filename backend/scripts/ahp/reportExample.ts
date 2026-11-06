// ตัวอย่างการคำนวณสำหรับเล่มรายงาน (แคปหน้าจอ terminal ไปใส่เล่ม)
// รันจาก backend/: npx ts-node scripts/ahp/reportExample.ts
import { FACTORS, buildMatrix, consistency, principalEigen, type Factor, type PairAnswer } from "./ahp";
import {
  WEIGHTS,
  calculateCategoryScore,
  calculateDistanceScore,
  calculatePoiScore,
  calculatePriceScore,
  calculateRatingScore,
  calculateWeatherScore,
} from "../../src/features/poi/poiScoreCalculator";

const NAME: Record<Factor, string> = {
  category: "หมวด",
  rating: "รีวิว",
  distance: "ระยะทาง",
  budget: "ราคาเทียบงบ",
  weather: "อากาศ",
};

const fraction = (x: number): string => {
  if (Math.abs(x - 1) < 1e-9) return "1";
  if (x > 1) return String(Math.round(x));
  return `1/${Math.round(1 / x)}`;
};

// ผู้ตอบ 1 คน (แถวที่ 7 ของไฟล์คำตอบ — CR ต่ำที่สุดใน 42 คน) ตามข้อ 9 ของ docs/AHP_POI_WEIGHTS.md
const answers: PairAnswer[] = [
  { winner: "category", intensity: 3 }, // หมวด – รีวิว
  { winner: "distance", intensity: 3 }, // หมวด – ระยะทาง
  { winner: "budget", intensity: 1 }, // หมวด – งบ
  { winner: "weather", intensity: 5 }, // หมวด – อากาศ
  { winner: "distance", intensity: 1 }, // รีวิว – ระยะทาง
  { winner: "budget", intensity: 3 }, // รีวิว – งบ
  { winner: "weather", intensity: 3 }, // รีวิว – อากาศ
  { winner: "budget", intensity: 3 }, // ระยะทาง – งบ
  { winner: "weather", intensity: 3 }, // ระยะทาง – อากาศ
  { winner: "weather", intensity: 3 }, // งบ – อากาศ
];

function part1() {
  const matrix = buildMatrix(answers);
  const { weights, lambdaMax } = principalEigen(matrix);
  const { ci, cr } = consistency(lambdaMax, matrix.length);

  console.info("========== ส่วนที่ 1: AHP ของผู้ตอบ 1 คน ==========");
  console.info("\n1) เมทริกซ์เปรียบเทียบเป็นคู่ (แถว เทียบกับ คอลัมน์)");
  console.info(["              ", ...FACTORS.map((f) => NAME[f].padEnd(14))].join(""));
  matrix.forEach((row, i) =>
    console.info([NAME[FACTORS[i]].padEnd(14), ...row.map((v) => fraction(v).padEnd(14))].join(""))
  );

  console.info("\n2) น้ำหนักจาก principal eigenvector และการตรวจความสอดคล้อง");
  console.info(["ปัจจัย".padEnd(14), "w".padEnd(14), "Aw".padEnd(14), "Aw/w"].join(""));
  matrix.forEach((row, i) => {
    const aw = row.reduce((sum, v, j) => sum + v * weights[j], 0);
    console.info(
      [NAME[FACTORS[i]].padEnd(14), weights[i].toFixed(4).padEnd(14), aw.toFixed(4).padEnd(14), (aw / weights[i]).toFixed(4)].join("")
    );
  });
  console.info(`\nλmax = ${lambdaMax.toFixed(4)}`);
  console.info(`CI = (λmax − n) / (n − 1) = (${lambdaMax.toFixed(4)} − 5) / 4 = ${ci.toFixed(4)}`);
  console.info(`CR = CI / RI = ${ci.toFixed(4)} / 1.12 = ${cr.toFixed(4)}  (${cr < 0.1 ? "ผ่าน" : "ไม่ผ่าน"}เกณฑ์ 0.10)`);
}

// เมทริกซ์รวมของกลุ่ม 42 คน (ค่าเฉลี่ยเรขาคณิตทีละช่อง — ข้อ 4.3 ของ docs/AHP_POI_WEIGHTS.md)
function part2() {
  const m = [
    [1, 2.711, 0.623, 0.295, 0.606],
    [0.369, 1, 0.612, 0.272, 0.451],
    [1.605, 1.633, 1, 0.363, 0.744],
    [3.389, 3.671, 2.756, 1, 1.677],
    [1.65, 2.215, 1.344, 0.596, 1],
  ];
  const { weights, lambdaMax } = principalEigen(m);
  const { cr } = consistency(lambdaMax, 5);

  console.info("\n\n========== ส่วนที่ 2: น้ำหนักของกลุ่มผู้ตอบ 42 คน ==========");
  console.info("(เมทริกซ์รวมแบบค่าเฉลี่ยเรขาคณิต AIJ — ตัวเลขในเมทริกซ์ปัดเป็น 3 ตำแหน่ง)");
  console.info(["\nปัจจัย".padEnd(14), "น้ำหนัก"].join(""));
  FACTORS.forEach((f, i) => console.info([NAME[f].padEnd(14), weights[i].toFixed(4)].join("")));
  console.info(`\nλmax = ${lambdaMax.toFixed(3)} · CR = ${cr.toFixed(3)}`);
  console.info("\nน้ำหนักที่ใช้ในระบบจริง (WEIGHTS ใน poiScoreCalculator.ts):");
  FACTORS.forEach((f) => console.info(`${NAME[f].padEnd(14)}${WEIGHTS[f].toFixed(4)}`));
  console.info(`รวม = ${Object.values(WEIGHTS).reduce((a, b) => a + b, 0).toFixed(4)}`);
}

// สถานที่สมมติ 1 แห่ง ใช้อธิบายสูตรเท่านั้น (ไม่ใช่ข้อมูลจริง)
function part3() {
  const input = {
    categoryMatch: true,
    rating: 4.5,
    distanceKm: 3,
    dailyBudget: 500,
    priceStart: 100,
    priceEnd: 100,
    environment: "OUTDOOR" as const,
    rainPct: 40,
  };
  const category = calculateCategoryScore(input.categoryMatch)!;
  const rating = calculateRatingScore(input.rating)!;
  const distance = calculateDistanceScore(input.distanceKm);
  const budget = calculatePriceScore(input.priceEnd, input.dailyBudget)!;
  const weather = calculateWeatherScore(input.environment, input.rainPct);

  const result = calculatePoiScore(
    input.categoryMatch,
    input.rating,
    input.distanceKm,
    input.dailyBudget,
    input.priceStart,
    input.priceEnd,
    "paid",
    true,
    input.environment,
    input.rainPct
  );

  console.info("\n\n========== ส่วนที่ 3: ตัวอย่างคำนวณ POI Score ของสถานที่ 1 แห่ง ==========");
  console.info("สมมติ: ตรงหมวดที่เลือก · รีวิว 4.5 · ห่างจุดเริ่มต้น 3 กม. · ราคา 100 บาท/คน · งบ 500 บาท/คน/วัน");
  console.info("       กลางแจ้ง · โอกาสฝน 40%\n");
  console.info(`Category Score = 1 (ตรงหมวด)                           = ${category.toFixed(4)}`);
  console.info(`Rating Score   = 4.5 / 5                                = ${rating.toFixed(4)}`);
  console.info(`Distance Score = 1 / (1 + 3)                            = ${distance.toFixed(4)}`);
  console.info(`Budget Score   = 1 − 100 / 500                          = ${budget.toFixed(4)}`);
  console.info(`Weather Score  = 1 × (1 − 0.40) + (1 − 1) × 1           = ${weather.toFixed(4)}`);
  console.info("\nPOI Score = (0.1421 × Category) + (0.0869 × Rating) + (0.1637 × Distance)");
  console.info("          + (0.3926 × Budget) + (0.2147 × Weather)");
  console.info(
    `          = (0.1421 × ${category.toFixed(4)}) + (0.0869 × ${rating.toFixed(4)}) + (0.1637 × ${distance.toFixed(4)})`
  );
  console.info(`          + (0.3926 × ${budget.toFixed(4)}) + (0.2147 × ${weather.toFixed(4)})`);
  console.info(`          = ${result.poiScore.toFixed(4)}`);
}

part1();
part2();
part3();
