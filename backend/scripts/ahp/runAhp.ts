// รันจาก backend/: npx ts-node scripts/ahp/runAhp.ts <ไฟล์คำตอบ.csv> [ไฟล์ผลรายคน.csv]
// ไฟล์คำตอบ = CSV ที่ export จาก Google Form (ไม่เก็บไว้ใน repo)
import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import {
  COMPATIBILITY_LIMIT,
  FACTORS,
  PAIRS,
  aggregateAij,
  compatibility,
  evaluateRespondent,
  type Factor,
  type PairAnswer,
} from "./ahp";

// ระดับ CR ที่ใช้แบ่งกลุ่มผู้ตอบ ตาม Battistoni et al. (2013) Table 4
const CR_SUBSETS = [0.1, 0.2, 0.5, 1.0];

// ข้อความตัวเลือกในฟอร์ม → ปัจจัยในสูตร POI
const LABELS: Record<string, Factor> = {
  "หมวดหมู่": "category",
  "คะแนนรีวิว": "rating",
  "ระยะทาง": "distance",
  "งบประมาณ": "budget",
  "สภาพอากาศ": "weather",
};

// คอลัมน์ข้อ q: "<q>.1 …ปัจจัยไหนสำคัญกว่า" และ "<q>.2 สำคัญกว่ามากแค่ไหน"
function readAnswers(row: Record<string, string>, header: string[], rowNo: number): PairAnswer[] {
  return PAIRS.map((_, q) => {
    const choiceCol = header.find((h) => h.startsWith(`${q + 1}.1 `));
    const scaleCol = header.find((h) => h.startsWith(`${q + 1}.2 `));
    if (!choiceCol || !scaleCol) throw new Error(`ไม่พบคอลัมน์ข้อ ${q + 1}`);
    const winner = LABELS[row[choiceCol].trim()];
    if (!winner) throw new Error(`แถว ${rowNo} ข้อ ${q + 1}: ไม่รู้จักตัวเลือก "${row[choiceCol]}"`);
    return { winner, intensity: Number(row[scaleCol]) };
  });
}

function formatWeights(weights: number[]): string {
  return FACTORS.map((f, i) => `${f} ${weights[i].toFixed(4)}`).join(" · ");
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) throw new Error("ต้องระบุไฟล์คำตอบ .csv");

  const rows: Record<string, string>[] = parse(readFileSync(inputPath, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  });
  const header = Object.keys(rows[0] ?? {});
  const results = rows.map((row, i) => evaluateRespondent(readAnswers(row, header, i + 1)));
  const passed = results.filter((r) => r.passed);
  const allWeights = aggregateAij(results.map((r) => r.matrix));

  console.info(`ผู้ตอบ ${results.length} คน · CR < 0.10 ผ่าน ${passed.length} คน · ไม่ผ่าน ${results.length - passed.length} คน`);
  console.info(`น้ำหนัก (ทุกคน): ${formatWeights(allWeights)}`);

  // เทียบกลุ่มที่ CR ≤ x กับทุกคน (Battistoni et al. 2013 น. 5–6) · Comp ≤ 1.1 ถือว่าใกล้กันพอ
  for (const x of CR_SUBSETS) {
    const subset = results.filter((r) => r.cr <= x);
    if (subset.length === 0) {
      console.info(`CR ≤ ${x}: 0 คน`);
      continue;
    }
    const weights = aggregateAij(subset.map((r) => r.matrix));
    const comp = compatibility(weights, allWeights);
    const verdict = comp <= COMPATIBILITY_LIMIT ? "ผ่าน" : "ไม่ผ่าน";
    console.info(`CR ≤ ${x}: ${subset.length} คน · ${formatWeights(weights)} · Comp ${comp.toFixed(4)} ${verdict}`);
  }

  if (outputPath) {
    const lines = [
      ["row", ...FACTORS, "lambda_max", "ci", "cr", "passed"].join(","),
      ...results.map((r, i) =>
        [i + 1, ...r.weights.map((w) => w.toFixed(6)), r.lambdaMax.toFixed(6), r.ci.toFixed(6), r.cr.toFixed(6), r.passed].join(",")
      ),
    ];
    writeFileSync(outputPath, lines.join("\r\n") + "\r\n", "utf8");
    console.info(`บันทึกผลรายคนที่ ${outputPath}`);
  }
}

main();
