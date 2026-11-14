// รันจาก backend/: npx ts-node ahp/runAhp.ts <ไฟล์คำตอบ.csv> [ไฟล์ผลรายคน.csv]
// ไฟล์คำตอบ = CSV ที่ export จาก Google Form (ไฟล์จริงของแบบสอบถามอยู่ที่ backend/ahp/responses.csv)
import { writeFileSync } from "fs";
import { COMPATIBILITY_LIMIT, FACTORS, aggregateAij, compatibility } from "./ahp";
import { loadRespondents } from "./responses";

// ระดับ CR ที่ใช้แบ่งกลุ่มผู้ตอบ ตาม Battistoni et al. (2013) Table 4
const CR_SUBSETS = [0.1, 0.2, 0.5, 1.0];

function formatWeights(weights: number[]): string {
  return FACTORS.map((f, i) => `${f} ${weights[i].toFixed(4)}`).join(" · ");
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath) throw new Error("ต้องระบุไฟล์คำตอบ .csv");

  const results = loadRespondents(inputPath);
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
