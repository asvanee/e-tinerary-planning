export interface CsvRow {
  ATT_ID: string;
  ATT_NAME_TH: string;
  ATT_NAME_EN: string;
  ATT_ADDRESS?: string;
  ATT_ADDRESS_ALLEY?: string;
  ATT_ADDRESS_ROAD?: string;
  ATT_POSTCODE?: string;
  ATT_START_END?: string;
  ATT_LOCATION: string; // "lat, lng"
  PROVINCE_NAME_TH: string;
  DISTRICT_NAME_TH: string;
  SUBDISTRICT_NAME_TH?: string;
  ATT_CATEGORY_LABEL: string;
  ATT_TYPE_LABEL: string;
  ATT_TEL: string;
  ATT_WEBSITE: string;
  ATT_DETAIL_TH?: string; 
    ATT_FACEBOOK?: string;   // ← เพิ่ม
  ATT_INSTAGRAM?: string;  // ← เพิ่ม
  ATT_TIKTOK?: string;     // ← เพิ่ม
  ATT_YOUTUBE?: string;    // ← เพิ่ม
  ATT_LINE?: string;       // ← เพิ่ม
  
}

export interface GooglePlaceResult {
  place_id: string;
  name: string;
  rating?: number;
  price_level?: number;
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: {
    weekday_text: string[];
    open_now?: boolean;
  };
  user_ratings_total?: number;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

export interface PlaceRecord {
  google_place_id: string;
  place_name: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  price_level: number | null;
  formatted_address: string | null;
  phone_number: string | null;
  website: string | null;
  opening_hours: object | null;
  province: string;
  district: string;
  user_ratings_total: number | null;
  att_id: string;
  att_type_label: string | null;
  att_category_label: string | null;
  att_detail_th: string | null;
    att_facebook: string | null;    // ← เพิ่ม
  att_instagram: string | null;   // ← เพิ่ม
  att_tiktok: string | null;      // ← เพิ่ม
  att_youtube: string | null;     // ← เพิ่ม
  att_line: string | null;        // ← เพิ่ม
}