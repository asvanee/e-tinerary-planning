/**
 * คำนวณระยะทางตรง (great-circle distance) ระหว่าง 2 พิกัดด้วยสูตร Haversine
 * หน่วยผลลัพธ์: กิโลเมตร
 *
 * ใช้แทน Google Distance Matrix API เพื่อประหยัด ไม่มีค่าใช้จ่าย ไม่ติด quota
 * (อ้างอิงเหตุผลจาก PROJECT_BRIEF_v4.md ข้อ 4.2 — โปรเจกต์เกิน free tier ของ Google ไปแล้ว)
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