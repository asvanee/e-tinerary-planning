import { haversineKm } from "../../utils/haversine";

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

// ระยะเส้นตรงระหว่าง 2 สถานที่ (กม.)
export function calculateDistanceKm(from: TspPlace, to: TspPlace): number {
  return haversineKm(from.latitude, from.longitude, to.latitude, to.longitude);
}

// เรียงเส้นทางแบบ nearest neighbor: เริ่มจาก startPlace แล้วไปที่ใกล้ที่สุดถัดไปเรื่อยๆ
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