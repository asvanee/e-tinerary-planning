import { AttractionRow } from "../attractionTypes";

// สร้างแถว CSV สำหรับ unit test (อยู่นอก __tests__ เพราะ jest ถือทุกไฟล์ใน __tests__ เป็น test suite)
export function makeRow(id: string, fields: Partial<AttractionRow> = {}): AttractionRow {
  return {
    ATT_ID: id,
    ATT_NAME_TH: `สถานที่ ${id}`,
    ATT_NAME_EN: "",
    ATT_LOCATION: "",
    ATT_TEL: "",
    ATT_WEBSITE: "",
    ATT_STATUS: "1",
    ATT_STATUS_REMARK: "",
    PROVINCE_NAME_TH: "ทดลอง",
    DISTRICT_NAME_TH: "",
    ...fields,
  };
}
