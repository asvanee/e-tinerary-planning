export interface AutoTripStop {
  place_id: string;
  place_name: string;
  categoryName?: string;
  poiScore?: number;
  latitude: number;
  longitude: number;
  start_time: string;
  end_time: string;
  duration_min: number;
  travel_distance_km: number;
  travel_time_min: number;
  previous_place_name: string;
}

export interface AutoTripDay {
  day: number;
  date: string;
  stops: AutoTripStop[];
  total_distance_km: number;
  total_travel_time_min: number;
  total_visit_time_min: number;
}

export interface AutoTripResponse {
  success?: boolean;
  message?: string;
  trip_id: string;
  start_lat?: number | null;
  start_lng?: number | null;
  selected_places?: unknown[];
  days?: AutoTripDay[];
  total_distance_km?: number;
}
