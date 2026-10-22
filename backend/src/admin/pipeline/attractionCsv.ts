import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { AttractionRow } from "./attractionTypes";

export const ATTRACTION_CSV_PATH = path.join(__dirname, "../../../data/attraction.csv");

// ไฟล์ใหญ่ (~20 MB) อ่านและ parse ครั้งเดียวแล้ว cache ไว้ใน memory ของ process
let cachedRows: Promise<AttractionRow[]> | null = null;

async function readRows(): Promise<AttractionRow[]> {
  const content = await fs.promises.readFile(ATTRACTION_CSV_PATH, "utf8");
  // ตัวเลือกเดียวกับ data-pipeline เดิม — relax_quotes เพราะคำบรรยายภาษาไทยมี " ปนอยู่
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_quotes: true,
  }) as AttractionRow[];
  // แถวที่ไม่มีชื่อจังหวัด (12 แถว) ใช้ไม่ได้ ตัดทิ้งตั้งแต่ตอนโหลด
  return rows.filter((row) => row.PROVINCE_NAME_TH?.trim());
}

export function loadAttractionRows(): Promise<AttractionRow[]> {
  if (!cachedRows) {
    cachedRows = readRows().catch((err) => {
      cachedRows = null; // อ่านไม่สำเร็จ ให้ลองใหม่ได้ในครั้งถัดไป
      throw err;
    });
  }
  return cachedRows;
}

export async function getProvinceRows(province: string): Promise<AttractionRow[]> {
  const rows = await loadAttractionRows();
  return rows.filter((row) => row.PROVINCE_NAME_TH.trim() === province);
}

// รายชื่อจังหวัดใน CSV พร้อมจำนวนแถว เรียงตามตัวอักษรไทย
export async function listCsvProvinces(): Promise<{ province: string; rowCount: number }[]> {
  const counts = new Map<string, number>();
  for (const row of await loadAttractionRows()) {
    const province = row.PROVINCE_NAME_TH.trim();
    counts.set(province, (counts.get(province) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([province, rowCount]) => ({ province, rowCount }))
    .sort((a, b) => a.province.localeCompare(b.province, "th"));
}
