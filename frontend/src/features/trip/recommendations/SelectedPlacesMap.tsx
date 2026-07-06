import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DirectionsRenderer, DirectionsService, GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import Navbar from "../../../components/Navbar";
import { useAuth } from "../../auth/hooks/useAuth";

interface PlaceInfo {
  place_id: string;
  place_name: string;
  province: string | null;
  district: string | null;
  latitude: number;
  longitude: number;
  formatted_address: string | null;
  opening_hours?: any;
}

interface TripInfo {
  trip_id: string;
  start_lat: number | null;
  start_lng: number | null;
  start_address: string | null;
  province: string | null;
  district: string | null;
}

interface PoiResult {
  placeId: string;
  categoryScore: number;
  ratingScore: number;
  distanceScore: number;
  budgetScore: number;
  weatherScore: number;
  poiScore: number;
}

interface SelectedPlace extends PlaceInfo {
  distanceKm: number;
}

interface CandidatePlace extends PlaceInfo, PoiResult {}

const parseSelectedPlaceIds = (value: string | null) =>
  (value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

const mapContainerStyle = {
  width: "100%",
  height: "480px",
  borderRadius: "20px",
};

const defaultCenter = {
  lat: 13.7563,
  lng: 100.5018,
};

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function SelectedPlacesMap() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, isLoading: authLoading } = useAuth();

  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [allPoiPlaces, setAllPoiPlaces] = useState<CandidatePlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<string[]>(() =>
    parseSelectedPlaceIds(searchParams.get("selected"))
  );

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      navigate("/login");
      return;
    }

    if (!tripId) {
      setError("ไม่พบรหัสทริป");
      setLoading(false);
      return;
    }

    const selectedIds = (searchParams.get("selected") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const tripsRes = await fetch("/api/trips", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const tripsData = await tripsRes.json();
        if (!tripsRes.ok) {
          throw new Error(tripsData.message || "โหลดข้อมูลทริปไม่สำเร็จ");
        }

        const currentTrip = (tripsData.trips || []).find((item: TripInfo) => item.trip_id === tripId);
        if (!currentTrip) {
          throw new Error("ไม่พบทริปนี้");
        }

        if (currentTrip.start_lat === null || currentTrip.start_lng === null) {
          throw new Error("ทริปนี้ยังไม่มีจุดเริ่มต้นสำหรับแสดงบนแผนที่");
        }

        let placeIdsToFetch = selectedIds;

        if (placeIdsToFetch.length === 0) {
          const poiRes = await fetch(`/api/poi/trips/${tripId}/calculate-poi`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          const poiText = await poiRes.text();
          let poiData: { results?: PoiResult[] } = {};

          try {
            poiData = poiText ? JSON.parse(poiText) : {};
          } catch {
            throw new Error("API ไม่ได้ส่งข้อมูล POI กลับมา");
          }

          if (!poiRes.ok) {
            throw new Error(poiData?.results ? "โหลดผลลัพธ์ POI ไม่สำเร็จ" : "โหลดผลลัพธ์ POI ไม่สำเร็จ");
          }

          placeIdsToFetch = (poiData.results || []).map((item) => item.placeId);
        }

        if (placeIdsToFetch.length === 0) {
          throw new Error("ยังไม่มีสถานที่จากผลลัพธ์ POI ที่จะแสดงบนแผนที่");
        }

        const placeQuery = new URLSearchParams({ ids: placeIdsToFetch.join(",") });
        if (currentTrip.province) {
          placeQuery.set("province", currentTrip.province);
        }
        if (currentTrip.district) {
          placeQuery.set("district", currentTrip.district);
        }

        const placesRes = await fetch(`/api/places?${placeQuery.toString()}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const placesData = await placesRes.json();
        if (!placesRes.ok) {
          throw new Error(placesData.message || "โหลดสถานที่ไม่สำเร็จ");
        }

        const poiRes = await fetch(`/api/poi/trips/${tripId}/calculate-poi`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const poiText = await poiRes.text();
        let poiData: { results?: PoiResult[] } = {};

        try {
          poiData = poiText ? JSON.parse(poiText) : {};
        } catch {
          throw new Error("API ไม่ได้ส่งข้อมูล POI กลับมา");
        }

        if (!poiRes.ok) {
          throw new Error(poiData?.results ? "โหลดผลลัพธ์ POI ไม่สำเร็จ" : "โหลดผลลัพธ์ POI ไม่สำเร็จ");
        }

        const poiResults = poiData.results || [];

        const placeLookup = new Map<string, PlaceInfo>(
          ((placesData.places || []) as PlaceInfo[]).map((place) => [place.place_id, place])
        );

        const poiCandidates = poiResults.map((result) => {
          const matchedPlace = placeLookup.get(result.placeId);
          return {
            ...result,
            ...(matchedPlace || {}),
          } as CandidatePlace;
        });

        setTrip(currentTrip);
        setAllPoiPlaces(poiCandidates);

        if (selectedPlaceIds.length === 0) {
          const defaultIds = poiCandidates
            .map((place) => place.place_id || place.placeId)
            .filter(Boolean) as string[];
          setSelectedPlaceIds(defaultIds);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "เกิดข้อผิดพลาดในการโหลดแผนที่");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authLoading, navigate, searchParams, session, tripId]);

  useEffect(() => {
    const nextValue = selectedPlaceIds.join(",");
    const currentValue = searchParams.get("selected") || "";

    if (nextValue === currentValue) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextValue) {
      nextSearchParams.set("selected", nextValue);
    } else {
      nextSearchParams.delete("selected");
    }

    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, selectedPlaceIds, setSearchParams]);

  const places = useMemo<SelectedPlace[]>(() => {
    if (!trip || trip.start_lat === null || trip.start_lng === null) {
      return [];
    }

    const orderedPlaceIds = selectedPlaceIds.filter((placeId) =>
      allPoiPlaces.some((place) => (place.place_id || place.placeId) === placeId)
    );

    return orderedPlaceIds
      .map((placeId) => allPoiPlaces.find((place) => (place.place_id || place.placeId) === placeId))
      .filter((place): place is CandidatePlace => Boolean(place))
      .filter((place) => typeof place.latitude === "number" && typeof place.longitude === "number")
      .map((place) => ({
        ...place,
        distanceKm: haversineKm(
          trip.start_lat!,
          trip.start_lng!,
          place.latitude,
          place.longitude
        ),
      }));
  }, [allPoiPlaces, selectedPlaceIds, trip]);

  const nearbyPoiPlaces = useMemo(() => {
    if (!trip || trip.start_lat === null || trip.start_lng === null) {
      return [];
    }

    const anchorPlaceId = [...selectedPlaceIds].reverse().find((placeId) =>
      allPoiPlaces.some((place) => (place.place_id || place.placeId) === placeId)
    );
    const anchorPlace = allPoiPlaces.find((place) => (place.place_id || place.placeId) === anchorPlaceId);

    const referenceLat = anchorPlace?.latitude ?? trip.start_lat;
    const referenceLng = anchorPlace?.longitude ?? trip.start_lng;

    return allPoiPlaces
      .filter((place) => typeof place.latitude === "number" && typeof place.longitude === "number")
      .map((place) => ({
        ...place,
        distanceKm: haversineKm(referenceLat, referenceLng, place.latitude, place.longitude),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 10);
  }, [allPoiPlaces, selectedPlaceIds, trip]);

  const mapCenter = useMemo(() => {
    if (trip?.start_lat !== null && trip?.start_lng !== null && trip?.start_lat !== undefined && trip?.start_lng !== undefined) {
      return { lat: trip.start_lat, lng: trip.start_lng };
    }
    return defaultCenter;
  }, [trip]);

  const togglePlaceSelection = (placeId: string) => {
    setSelectedPlaceIds((prev) => {
      if (prev.includes(placeId)) {
        return prev;
      }
      return [...prev, placeId];
    });
  };

  const handleConfirmSelection = () => {
    if (places.length === 0) {
      return;
    }

    navigate(`/trip/${tripId}/schedule?selected=${selectedPlaceIds.join(",")}`);
  };

  const routeRequest = useMemo(() => {
    if (!trip || trip.start_lat === null || trip.start_lng === null || places.length === 0) {
      return null;
    }

    const origin = { lat: trip.start_lat, lng: trip.start_lng };
    const destination = { lat: places[places.length - 1].latitude, lng: places[places.length - 1].longitude };
    const waypoints = places.slice(0, -1).map((place) => ({
      location: { lat: place.latitude, lng: place.longitude },
      stopover: true,
    }));

    return {
      origin,
      destination,
      waypoints,
      optimizeWaypoints: false,
      travelMode: google.maps.TravelMode.DRIVING,
    };
  }, [places, trip]);

  useEffect(() => {
    setDirections(null);
    setDirectionsError(null);
  }, [routeRequest]);

  return (
    <div className="font-sarabun min-h-screen bg-[#fcedd3]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 px-4 py-2 rounded-xl bg-white text-[#102a6b] font-semibold shadow-md"
        >
          ← กลับ
        </button>

        <div className="bg-gradient-to-r from-[#102a6b] to-[#015185] rounded-2xl px-8 py-6 mb-6 shadow-lg text-white">
          <h2 className="font-prompt font-bold text-2xl mb-1">แผนที่สถานที่ที่เลือก</h2>
          <p className="text-[#9fd0f0] text-sm">
            แสดงสถานที่ตามลำดับที่คุณเลือกไว้ และมีเส้นทางเชื่อมต่อจากจุดเริ่มต้นไปยังสถานที่แต่ละแห่ง
          </p>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl shadow-lg px-6 py-10 text-center text-[#5990c0]">
            กำลังโหลดแผนที่และระยะทาง...
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-2xl shadow-lg px-6 py-10 text-center text-[#102a6b]">
            <div className="text-4xl mb-2">⚠️</div>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid lg:grid-cols-[1.4fr_0.8fr] gap-6">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              {!isLoaded ? (
                <div className="h-[480px] rounded-2xl bg-[#f3f7fb] flex items-center justify-center text-[#5990c0]">
                  กำลังโหลด Google Maps...
                </div>
              ) : (
                <GoogleMap
                  mapContainerStyle={mapContainerStyle}
                  center={mapCenter}
                  zoom={10}
                  options={{
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                  }}
                >
                  {isLoaded && routeRequest && (
                    <DirectionsService
                      options={routeRequest}
                      callback={(result, status) => {
                        if (status === google.maps.DirectionsStatus.OK && result) {
                          setDirections(result);
                          setDirectionsError(null);
                        } else {
                          console.error("Directions request failed:", status);
                          setDirections(null);
                          setDirectionsError("ไม่สามารถสร้างเส้นทางบนถนนได้ในขณะนี้");
                        }
                      }}
                    />
                  )}
                  <Marker position={mapCenter} title={trip?.start_address || "จุดเริ่มต้น"} />
                  {directions && (
                    <DirectionsRenderer
                      directions={directions}
                      options={{
                        suppressMarkers: true,
                        preserveViewport: false,
                        polylineOptions: {
                          strokeColor: "#015185",
                          strokeOpacity: 0.9,
                          strokeWeight: 5,
                        },
                      }}
                    />
                  )}
                  {places.map((place, index) => (
                    <Marker
                      key={place.place_id}
                      position={{ lat: place.latitude, lng: place.longitude }}
                      label={{ text: `${index + 1}`, color: "white", fontSize: "12px" }}
                      title={place.place_name}
                    />
                  ))}
                </GoogleMap>
              )}
              {directionsError && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {directionsError}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-2xl shadow-lg p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-prompt font-bold text-lg text-[#102a6b]">สถานที่ตามลำดับที่คุณเลือก</h3>
                    <p className="text-sm text-[#5990c0]">
                      คุณสามารถลบสถานที่ที่เลือกไว้หรือเพิ่มสถานที่จากผล POI ที่คำนวณมาแล้วได้ตรงนี้
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmSelection}
                    disabled={places.length === 0}
                    className="rounded-xl bg-gradient-to-r from-[#102a6b] to-[#015185] px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    ยืนยันไปจัดทริป
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#5990c0]/20 bg-[#f8fbff] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-semibold text-[#102a6b]">สถานที่ที่เลือกไว้</h4>
                      <span className="text-xs text-[#5990c0]">{places.length} แห่ง</span>
                    </div>
                    {places.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#5990c0]/30 px-3 py-4 text-sm text-[#5990c0]">
                        ยังไม่มีสถานที่ที่เลือกไว้
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {places.map((place, index) => (
                          <div key={place.place_id} className="rounded-xl border border-[#5990c0]/20 bg-white p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-[#102a6b]">{index + 1}. {place.place_name}</div>
                                <div className="text-xs text-[#5990c0] mt-1">
                                  {place.district ? `${place.district}, ` : ""}{place.province ?? ""}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#5990c0]/20 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-semibold text-[#102a6b]">จากผล POI ที่คำนวณมา</h4>
                      <span className="text-xs text-[#5990c0]">{nearbyPoiPlaces.length} แห่ง</span>
                    </div>
                    <div className="space-y-2">
                      {nearbyPoiPlaces.map((place) => {
                        const placeId = place.place_id || place.placeId;
                        const isSelected = selectedPlaceIds.includes(placeId);

                        return (
                          <div key={placeId} className="rounded-xl border border-[#5990c0]/20 bg-[#f8fbff] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-semibold text-[#102a6b]">{place.place_name}</div>
                                <div className="text-xs text-[#5990c0] mt-1">
                                  {place.district ? `${place.district}, ` : ""}{place.province ?? ""}
                                </div>
                                <div className="mt-1 text-[11px] font-semibold text-[#015185]">
                                  {place.distanceKm.toFixed(1)} km จากสถานที่ที่เลือก
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => togglePlaceSelection(placeId)}
                                disabled={isSelected}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isSelected ? "bg-gray-300 text-gray-700" : "bg-[#015185] text-white"}`}
                              >
                                {isSelected ? "เลือกแล้ว" : "เพิ่ม"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
