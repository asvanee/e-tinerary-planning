import { supabase } from "../../config/db";

interface TripPreferences {
  province?: string | null;
  city?: string | null;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  number_of_people?: number | null;
  total_budget?: number | null;
  budget_type?: string;
  available_time_per_day?: number | null;
  tags?: string[];
}

export async function getPlaces() {
  const { data, error } = await supabase.from("places").select("*");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export function calculatePOIScore(
  categoryScore: number,
  ratingScore: number,
  distanceScore: number,
  budgetScore: number,
  weatherScore: number
): number {
  return (
    0.35 * categoryScore +
    0.25 * ratingScore +
    0.15 * distanceScore +
    0.15 * budgetScore +
    0.1 * weatherScore
  );
}

function normalizeScore(value: number, max = 5): number {
  if (!value) return 0.7;
  return Math.min(1, value / max);
}

function getCategoryScore(place: Record<string, any>, tags: string[] = []): number {
  if (!tags.length) return 1;

  const text = [place.place_name, place.formatted_address, place.province, place.district]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matches = tags.reduce((count, tag) => {
    return text.includes(tag.toLowerCase()) ? count + 1 : count;
  }, 0);

  return Math.min(1, matches / tags.length);
}

function getDistanceScore(place: Record<string, any>, province?: string | null, city?: string | null): number {
  const placeText = [place.province, place.district, place.formatted_address]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!province) return 1;

  const provinceText = province.toLowerCase();
  if (placeText.includes(provinceText)) {
    if (city && placeText.includes(city.toLowerCase())) {
      return 1;
    }
    return 0.9;
  }

  return 0.4;
}

function matchesSelectedLocation(
  place: Record<string, any>,
  province?: string | null,
  city?: string | null
): boolean {
  const selectedProvince = province?.trim().toLowerCase();
  const selectedCity = city?.trim().toLowerCase();

  if (!selectedProvince && !selectedCity) return true;

  const placeText = [
    place.place_name,
    place.province,
    place.district,
    place.formatted_address,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (selectedProvince && placeText.includes(selectedProvince)) {
    return true;
  }

  if (selectedCity && placeText.includes(selectedCity)) {
    return true;
  }

  return false;
}

function getBudgetScore(place: Record<string, any>, totalBudget?: number | null, people?: number | null): number {
  if (!totalBudget || !people) return 1;

  const budgetPerPerson = totalBudget / Math.max(1, people);
  const priceLevel = place.price_level ?? 2;
  const estimatedCost = [300, 500, 800, 1200, 1800][priceLevel] ?? 900;

  if (estimatedCost <= budgetPerPerson) return 1;
  if (estimatedCost <= budgetPerPerson * 1.2) return 0.8;
  if (estimatedCost <= budgetPerPerson * 1.5) return 0.6;
  return 0.3;
}

function isPlaceOpenAtSelectedTime(
  place: Record<string, any>,
  startDate?: string,
  startTime?: string
): boolean {
  const openingHours = place.opening_hours;
  if (!openingHours) return true;

  if (openingHours.open_now === false) return false;

  if (!startDate) return true;

  const selectedDate = new Date(startDate);
  if (Number.isNaN(selectedDate.getTime())) return true;

  const selectedDay = selectedDate.getDay();
  const selectedTime = startTime ? startTime.replace(":", "") : null;

  const periods = openingHours.periods ?? [];
  if (!periods.length) return true;

  if (!selectedTime) {
    return periods.some((period: Record<string, any>) => period.open?.day === selectedDay);
  }

  return periods.some((period: Record<string, any>) => {
    const openDay = period.open?.day;
    const closeDay = period.close?.day;
    const openTime = period.open?.time;
    const closeTime = period.close?.time;

    if (openDay === undefined || closeDay === undefined || !openTime || !closeTime) {
      return false;
    }

    const startMinutes = Number(selectedTime.slice(0, 2)) * 60 + Number(selectedTime.slice(2));
    const openMinutes = Number(openTime.slice(0, 2)) * 60 + Number(openTime.slice(2));
    const closeMinutes = Number(closeTime.slice(0, 2)) * 60 + Number(closeTime.slice(2));

    if (closeTime === "0000") {
      return openDay === selectedDay && startMinutes >= openMinutes;
    }

    return openDay === selectedDay && startMinutes >= openMinutes && startMinutes < closeMinutes;
  });
}

function getWeatherScore(startDate?: string, tags: string[] = []): number {
  if (!startDate) return 1;

  const month = new Date(startDate).getMonth() + 1;
  const outdoorTags = ["nature", "beach", "mountain", "adventure", "relaxation", "temple"];
  const isOutdoorTrip = tags.some((tag) => outdoorTags.includes(tag.toLowerCase()));

  if (!isOutdoorTrip) return 0.9;
  if (month >= 5 && month <= 10) return 0.75;
  return 0.95;
}

export async function getRecommendedPlaces(preferences: TripPreferences = {}) {
  const places = await getPlaces();

  const filteredPlaces = places.filter((place: Record<string, any>) =>
    matchesSelectedLocation(place, preferences.province, preferences.city)
  );

  const scoredPlaces = filteredPlaces
    .map((place: Record<string, any>) => {
      const categoryScore = getCategoryScore(place, preferences.tags ?? []);
      const ratingScore = normalizeScore(place.rating, 5);
      const distanceScore = getDistanceScore(place, preferences.province, preferences.city);
      const budgetScore = getBudgetScore(place, preferences.total_budget, preferences.number_of_people);
      const weatherScore = getWeatherScore(preferences.start_date, preferences.tags ?? []);
      const totalScore = calculatePOIScore(
        categoryScore,
        ratingScore,
        distanceScore,
        budgetScore,
        weatherScore
      );
      const isOpen = isPlaceOpenAtSelectedTime(place, preferences.start_date, preferences.start_time);

      return {
        ...place,
        categoryScore,
        ratingScore,
        distanceScore,
        budgetScore,
        weatherScore,
        totalScore,
        isOpen,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);

  return scoredPlaces;
}