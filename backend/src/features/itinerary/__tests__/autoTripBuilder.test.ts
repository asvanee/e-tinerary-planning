import { AutoPlace, buildAutoTrip, TripInfo } from "../autoTripBuilder";

describe("buildAutoTrip visit durations", () => {
  const trip: TripInfo = {
    trip_id: "trip-1",
    start_date: "2026-10-23",
    end_date: "2026-10-23",
    start_time: "09:00",
    start_lat: 18.8,
    start_lng: 98.98,
    available_time_per_day: 2,
  };

  const fridayHours = (open: string, close: string) => ({
    periods: [{ open: { day: 5, time: open }, close: { day: 5, time: close } }],
  });

  test("uses the category duration in stop times and visit totals", () => {
    const place: AutoPlace = {
      place_id: "place-1",
      place_name: "Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      visitDurationMin: 90,
    };

    const result = buildAutoTrip(trip, [place]);

    expect(result.days[0].stops[0]).toMatchObject({
      duration_min: 90,
      start_time: "09:00",
      end_time: "10:30",
    });
    expect(result.days[0].total_visit_time_min).toBe(90);
  });

  test("allows a place when opening hours are unknown", () => {
    const place: AutoPlace = {
      place_id: "unknown-hours",
      place_name: "Unknown Hours",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      visitDurationMin: 60,
    };

    const result = buildAutoTrip(trip, [place]);

    expect(result.selected_places.map(({ place_id }) => place_id)).toEqual([
      "unknown-hours",
    ]);
  });

  test("skips a higher-scoring place closed at arrival and picks the next open place", () => {
    const closedAtArrival: AutoPlace = {
      place_id: "closed-at-arrival",
      place_name: "Closed at Arrival",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: fridayHours("1000", "1800"),
      visitDurationMin: 60,
    };
    const openAtArrival: AutoPlace = {
      ...closedAtArrival,
      place_id: "open-at-arrival",
      place_name: "Open at Arrival",
      poiScore: 0.8,
      opening_hours: fridayHours("0900", "1800"),
    };

    const result = buildAutoTrip(trip, [closedAtArrival, openAtArrival]);

    expect(result.selected_places.map(({ place_id }) => place_id)).toEqual([
      "open-at-arrival",
    ]);
    expect(result.days[0].stops[0]).toMatchObject({
      place_id: "open-at-arrival",
      start_time: "09:00",
      end_time: "10:00",
    });
  });

  test("checks opening hours at the actual arrival time after an earlier stop", () => {
    const firstCategoryPlace: AutoPlace = {
      place_id: "first-category",
      place_name: "First Category",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      visitDurationMin: 90,
    };
    const closedByArrival: AutoPlace = {
      ...firstCategoryPlace,
      place_id: "closed-by-arrival",
      categoryId: "category-2",
      categoryName: "ธรรมชาติ",
      poiScore: 0.9,
      opening_hours: fridayHours("0900", "1000"),
      visitDurationMin: 30,
    };
    const openByArrival: AutoPlace = {
      ...closedByArrival,
      place_id: "open-by-arrival",
      poiScore: 0.8,
      opening_hours: fridayHours("1000", "1200"),
    };

    const result = buildAutoTrip(trip, [
      firstCategoryPlace,
      closedByArrival,
      openByArrival,
    ]);

    expect(result.days[0].stops.map(({ place_id }) => place_id)).toEqual([
      "first-category",
      "open-by-arrival",
    ]);
    expect(result.days[0].stops[1]).toMatchObject({
      start_time: "10:30",
      end_time: "11:00",
    });
  });

  test("tries a known-closed place again on a later trip day", () => {
    const multiDayTrip = { ...trip, end_date: "2026-10-24" };
    const saturdayPlace: AutoPlace = {
      place_id: "saturday-place",
      place_name: "Saturday Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: {
        periods: [
          { open: { day: 6, time: "0900" }, close: { day: 6, time: "1800" } },
        ],
      },
      visitDurationMin: 60,
    };

    const result = buildAutoTrip(multiDayTrip, [saturdayPlace]);

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({
      day: 2,
      date: "2026-10-24",
    });
    expect(result.days[0].stops[0].place_id).toBe("saturday-place");
  });

  test("does not fall back to a known-closed place", () => {
    const closedPlace: AutoPlace = {
      place_id: "closed-place",
      place_name: "Closed Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: {
        periods: [
          { open: { day: 6, time: "0900" }, close: { day: 6, time: "1800" } },
        ],
      },
      visitDurationMin: 60,
    };

    const result = buildAutoTrip(trip, [closedPlace]);

    expect(result.selected_places).toEqual([]);
    expect(result.days).toEqual([]);
  });
});
