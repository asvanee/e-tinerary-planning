// ==========================================
// Types & Interfaces
// ==========================================
export interface PlaceInput {
  place_id: string;
  place_name: string;
  latitude: number;
  longitude: number;
  default_duration_min?: number | null;
  [key: string]: any;
}

export interface ScheduledPlace extends PlaceInput {
  start_time: string;
  end_time: string;
  distance_from_prev: number;
  travel_time_from_prev: number;
}

export interface ScheduledDay {
  day_number?: number;
  start_time: string;
  end_time: string;
  total_distance_km: number;
  places: ScheduledPlace[];
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * คำนวณระยะทางทางตรงระหว่าง 2 พิกัด (Haversine Formula)
 * @returns ระยะทางหน่วยกิโลเมตร (km)
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // รัศมีโลก (กิโลเมตร)

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * คำนวณเวลาเดินทางจากระยะทาง (นาที)
 * @param distanceKm ระยะทาง (km)
 * @param averageSpeedKmh ความเร็วเฉลี่ย (km/h) - ค่าเริ่มต้น 40 km/h
 */
export function calculateTravelTimeMin(
  distanceKm: number,
  averageSpeedKmh = 40
): number {
  if (distanceKm <= 0) return 0;
  return Math.ceil((distanceKm / averageSpeedKmh) * 60);
}

/**
 * แปลงจำนวนนาทีสะสมเป็นฟอร์แมต HH:mm:ss
 * มีระบบ Modulo กันชั่วโมงเกิน 24:00
 */
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

// ==========================================
// Main Scheduling Functions
// ==========================================

/**
 * จัดตารางเวลาและระยะทางสำหรับสถานที่ใน 1 วัน
 * @param orderedPlaces รายการสถานที่ที่จัดเรียงลำดับมาแล้ว (เช่น ผ่าน TSP)
 * @param startHour เวลาเริ่มต้นเดินทางของวัน (default: 9 คือ 09:00 น.)
 */
export function schedulePlacesForSingleDay(
  orderedPlaces: PlaceInput[],
  startHour = 9
): ScheduledDay {
  let currentTime = startHour * 60; // แปลงชั่วโมงเป็นนาทีสะสม
  const dayStartTime = minutesToTime(currentTime);

  const placesWithSchedule: ScheduledPlace[] = orderedPlaces.map(
    (place, index) => {
      let distanceFromPrev = 0;
      let travelTimeFromPrev = 0;

      // ถ้าไม่ใช่จุดแรก ให้คำนวณระยะทางและเวลาเดินทางจากจุดก่อนหน้า
      if (index > 0) {
        const previous = orderedPlaces[index - 1];

        distanceFromPrev = calculateDistanceKm(
          previous.latitude,
          previous.longitude,
          place.latitude,
          place.longitude
        );

        travelTimeFromPrev = calculateTravelTimeMin(distanceFromPrev);

        // สะสมเวลาเดินทางเพิ่ม
        currentTime += travelTimeFromPrev;
      }

      const duration = place.default_duration_min ?? 60; // ระยะเวลาแวะเที่ยว (default 60 นาที)
      const startTime = currentTime;
      const endTime = currentTime + duration;

      // อัปเดตเวลาปัจจุบันสำหรับสถานที่ถัดไป
      currentTime = endTime;

      return {
        ...place,
        start_time: minutesToTime(startTime),
        end_time: minutesToTime(endTime),
        distance_from_prev: Number(distanceFromPrev.toFixed(2)),
        travel_time_from_prev: travelTimeFromPrev,
      };
    }
  );

  // คำนวณระยะทางรวมทั้งหมดของวัน
  const totalDistanceKm = placesWithSchedule.reduce(
    (sum, place) => sum + (place.distance_from_prev || 0),
    0
  );

  return {
    start_time: dayStartTime,
    end_time: minutesToTime(currentTime),
    total_distance_km: Number(totalDistanceKm.toFixed(2)),
    places: placesWithSchedule,
  };
}

/**
 * จัดตารางเวลาสำหรับทริปหลายวัน (Multi-day Trip)
 * @param multiDayPlaces Array ของสถานที่แยกตามวัน [ [สถานที่วัน1], [สถานที่วัน2] ]
 * @param startHour เวลาเริ่มต้นของแต่ละวัน (default: 9)
 */
export function scheduleMultiDayTrip(
  multiDayPlaces: PlaceInput[][],
  startHour = 9
): ScheduledDay[] {
  return multiDayPlaces.map((dayPlaces, index) => {
    const scheduledDay = schedulePlacesForSingleDay(dayPlaces, startHour);
    return {
      day_number: index + 1,
      ...scheduledDay,
    };
  });
}