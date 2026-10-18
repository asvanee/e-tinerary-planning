// แถวหนึ่งของ data/attraction.csv (ข้อมูลสถานที่ท่องเที่ยวจาก ททท.)
// csv-parse คืนทุกคอลัมน์เป็น string — ประกาศไว้เฉพาะคอลัมน์ที่ pipeline ใช้
export interface AttractionRow {
  ATT_ID: string;
  ATT_NAME_TH: string;
  ATT_NAME_EN: string;
  ATT_LOCATION: string; // "lat, lng" (บางแถวพังหรือเป็น Google Maps short link)
  ATT_TEL: string;
  ATT_WEBSITE: string;
  PROVINCE_NAME_TH: string;
  DISTRICT_NAME_TH: string;
}
