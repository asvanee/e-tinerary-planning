/**
 * คำนวณระยะทางตรง (great-circle distance) ระหว่าง 2 พิกัดด้วยสูตร Haversine
 * หน่วยผลลัพธ์: กิโลเมตร
 *
 * Port จาก backend/src/utils/haversine.ts — logic เดิม 100% (pure function ไม่มี dependency
 * ฝั่ง Node) ใช้ตอน recompute client-side ในหน้า itinerary editor ให้ตรงกับที่ backend
 * re-validate ซ้ำก่อน save (ดูมติ "recompute logic ฝั่ง frontend" ใน itineraries_feature_status.md
 * — port เป็น TS แยกฝั่ง frontend ไม่แชร์ package เดียวกัน)
 *
 * ⚠️ ถ้าแก้สูตรนี้ฝั่ง backend ต้องแก้ไฟล์นี้คู่กันเสมอ ไม่งั้นผลคำนวณระยะทาง/เวลาเดินทาง
 * จะเพี้ยนกันระหว่างตอน user ลากปรับ (client) กับตอนกดยืนยันแผน (backend re-validate)
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}