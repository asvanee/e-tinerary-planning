/**
 * ระยะทางตรง (great-circle distance) ระหว่าง 2 พิกัดด้วยสูตร Haversine หน่วยกิโลเมตร
 * ใช้เป็น fallback เมื่อไม่มีระยะทางจาก ORS
 *
 * ⚠️ frontend port (frontend/src/features/trip/e-tinerary/lib/haversine.ts) ต้องตรงกันทุกบรรทัด
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