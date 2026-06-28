import axios from "axios";
import { Request, Response } from "express";
import { supabase } from "../../config/db";

const NAKHON_PATHOM_CENTER = "13.8199,100.0622";

export const fetchNakhonPathomPlaces = async (
  req: Request,
  res: Response
) => {
  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      {
        params: {
          location: NAKHON_PATHOM_CENTER,
          radius: 30000,
          type: "tourist_attraction",
          key: process.env.GOOGLE_API_KEY,
        },
      }
    );

    const places = response.data.results;

    for (const place of places) {
      const { province, district } = extractAddress(place);

      await supabase.from("places").upsert({
        google_place_id: place.place_id,
        place_name: place.name,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        rating: place.rating || null,
        price_level: place.price_level || null,
        user_ratings_total: place.user_ratings_total || 0,
        formatted_address: place.vicinity || null,
        province,
        district,
      }, {
        onConflict: "google_place_id",
      });
    }

    console.log("API response status:", response.data.status);
    console.log("Results count:", response.data.results.length);

    res.json({
      message: "นครปฐม tourist_attraction saved",
      count: places.length,
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

function extractAddress(place: any) {
  let province = null;
  let district = null;

  if (place.plus_code?.compound_code) {
    const address = place.plus_code.compound_code;

    if (address.includes("นครปฐม")) {
      province = "นครปฐม";
    }
  }

  // ตอนนี้ Nearby Search ไม่มี address_components
  // ดังนั้นรอบแรกจะใช้ formatted_address แยกแบบง่าย ๆ

  if (place.vicinity) {
    const parts = place.vicinity.split(",");
    district = parts[0]?.trim() || null;
  }

  return { province, district };
}