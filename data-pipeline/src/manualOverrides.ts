export interface LocationOverride {
  lat: number;
  lng: number;
  source: string;
}

export const locationOverrides: Record<string, LocationOverride> = {
  // ของเดิมทั้งหมด
};


// ✅ ส่วนที่คุณส่งมา ใส่ไว้ตรงนี้
export const forceMergeGroups: string[][] = [
  [
    "20100518224629675",
    "20241220131515001",
    "20241220131453001",
    "20241220130749001",
  ],

  [
    "20160528174922008571",
    "2015120421550717990",
  ],

  [
    "201005182246293199",
    "2015120421550718071",
  ],

  [
    "201005182246293395",
    "201005182246293300",
  ],
];


export const excludeIds: string[] = [
  "20241012015029001",
];


// ⚠️ ของเดิมเชียงใหม่ต้องอยู่ครบ ห้ามลบ
export const blockedMergePairs: [string, string][] = [
  // ... รายการเดิมทั้งหมดของเชียงใหม่
];