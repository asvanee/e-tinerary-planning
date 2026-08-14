export interface TspPlace {
  place_id: string;
  place_name: string;
  latitude: number;
  longitude: number;
}

export interface TspResult {
  places: TspPlace[];
  totalDistanceKm: number;
}

/**
 * คำนวณระยะทางระหว่างสถานที่ 2 จุด
 * ใช้สูตร Haversine (ผลลัพธ์เป็นกิโลเมตร)
 */
export function calculateDistanceKm(
  from: TspPlace,
  to: TspPlace
): number {
  const R = 6371; // รัศมีของโลก (กม.)

  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;

  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  // ✅ ป้องกันปัญหา floating point เกิน 1 ซึ่งทำให้ Math.sqrt(1 - a) ได้ NaN
  const safeA = Math.min(1, Math.max(0, a));

  const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));

  return R * c;
}

/**
 * Traveling Salesman Problem
 * วิธีที่ใช้: Nearest Neighbor
 */
export function nearestNeighborTsp(
  places: TspPlace[],
  startPlace: TspPlace
): TspResult {
  if (places.length === 0) {
    return {
      places: [],
      totalDistanceKm: 0,
    };
  }

  // เอาสถานที่ที่มี ID ตรงกับ startPlace ออกจากรายการที่จะวนลูป
  const remaining = places.filter(
    (place) => place.place_id !== startPlace.place_id
  );

  const route: TspPlace[] = [startPlace];
  let current = startPlace;
  let totalDistanceKm = 0;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const distance = calculateDistanceKm(current, remaining[i]);

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    const nearestPlace = remaining.splice(nearestIndex, 1)[0];
    route.push(nearestPlace);
    totalDistanceKm += nearestDistance;
    current = nearestPlace;
  }

  return {
    places: route,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
  };
}