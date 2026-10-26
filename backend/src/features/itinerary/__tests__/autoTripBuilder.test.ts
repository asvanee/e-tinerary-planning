import { AutoPlace, buildAutoTrip, TripInfo } from "../autoTripBuilder";
import { TRIP_START_ID } from "../../../utils/orsTravelMatrix";

describe("buildAutoTrip per-place visit durations", () => {
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

  test("uses the requested visit duration for a place when there is no travel", () => {
    const place: AutoPlace = {
      place_id: "place-1",
      place_name: "Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 90,
    };

    const result = buildAutoTrip(trip, [place]);

    expect(result.days[0].stops[0]).toMatchObject({
      duration_min: 90,
      start_time: "09:00",
      end_time: "10:30",
    });
    expect(result.days[0].total_visit_time_min).toBe(90);
  });

  test("uses the trip-day start and end times instead of trip-level defaults", () => {
    const place: AutoPlace = {
      place_id: "trip-day-time-place",
      place_name: "Trip Day Time Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: fridayHours("1000", "1200"),
      requestedVisitDurationMin: 60,
    };

    const result = buildAutoTrip(
      {
        ...trip,
        trip_days: [
          {
            dayNumber: 1,
            visitDate: "2026-10-23",
            startTime: "10:00",
            endTime: "10:30",
            dailyBudget: null,
            useBudget: false,
          },
        ],
      },
      [place]
    );

    expect(result.days[0].stops[0]).toMatchObject({
      start_time: "10:00",
      end_time: "10:30",
      duration_min: 30,
    });
  });

  test("does not impose the default 18:00 cutoff when a trip-day end time is null", () => {
    const place: AutoPlace = {
      place_id: "late-place",
      place_name: "Late Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
    };

    const result = buildAutoTrip(
      {
        ...trip,
        trip_days: [
          {
            dayNumber: 1,
            visitDate: "2026-10-23",
            startTime: "20:00",
            endTime: null,
            dailyBudget: null,
            useBudget: false,
          },
        ],
      },
      [place]
    );

    expect(result.days[0].stops[0]).toMatchObject({
      start_time: "20:00",
      end_time: "21:00",
      duration_min: 60,
    });
  });

  test("uses the budget configured for each trip day", () => {
    const firstPlace: AutoPlace = {
      place_id: "first-day-place",
      place_name: "First Day Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 30,
      priceRangeStart: 80,
      priceNature: "paid",
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-day-place",
      place_name: "Second Day Place",
      poiScore: 0.8,
    };

    const result = buildAutoTrip(
      {
        ...trip,
        end_date: "2026-10-24",
        use_budget: true,
        daily_budget: 10,
        available_time_per_day: 2,
        trip_days: [
          {
            dayNumber: 1,
            visitDate: "2026-10-23",
            startTime: "09:00",
            endTime: "10:00",
            dailyBudget: 100,
            useBudget: true,
          },
          {
            dayNumber: 2,
            visitDate: "2026-10-24",
            startTime: "09:00",
            endTime: "10:00",
            dailyBudget: 100,
            useBudget: true,
          },
        ],
      },
      [firstPlace, secondPlace]
    );

    expect(result.days.map(({ stops }) => stops.length)).toEqual([1, 1]);
  });

  test("allows a daily total equal to the budget", () => {
    const budgetTrip = { ...trip, use_budget: true, daily_budget: 100 };
    const firstPlace: AutoPlace = {
      place_id: "first-place",
      place_name: "First Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceRangeStart: 1,
      priceRangeEnd: 60,
      priceNature: "paid",
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-place",
      place_name: "Second Place",
      poiScore: 0.8,
      priceRangeEnd: 40,
    };

    const result = buildAutoTrip(
      { ...budgetTrip, available_time_per_day: 2 },
      [firstPlace, secondPlace]
    );

    expect(result.selected_places.map(({ place_id }) => place_id)).toEqual([
      "first-place",
      "second-place",
    ]);
    expect(result.selected_places[0]).not.toHaveProperty("priceRangeStart");
  });

  test("does not add a place that makes the cumulative daily cost exceed budget", () => {
    const budgetTrip = { ...trip, use_budget: true, daily_budget: 100 };
    const firstPlace: AutoPlace = {
      place_id: "first-place",
      place_name: "First Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceRangeStart: 60,
      priceRangeEnd: null,
      priceNature: "paid",
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-place",
      place_name: "Second Place",
      poiScore: 0.8,
      priceRangeStart: 41,
    };

    const result = buildAutoTrip(
      { ...budgetTrip, available_time_per_day: 2 },
      [firstPlace, secondPlace]
    );

    expect(result.selected_places.map(({ place_id }) => place_id)).toEqual([
      "first-place",
    ]);
  });

  test("does not apply a budget when budget use is disabled", () => {
    const firstPlace: AutoPlace = {
      place_id: "first-place",
      place_name: "First Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceRangeStart: 60,
      priceRangeEnd: null,
      priceNature: "paid",
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-place",
      place_name: "Second Place",
      poiScore: 0.8,
    };

    const result = buildAutoTrip(
      { ...trip, use_budget: false, daily_budget: 100, available_time_per_day: 2 },
      [firstPlace, secondPlace]
    );

    expect(result.selected_places).toHaveLength(2);
  });

  test("does not apply a budget when daily budget is not set", () => {
    const firstPlace: AutoPlace = {
      place_id: "first-place",
      place_name: "First Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceRangeStart: 60,
      priceRangeEnd: null,
      priceNature: "paid",
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-place",
      place_name: "Second Place",
      poiScore: 0.8,
    };

    const result = buildAutoTrip(
      {
        ...trip,
        use_budget: true,
        daily_budget: null,
        available_time_per_day: 2,
      },
      [firstPlace, secondPlace]
    );

    expect(result.selected_places).toHaveLength(2);
  });

  test("does not count unknown paid prices against the daily budget", () => {
    const budgetTrip = { ...trip, use_budget: true, daily_budget: 100 };
    const unknownPricePlace: AutoPlace = {
      place_id: "unknown-price",
      place_name: "Unknown Price",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceNature: "paid",
    };
    const knownPricePlace: AutoPlace = {
      ...unknownPricePlace,
      place_id: "known-price",
      place_name: "Known Price",
      poiScore: 0.8,
      priceRangeStart: 100,
    };

    const result = buildAutoTrip(
      { ...budgetTrip, available_time_per_day: 2 },
      [unknownPricePlace, knownPricePlace]
    );

    expect(result.selected_places.map(({ place_id }) => place_id)).toEqual([
      "unknown-price",
      "known-price",
    ]);
  });

  test("treats a free place without a known price as zero cost", () => {
    const freePlace: AutoPlace = {
      place_id: "free-place",
      place_name: "Free Place",
      categoryId: "category-1",
      categoryName: "สวนสาธารณะ",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceNature: "free",
    };
    const paidPlace: AutoPlace = {
      ...freePlace,
      place_id: "paid-place",
      place_name: "Paid Place",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.8,
      priceRangeStart: 100,
      priceNature: "paid",
    };

    const result = buildAutoTrip(
      {
        ...trip,
        use_budget: true,
        daily_budget: 100,
        available_time_per_day: 2,
      },
      [freePlace, paidPlace]
    );

    expect(result.selected_places.map(({ place_id }) => place_id)).toEqual([
      "free-place",
      "paid-place",
    ]);
  });

  test("resets the accumulated budget for each travel day", () => {
    const firstPlace: AutoPlace = {
      place_id: "first-day-place",
      place_name: "First Day Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceRangeStart: 100,
      priceRangeEnd: null,
      priceNature: "paid",
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-day-place",
      place_name: "Second Day Place",
      poiScore: 0.8,
    };

    const result = buildAutoTrip(
      {
        ...trip,
        end_date: "2026-10-24",
        use_budget: true,
        daily_budget: 100,
        available_time_per_day: 2,
      },
      [firstPlace, secondPlace]
    );

    expect(result.selected_places).toHaveLength(2);
    expect(result.days.map(({ stops }) => stops.length)).toEqual([1, 1]);
  });

  test("rejects an additional recommendation that exceeds the daily budget", () => {
    const budgetTrip = { ...trip, use_budget: true, daily_budget: 100 };
    const selectedPlace: AutoPlace = {
      place_id: "selected-place",
      place_name: "Selected Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
      priceRangeStart: 80,
      priceRangeEnd: null,
      priceNature: "paid",
    };
    const recommendation: AutoPlace = {
      ...selectedPlace,
      place_id: "recommendation",
      place_name: "Recommendation",
      categoryId: "unselected-category",
      poiScore: 0.99,
      requestedVisitDurationMin: 30,
      priceRangeStart: 21,
      isRecommendation: true,
    };

    const result = buildAutoTrip(
      { ...budgetTrip, available_time_per_day: 2 },
      [selectedPlace],
      undefined,
      [recommendation]
    );

    expect(result.selected_places.map(({ place_id }) => place_id)).toEqual([
      "selected-place",
    ]);
  });

  test("uses POI recommendations when no place matches the selected categories", () => {
    const recommendation: AutoPlace = {
      place_id: "recommended-place",
      place_name: "Recommended Place",
      categoryId: "unselected-category",
      categoryName: "ธรรมชาติ",
      poiScore: 0.95,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 30,
    };

    const result = buildAutoTrip(trip, [], undefined, [recommendation]);

    expect(result.days[0].stops[0]).toMatchObject({
      place_id: "recommended-place",
      duration_min: 30,
      is_recommendation: true,
    });
  });

  test("adds the highest-scoring feasible recommendation once per day", () => {
    const multiDayTrip = {
      ...trip,
      end_date: "2026-10-24",
      available_time_per_day: 3,
    };
    const fridayPlace: AutoPlace = {
      place_id: "friday-place",
      place_name: "Friday Place",
      categoryId: "selected-category",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.8,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: fridayHours("0900", "1800"),
      requestedVisitDurationMin: 60,
    };
    const saturdayPlace: AutoPlace = {
      ...fridayPlace,
      place_id: "saturday-place",
      place_name: "Saturday Place",
      poiScore: 0.7,
      opening_hours: {
        periods: [
          { open: { day: 6, time: "0900" }, close: { day: 6, time: "1800" } },
        ],
      },
    };
    const highestScoreRecommendation: AutoPlace = {
      ...fridayPlace,
      place_id: "highest-score-recommendation",
      place_name: "Highest Score Recommendation",
      categoryId: "unselected-category",
      categoryName: "ธรรมชาติ",
      poiScore: 0.99,
      opening_hours: null,
      requestedVisitDurationMin: 30,
    };
    const nextRecommendation: AutoPlace = {
      ...highestScoreRecommendation,
      place_id: "next-recommendation",
      place_name: "Next Recommendation",
      poiScore: 0.98,
    };

    const result = buildAutoTrip(
      multiDayTrip,
      [fridayPlace, saturdayPlace],
      undefined,
      [nextRecommendation, highestScoreRecommendation]
    );

    expect(result.days).toHaveLength(2);
    expect(result.days[0].stops.filter((stop) => stop.is_recommendation)).toHaveLength(1);
    expect(result.days[0].stops.find((stop) => stop.is_recommendation)?.place_id).toBe(
      "highest-score-recommendation"
    );
    expect(
      result.days[0].stops[result.days[0].stops.length - 1].is_recommendation
    ).toBe(true);
    expect(result.days[1].stops.filter((stop) => stop.is_recommendation)).toHaveLength(1);
    expect(result.days[1].stops.find((stop) => stop.is_recommendation)?.place_id).toBe(
      "next-recommendation"
    );
    expect(
      result.days[1].stops[result.days[1].stops.length - 1].is_recommendation
    ).toBe(true);
  });

  test("does not schedule a recommendation that exceeds the remaining day time", () => {
    const selectedPlace: AutoPlace = {
      place_id: "selected-place",
      place_name: "Selected Place",
      categoryId: "selected-category",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.8,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 120,
    };
    const recommendation: AutoPlace = {
      ...selectedPlace,
      place_id: "recommendation",
      place_name: "Recommendation",
      categoryId: "unselected-category",
      poiScore: 0.99,
      requestedVisitDurationMin: 30,
    };

    const result = buildAutoTrip(
      trip,
      [selectedPlace],
      undefined,
      [recommendation]
    );

    expect(result.days[0].stops).toHaveLength(1);
    expect(result.days[0].stops[0].is_recommendation).toBe(false);
  });

  test("does not schedule a recommendation when opening hours cannot fit its duration", () => {
    const selectedPlace: AutoPlace = {
      place_id: "selected-place",
      place_name: "Selected Place",
      categoryId: "selected-category",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.8,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
    };
    const recommendation: AutoPlace = {
      ...selectedPlace,
      place_id: "recommendation",
      place_name: "Recommendation",
      categoryId: "unselected-category",
      poiScore: 0.99,
      opening_hours: fridayHours("0900", "0915"),
      requestedVisitDurationMin: 30,
    };

    const result = buildAutoTrip(
      trip,
      [selectedPlace],
      undefined,
      [recommendation]
    );

    expect(result.days[0].stops).toHaveLength(1);
    expect(result.days[0].stops[0].is_recommendation).toBe(false);
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
      requestedVisitDurationMin: 60,
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
      opening_hours: fridayHours("1030", "1800"),
      requestedVisitDurationMin: 60,
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
      requestedVisitDurationMin: 90,
    };
    const closedByArrival: AutoPlace = {
      ...firstCategoryPlace,
      place_id: "closed-by-arrival",
      categoryId: "category-2",
      categoryName: "ธรรมชาติ",
      poiScore: 0.9,
      opening_hours: fridayHours("1000", "1020"),
      requestedVisitDurationMin: 30,
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
    const multiDayTrip = { ...trip, end_date: "2026-10-25" };
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
      requestedVisitDurationMin: 60,
    };

    const result = buildAutoTrip(multiDayTrip, [saturdayPlace]);

    expect(result.days).toHaveLength(3);
    expect(result.days[0]).toMatchObject({
      day: 1,
      date: "2026-10-23",
      stops: [],
    });
    expect(result.days[1]).toMatchObject({
      day: 2,
      date: "2026-10-24",
    });
    expect(result.days[1].stops[0].place_id).toBe("saturday-place");
    expect(result.days[2]).toMatchObject({
      day: 3,
      date: "2026-10-25",
      stops: [],
    });
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
      requestedVisitDurationMin: 60,
    };

    const result = buildAutoTrip(trip, [closedPlace]);

    expect(result.selected_places).toEqual([]);
    expect(result.days).toEqual([]);
  });

  test("applies the requested duration independently to every place in a category", () => {
    const firstPlace: AutoPlace = {
      place_id: "first-place",
      place_name: "First Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 120,
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-place",
      place_name: "Second Place",
      poiScore: 0.8,
    };

    const result = buildAutoTrip(
      { ...trip, available_time_per_day: 4 },
      [firstPlace, secondPlace]
    );

    expect(result.days[0].stops.map(({ place_id }) => place_id)).toEqual([
      "first-place",
      "second-place",
    ]);
    expect(result.days[0].stops.map(({ duration_min }) => duration_min)).toEqual([
      120,
      120,
    ]);
    expect(result.days[0].total_travel_time_min).toBe(0);
    expect(result.days[0].total_visit_time_min).toBe(240);
  });

  test("keeps travel time separate from the category visit-time budget", () => {
    const place: AutoPlace = {
      place_id: "distant-place",
      place_name: "Distant Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.95,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
    };

    const result = buildAutoTrip(trip, [place]);
    const stop = result.days[0].stops[0];

    expect(stop.travel_time_min).toBeGreaterThan(0);
    expect(stop.duration_min).toBe(60);
    expect(stop.duration_min + stop.travel_time_min).toBeGreaterThan(60);
  });

  test("uses ORS matrix travel durations when the matrix is supplied", () => {
    const place: AutoPlace = {
      place_id: "ors-place",
      place_name: "ORS Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 90,
    };

    const result = buildAutoTrip(
      trip,
      [place],
      {
        [TRIP_START_ID]: {
          [place.place_id]: {
            distanceKm: 15,
            durationMin: 25,
            source: "ors",
          },
        },
      }
    );

    expect(result.days[0].stops[0]).toMatchObject({
      travel_time_min: 25,
      duration_min: 90,
    });
    expect(result.days[0].total_travel_time_min).toBe(25);
    expect(result.days[0].total_visit_time_min).toBe(90);
  });

  test("skips a place when travel and visit time exceed the daily limit", () => {
    const place: AutoPlace = {
      place_id: "too-far-place",
      place_name: "Too Far Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 19.1,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 30,
    };

    const result = buildAutoTrip(
      { ...trip, available_time_per_day: 0.25 },
      [place]
    );

    expect(result.selected_places).toEqual([]);
    expect(result.days).toEqual([]);
  });

  test("reorders the route after adding a nearer place and recalculates travel time", () => {
    const highScorePlace: AutoPlace = {
      place_id: "farther-place",
      place_name: "Farther Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.9,
      longitude: 99.08,
      opening_hours: null,
      requestedVisitDurationMin: 60,
    };
    const nearerPlace: AutoPlace = {
      ...highScorePlace,
      place_id: "nearer-place",
      place_name: "Nearer Place",
      categoryId: "category-2",
      categoryName: "ธรรมชาติ",
      poiScore: 0.8,
      latitude: 18.8,
      longitude: 98.99,
    };

    const result = buildAutoTrip(
      { ...trip, available_time_per_day: 4 },
      [highScorePlace, nearerPlace]
    );

    expect(result.days[0].stops.map(({ place_id }) => place_id)).toEqual([
      "nearer-place",
      "farther-place",
    ]);
    expect(result.days[0].total_travel_time_min).toBeLessThan(45);
  });

  test("never schedules the same place twice when it matches multiple categories", () => {
    const place: AutoPlace = {
      place_id: "shared-place",
      place_name: "Shared Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: null,
      requestedVisitDurationMin: 60,
    };
    const duplicateCategory = {
      ...place,
      categoryId: "category-2",
      categoryName: "วัฒนธรรม",
    };

    const result = buildAutoTrip(trip, [place, duplicateCategory]);

    expect(result.selected_places).toHaveLength(1);
    expect(result.selected_places[0].place_id).toBe("shared-place");
  });

  test("rechecks opening hours after inserting a stop and recomputing the route", () => {
    const firstPlace: AutoPlace = {
      place_id: "first-place",
      place_name: "First Place",
      categoryId: "category-1",
      categoryName: "พิพิธภัณฑ์",
      poiScore: 0.9,
      latitude: 18.8,
      longitude: 98.98,
      opening_hours: fridayHours("0900", "1000"),
      requestedVisitDurationMin: 120,
    };
    const secondPlace: AutoPlace = {
      ...firstPlace,
      place_id: "second-place",
      place_name: "Second Place",
      poiScore: 0.8,
      opening_hours: fridayHours("1000", "1100"),
    };

    const result = buildAutoTrip(trip, [firstPlace, secondPlace]);

    expect(result.days[0].stops.map(({ place_id }) => place_id)).toEqual([
      "first-place",
      "second-place",
    ]);
    expect(result.days[0].stops[1].start_time).toBe("10:00");
  });
});
