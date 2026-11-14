// อ่านไฟล์คำตอบแบบสอบถาม AHP (CSV ที่ export จาก Google Form) เป็นผลรายคน
// ใช้ร่วมกันระหว่าง runAhp.ts และ reportExample.ts
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { PAIRS, evaluateRespondent, type Factor, type PairAnswer, type RespondentResult } from "./ahp";

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

// อ่านไฟล์คำตอบ แล้วคำนวณเมทริกซ์ น้ำหนัก และ CR ของผู้ตอบแต่ละคน
export function loadRespondents(path: string): RespondentResult[] {
  const rows: Record<string, string>[] = parse(readFileSync(path, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  });
  const header = Object.keys(rows[0] ?? {});
  return rows.map((row, i) => evaluateRespondent(readAnswers(row, header, i + 1)));
}
