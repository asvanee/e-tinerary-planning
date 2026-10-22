// ค่าของหมวด (ตาราง categories — D-39) ที่ทั้งหน้าผู้ใช้และหน้า admin ใช้ร่วมกัน

// กลุ่มใหญ่ของ ททท. (categories.parent_group) เรียงตามลำดับที่แสดง
export const CATEGORY_GROUPS = [
  { value: "HISTORY_CULTURE", label: "ประวัติศาสตร์และวัฒนธรรม" },
  { value: "NATURE", label: "ธรรมชาติ" },
  { value: "RECREATION", label: "กิจกรรมพิเศษและนันทนาการ" },
];

// categories.environment_type — ใช้คิดคะแนนสภาพอากาศ
export const ENVIRONMENT_TYPES = [
  { value: "INDOOR", label: "ในร่ม" },
  { value: "OUTDOOR", label: "กลางแจ้ง" },
  { value: "MIXED", label: "ผสม" },
];

// categories.price_nature — free = คิดค่าเข้า 0 บาทในงบ
export const PRICE_NATURES = [
  { value: "free", label: "ฟรี" },
  { value: "paid", label: "เสียค่าใช้จ่าย" },
];
