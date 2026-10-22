// แถวหนึ่งของ data/attraction.csv (ข้อมูลสถานที่ท่องเที่ยวจาก ททท.)
// csv-parse คืนทุกคอลัมน์เป็น string — ระบุชื่อเฉพาะคอลัมน์ที่โค้ดอ่านตรงๆ
// คอลัมน์อื่น (ATT_DETAIL_TH, ATT_FACEBOOK ฯลฯ) เข้าถึงผ่าน index signature (merge เลือกค่าได้ทุกช่อง — D-26)
export interface AttractionRow {
  [column: string]: string;
  ATT_ID: string;
  ATT_NAME_TH: string;
  ATT_NAME_EN: string;
  ATT_LOCATION: string; // "lat, lng" (บางแถวพังหรือเป็น Google Maps short link)
  ATT_TEL: string;
  ATT_WEBSITE: string;
  ATT_STATUS: string; // "1" = ปกติ · ค่าอื่นมักมีเหตุผลใน ATT_STATUS_REMARK
  ATT_STATUS_REMARK: string;
  PROVINCE_NAME_TH: string;
  DISTRICT_NAME_TH: string;
}
