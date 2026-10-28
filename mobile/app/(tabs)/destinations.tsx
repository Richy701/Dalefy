import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl,
  ActivityIndicator, useWindowDimensions,
} from "react-native";
import type { ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";

const SHEET_GLASS = isLiquidGlassAvailable();

/** Floating map controls: Liquid Glass like Apple Maps, a dark frosted fill where it isn't available */
function MapGlass({ style, children }: { style: any; children: React.ReactNode }) {
  return SHEET_GLASS
    ? <GlassView glassEffectStyle="regular" style={[style, { overflow: "hidden" }]}>{children}</GlassView>
    : <View style={[style, { backgroundColor: MAP_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: MAP_GLASS_EDGE }]}>{children}</View>;
}
import { Sun, Calendar, NavigationArrow, MapTrifold, WifiSlash } from "phosphor-react-native";
import { WeatherIcon } from "@/components/ui/WeatherIcon";
import { fetchCurrentWeather, type Weather } from "@/services/weather";
import { CategoryDot, categoryIcon } from "@/components/ui/CategoryDot";
import * as Haptics from "@/services/haptics";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from "react-native-reanimated";
import { useCollapsingHeader, CompactHeader } from "@/components/ui/CollapsingHeader";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, S, shadow, SCROLL_BOTTOM_PAD, categoryTone } from "@/constants/theme";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoTripsPage } from "@/components/ui/JoinTripNote";
import { FadeIn } from "@/components/FadeIn";
import { ScalePress } from "@/components/ScalePress";
import type { TravelEvent, Trip } from "@/shared/types";
import { toLngLat, isSamePoint, AREA_PLACE_TYPES, distanceKm, formatDistance } from "@/shared/coordinates";
import { getDestinationTz, IATA_TZ } from "@/shared/timezones";
import { PreTripSheetContent, PostTripSheetContent, SectionHeader, StayCard, LinkRow, tripStays } from "@/components/TodayPreTrip";
import { sheetStyles as ps } from "@/components/todaySheetStyles";
import { useFlightLiveData } from "@/hooks/useFlightLiveData";
import { ArrivalSection, arrivingFlight, landingTime, afterLanding, ARRIVAL_WINDOW_MS } from "@/components/TodayArrival";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useLinkedTravelerId } from "@/hooks/useLinkedTravelerId";
import { calendarDays, dateInZone, scheduledMinutes, selectTodayTrips, visibleTodayEvents, dayEvents, eventTiming, currentOrNext } from "@/shared/today";
import { tidyTitleSeparators, tidyLocation } from "@/shared/eventTitle";

const TYPE_LABELS: Record<string, string> = {
  flight: "Flight", hotel: "Hotel", activity: "Activity",
  dining: "Dining", transfer: "Transfer",
  car: "Transfer", train: "Train", bus: "Bus", ferry: "Ferry", cruise: "Cruise",
};

function cleanTitle(title: string, type: string, transferType?: string): string {
  const labels = [TYPE_LABELS[transferType || ""] || "", TYPE_LABELS[type] || ""];
  for (const l of labels) {
    if (!l) continue;
    const re = new RegExp(`^${l}\\s*[-–·:]\\s*`, "i");
    title = title.replace(re, "");
  }
  return title;
}

function normaliseTitle(title: string, type: string, transferType?: string): string {
  let t = cleanTitle(title, type, transferType);
  return tidyTitleSeparators(t);
}

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch {}


const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

const geocodeCache: Record<string, [number, number] | null> = {};
async function geocodeLocation(loc: string, proximity?: [number, number]): Promise<[number, number] | null> {
  const key = proximity ? `${loc}@${proximity.join(",")}` : loc;
  if (key in geocodeCache) return geocodeCache[key];
  try {
    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(loc)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    if (proximity) url += `&proximity=${proximity.join(",")}`;
    const res = await fetch(url);
    const json = await res.json();
    const feat = json.features?.[0];
    let center = feat?.center as [number, number] | undefined;
    // Event lookups (with proximity) that only match a country/region are not a venue
    if (proximity && center && (feat.place_type ?? []).some((t: string) => AREA_PLACE_TYPES.has(t))) center = undefined;
    if (center) geocodeCache[key] = center;
    return center ?? null;
  } catch {
    return null;
  }
}


function formatCountdown(mins: number): string {
  if (mins <= 0) return "Now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
}

export default function TodayScreen() {
  const { C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, ready, offline, reload } = useTrips();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [destCenter, setDestCenter] = useState<[number, number] | null>(null);
  const mapViewRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const now = useMinuteClock();
  const [mapLoading, setMapLoading] = useState(false);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [focusedMapEventId, setFocusedMapEventId] = useState<string | null>(null);
  const contentY = useRef(0);
  const { height: winH } = useWindowDimensions();
  const mapH = Math.round(winH * 0.54);

  const onRefresh = useCallback(async () => {
    // A light tap when the pull triggers a refresh, like Mail
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const { active: activeTrip, upcoming: upcomingTrip, past: mostRecentTrip } = useMemo(() => selectTodayTrips(trips, now), [trips, now]);
  const displayTrip = activeTrip ?? upcomingTrip ?? mostRecentTrip;
  const isLiveDay = !!activeTrip;
  const destTz = getDestinationTz(displayTrip?.destination);
  const todayISO = dateInZone(now, destTz);
  const linkedTravelerId = useLinkedTravelerId(displayTrip?.id);
  const visibleEvents = useMemo(() => visibleTodayEvents(displayTrip?.events ?? [], linkedTravelerId), [displayTrip?.events, linkedTravelerId]);
  const travellerTrip = useMemo(() => displayTrip ? { ...displayTrip, events: visibleEvents } : null, [displayTrip, visibleEvents]);
  const displayEvents = useMemo(() => activeTrip
    ? dayEvents(visibleEvents, todayISO, destTz, now)
    : (() => {
        const placed = [...visibleEvents].filter(e => e.type !== "flight" && (e.location || e.locationCoords))
          .sort((a, b) => a.date.localeCompare(b.date) || (scheduledMinutes(a.time) ?? Infinity) - (scheduledMinutes(b.time) ?? Infinity));
        // Before and after the trip the map shows where you stay; every activity at once is just noise
        // One pin per hotel: imports often add a hotel row for every night plus check-in and check-out rows
        const seen = new Set<string>();
        const stays = placed.filter(e => {
          if (e.type !== "hotel" || /^check[- ]?out\b/i.test(e.title)) return false;
          const key = (e.location ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return (stays.length ? stays : placed).slice(0, 40);
      })(),
  [activeTrip, visibleEvents, todayISO, destTz, now]);
  const next = useMemo(() => activeTrip ? currentOrNext(displayEvents, destTz, now) : null, [activeTrip, displayEvents, destTz, now]);
  // For a day with nothing on: the first plan on a later day
  const nextPlanned = useMemo(() => [...visibleEvents]
    .filter(e => e.date > todayISO)
    .sort((a, b) => a.date.localeCompare(b.date) || (scheduledMinutes(a.time) ?? Infinity) - (scheduledMinutes(b.time) ?? Infinity))[0] ?? null,
  [visibleEvents, todayISO]);
  const dayInfo = activeTrip ? { day: calendarDays(activeTrip.start, todayISO) + 1, total: calendarDays(activeTrip.start, activeTrip.end) + 1 } : null;

  useEffect(() => {
    setDestCenter(null);
    if (!displayTrip?.destination || !MapboxGL) return;
    let cancelled = false;
    setMapLoading(true);
    geocodeLocation(displayTrip.destination).then(center => {
      if (cancelled) return;
      setDestCenter(center);
      setMapLoading(false);
    });
    return () => { cancelled = true; };
  }, [displayTrip?.destination, mapAttempt]);


  // ── Geocode event locations for map markers ──
  const [eventCoords, setEventCoords] = useState<Record<string, [number, number]>>({});
  const eventRowYs = useRef<Record<string, number>>({});
  const listY = useRef(0);
  const scheduleScrollRef = useRef<ScrollViewInstance>(null);
  const { onScroll, barStyle, scrollY } = useCollapsingHeader();
  // Map controls fade and lift away as the sheet rises over them, like Maps
  const mapControlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 90], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 90], [0, -24], Extrapolation.CLAMP) }],
  }));
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  // The stay to measure from: today's hotel pin, else a hotel on this trip that sits near the destination.
  const stayCoord = useMemo((): [number, number] | null => {
    const nearDest = (c: [number, number]) => !destCenter || distanceKm(c, destCenter) < 200;
    const todayHotel = displayEvents.find(e => e.type === "hotel" && eventCoords[e.id] && nearDest(eventCoords[e.id]));
    if (todayHotel) return eventCoords[todayHotel.id];
    for (const e of displayTrip?.events ?? []) {
      if (e.type !== "hotel" || !e.locationCoords) continue;
      const c = toLngLat(e.locationCoords, destCenter ?? undefined);
      if (c && nearDest(c)) return c;
    }
    return null;
  }, [displayEvents, eventCoords, displayTrip, destCenter]);

  // Weather where the group actually is: the hotel, else the first stop on the map, else the destination
  const weatherCoord = stayCoord ?? displayEvents.map(e => eventCoords[e.id]).find(Boolean) ?? destCenter;
  const weatherKey = weatherCoord ? weatherCoord.map(n => n.toFixed(2)).join(",") : "";
  const [weather, setWeather] = useState<Weather | null>(null);
  useEffect(() => {
    setWeather(null);
    if (!activeTrip?.id || !weatherKey || offline) return;
    let cancelled = false;
    fetchCurrentWeather(weatherKey.split(",").map(Number) as [number, number]).then(value => { if (!cancelled) setWeather(value); });
    return () => { cancelled = true; };
  }, [activeTrip?.id, weatherKey, todayISO, offline, refreshing]);

  useEffect(() => {
    if (!displayEvents.length || !destCenter) { setEventCoords({}); return; }
    let cancelled = false;
    const locMap = new Map<string, string[]>();
    for (const ev of displayEvents) {
      if (!ev.location) continue;
      const storedNear = toLngLat(ev.locationCoords, destCenter);
      // Some imported coords are another city's airport; those get looked up again from the address
      if (storedNear && distanceKm(storedNear, destCenter) < 1500) continue;
      const key = ev.location.toLowerCase().trim();
      if (!locMap.has(key)) locMap.set(key, []);
      locMap.get(key)!.push(ev.id);
    }
    const directCoords: Record<string, [number, number]> = {};
    for (const ev of displayEvents) {
      const stored = toLngLat(ev.locationCoords, destCenter);
      // Stored coords equal to the destination centroid are a failed geocode, not a venue
      if (stored && !isSamePoint(stored, destCenter) && distanceKm(stored, destCenter) < 1500) directCoords[ev.id] = stored;
    }
    if (!cancelled) setEventCoords(prev => ({ ...prev, ...directCoords }));

    Promise.allSettled(
      Array.from(locMap.entries()).map(async ([loc, ids]) => {
        const coord = await geocodeLocation(loc, destCenter);
        return { ids, coord };
      })
    ).then(results => {
      if (cancelled) return;
      const next: Record<string, [number, number]> = { ...directCoords };
      for (const r of results) {
        if (r.status !== "fulfilled" || !r.value.coord) continue;
        for (const id of r.value.ids) next[id] = r.value.coord;
      }
      setEventCoords(next);
    });
    return () => { cancelled = true; };
  }, [displayEvents, destCenter]);

  const markerFeatures = useMemo(() => {
    const features = displayEvents
      .map((ev, index) => {
        const coord = eventCoords[ev.id];
        if (!coord) return null;
        if (destCenter) {
          // A bad geocode lands in another country. Live days keep the city; overviews keep the region.
          const limit = isLiveDay ? 2 : 12;
          const dlat = Math.abs(coord[1] - destCenter[1]);
          const dlng = Math.abs(coord[0] - destCenter[0]);
          if (dlat > limit || dlng > limit) return null;
        }
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: coord },
          properties: {
            id: ev.id,
            index: index + 1,
            type: ev.type,
            title: normaliseTitle(ev.title, ev.type, ev.transferType),
            isPast: isLiveDay && eventTiming(ev, destTz, now).phase === "earlier",
          },
        };
      })
      .filter(Boolean);
    return { type: "FeatureCollection" as const, features };
  }, [displayEvents, eventCoords, now, destTz, destCenter, isLiveDay]);

  // The stay they sleep at tonight: checked in, not yet checked out
  const tonight = useMemo(() => (displayTrip ? tripStays(displayTrip).find(st => st.start <= todayISO && todayISO < st.end) ?? null : null), [displayTrip, todayISO]);

  // Nights per stay, for the map labels: to the stay's end date, else the next stay or the trip end
  const stayNights = useMemo(() => {
    const nights: Record<string, number> = {};
    const hotels = displayEvents.filter(e => e.type === "hotel");
    hotels.forEach((h, i) => {
      const end = h.endDate || hotels[i + 1]?.date || displayTrip?.end;
      const n = end ? calendarDays(h.date, end) : 0;
      if (n > 0) nights[h.id] = n;
    });
    return nights;
  }, [displayEvents, displayTrip?.end]);

  const markerCoords = useMemo(() =>
    markerFeatures.features.map((f: any) => f.geometry.coordinates as [number, number]),
    [markerFeatures]);
  // ── Camera: fit to markers or fall back to destination center ──
  const fitToMarkers = useCallback(() => {
    if (!cameraRef.current) return;
    if (markerCoords.length === 0) {
      if (destCenter) {
        cameraRef.current.setCamera({
          centerCoordinate: destCenter,
          padding: { paddingTop: insets.top + 56, paddingBottom: winH - mapH, paddingLeft: 0, paddingRight: 0 },
          zoomLevel: isLiveDay ? 15 : 7,
          pitch: isLiveDay ? 55 : 0,
          animationDuration: 1200,
          animationMode: "flyTo",
        });
      }
      return;
    }
    // Room for the recenter button at the top and for the labelled pins, which stand above their point
    const padBottom = 56 + (winH - mapH);
    const padTop = insets.top + (isLiveDay ? 56 : 130);
    const lngs = markerCoords.map(c => c[0]);
    const lats = markerCoords.map(c => c[1]);
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
    // A single marker, or several sharing (almost) one point, gives fitBounds a zero-area box
    // and sends the camera to an extreme zoom. Centre on the cluster at a sane zoom instead.
    const MIN_SPAN = 0.003; // ~300 m
    if (markerCoords.length === 1 || (ne[0] - sw[0] < MIN_SPAN && ne[1] - sw[1] < MIN_SPAN)) {
      cameraRef.current.setCamera({
        centerCoordinate: [(ne[0] + sw[0]) / 2, (ne[1] + sw[1]) / 2],
        zoomLevel: 15,
        pitch: isLiveDay ? 55 : 0,
        padding: { paddingTop: padTop, paddingBottom: padBottom, paddingLeft: 40, paddingRight: 40 },
        animationDuration: 1200,
        animationMode: "flyTo",
      });
      return;
    }
    cameraRef.current.fitBounds(
      ne, sw,
      [padTop, 40, padBottom, 40],
      1200
    );
  }, [markerCoords, destCenter, insets.top, isLiveDay, winH, mapH]);

  const homeCoord = destCenter;
  const snapBack = useCallback(() => {
    if (markerCoords.length > 0) {
      fitToMarkers();
    } else if (cameraRef.current && homeCoord) {
      cameraRef.current.setCamera({
        centerCoordinate: homeCoord,
        padding: { paddingTop: insets.top + 56, paddingBottom: winH - mapH, paddingLeft: 0, paddingRight: 0 },
        zoomLevel: isLiveDay ? 15 : 7,
        pitch: isLiveDay ? 55 : 0,
        animationDuration: 1200,
        animationMode: "flyTo",
      });
    }
  }, [homeCoord, markerCoords, fitToMarkers, isLiveDay]);

  const markerPositionKey = markerCoords.map(coord => coord.join(",")).join(";");
  const fitRef = useRef(fitToMarkers);
  fitRef.current = fitToMarkers;
  const snapRef = useRef(snapBack);
  snapRef.current = snapBack;
  useEffect(() => {
    if (mapReady && !focusedMapEventId) fitRef.current();
  }, [mapReady, markerPositionKey, destCenter, focusedMapEventId]);

  // Clock updates must not interrupt a traveller exploring the map.
  useFocusEffect(useCallback(() => { snapRef.current(); }, []));

  const handleMarkerPress = useCallback((evId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isLiveDay) {
      router.push({ pathname: "/trip/event", params: { tripId: displayTrip?.id ?? "", eventId: evId } });
      return;
    }
    setHighlightedEventId(evId);
    setTimeout(() => setHighlightedEventId(null), 800);
    const y = eventRowYs.current[evId];
    if (y != null && scheduleScrollRef.current) {
      scheduleScrollRef.current.scrollTo({ y: Math.max(0, contentY.current + listY.current + y - insets.top - 64), animated: true });
    }
  }, [isLiveDay, displayTrip?.id, router, insets.top]);

  const flyToEvent = useCallback((evId: string) => {
    setFocusedMapEventId(evId);
  }, []);
  useEffect(() => {
    if (!mapReady || !focusedMapEventId) return;
    const coord = eventCoords[focusedMapEventId];
    if (!coord || !cameraRef.current) return;
    cameraRef.current.setCamera({ centerCoordinate: coord, zoomLevel: 16.5, pitch: 45, padding: { paddingTop: insets.top + 56, paddingBottom: winH - mapH, paddingLeft: 0, paddingRight: 0 }, animationDuration: 800, animationMode: "flyTo" });
    scheduleScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [mapReady, focusedMapEventId, eventCoords]);

  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showLocalTime = !!destTz && destTz !== deviceTz;
  const localTimeStr = new Intl.DateTimeFormat("en-GB", { timeZone: destTz, hour: "2-digit", minute: "2-digit" }).format(now);
  const nextFlight = next?.event.type === "flight" ? next.event : null;
  // One live lookup: the flight that may have just landed, else the next one. A flight whose arrival is
  // over (or that was cancelled or diverted) is let go, so the next flight gets the live data and phones
  // stop polling a flight that has finished.
  const [finishedFlights, setFinishedFlights] = useState<Set<string>>(() => new Set());
  const landingFlight = useMemo(() => activeTrip ? arrivingFlight(visibleEvents.filter(e => !finishedFlights.has(e.id)), destTz, now) : null, [activeTrip, visibleEvents, finishedFlights, destTz, now]);
  const liveFlight = landingFlight ?? nextFlight;
  const { data: liveFlightData } = useFlightLiveData(liveFlight?.flightNum, liveFlight?.date, !!landingFlight);
  const nextFlightLive = liveFlight === nextFlight ? liveFlightData : null;
  const landedAt = landingFlight ? landingTime(landingFlight, liveFlightData, destTz, now) : null;
  const landingStatus = (liveFlightData?.status || landingFlight?.status || "").toLowerCase();
  const landingDone = !!landingFlight && ((landedAt != null && now - landedAt > ARRIVAL_WINDOW_MS) || /cancel|divert/.test(landingStatus));
  useEffect(() => {
    if (landingDone && landingFlight) setFinishedFlights(prev => new Set(prev).add(landingFlight.id));
  }, [landingDone, landingFlight]);
  const arrival = landingFlight && landedAt != null && now - landedAt <= ARRIVAL_WINDOW_MS
    ? { flight: landingFlight, landedAt, then: afterLanding(visibleEvents, landingFlight, landedAt, destTz, now) }
    : null;
  // Welcome to the destination only when the flight lands in it, not on the way home
  const arrivalTz = arrival ? arrival.flight.arrTz ?? (arrival.flight.arrAirport ? IATA_TZ[arrival.flight.arrAirport] : undefined) ?? destTz : destTz;
  const arrivalPlace = arrival && displayTrip?.destination && arrivalTz === destTz ? displayTrip.destination.split(",")[0].trim() : null;

  // No trips at all — empty state
  if (!displayTrip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: SCROLL_BOTTOM_PAD }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
        >
          <NoTripsPage screen="today" ready={ready} offline={offline} onRetry={onRefresh} retrying={refreshing} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* The map stays put behind the whole screen, so the glass sheet always has map under it.
          Touches on the clear space above the sheet fall through to it. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.elevated }]}>
      {(!destCenter || !MapboxGL) && (
        <View style={[styles.mapFallback, { height: mapH, flex: 0 }]}>
          {mapLoading && MapboxGL ? <ActivityIndicator color={C.tealText} /> : <MapTrifold size={30} color={C.textTertiary} />}
          <Text style={{ fontSize: T.base, color: C.textSecondary, textAlign: "center" }}>{mapLoading && MapboxGL ? "Finding your trip’s locations…" : "The map is unavailable. Your itinerary is still available below."}</Text>
          {!mapLoading && !!MapboxGL && <Pressable accessibilityRole="button" onPress={() => setMapAttempt(value => value + 1)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ fontSize: T.base, color: C.tealText }}>Try again</Text></Pressable>}
        </View>
      )}
      {!!destCenter && !!MapboxGL && (
        <MapboxGL.MapView
          ref={mapViewRef}
          style={StyleSheet.absoluteFill}
          styleURL="mapbox://styles/mapbox/standard"
          projection="mercator"
          scrollEnabled={true}
          zoomEnabled={true}
          pitchEnabled={true}
          rotateEnabled={true}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          scaleBarEnabled={false}
          onDidFinishLoadingStyle={() => setMapReady(true)}
        >
          <MapboxGL.StyleImport
            id="basemap"
            existing
            config={{
              lightPreset: isDark ? "night" : "day",
              showPointOfInterestLabels: true,
              showTransitLabels: false,
              showPlaceLabels: true,
              showRoadLabels: isLiveDay,
              showAdminBoundaries: isLiveDay,
              showPedestrianRoads: true,
              show3dObjects: true,
              show3dBuildings: true,
              show3dFacades: true,
              show3dTrees: true,
              show3dLandmarks: true,
              showLandmarkIcons: true,
            } as any}
          />
          <MapboxGL.Camera
            ref={cameraRef}
            zoomLevel={isLiveDay ? 15 : 7}
            centerCoordinate={homeCoord ?? destCenter}
            pitch={isLiveDay ? 55 : 0}
            padding={{ paddingTop: insets.top + 56, paddingBottom: winH - mapH, paddingLeft: 0, paddingRight: 0 }}
            animationDuration={0}
          />
          {isLiveDay && (
            <MapboxGL.UserLocation visible showsUserHeadingIndicator androidRenderMode="compass" />
          )}
          {mapReady && !isLiveDay && markerFeatures.features.map((f: any) => {
            const id = f.properties.id as string;
            const PinIcon = categoryIcon(f.properties.type);
            const nights = stayNights[id];
            return (
              <MapboxGL.MarkerView key={id} coordinate={f.geometry.coordinates} anchor={{ x: 0.5, y: 1 }} allowOverlap>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: id } }); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.properties.title}${nights ? `, ${nights} nights` : ""}`}
                  style={styles.pinWrap}
                >
                  <View style={styles.pin}>
                    <View style={[styles.pinIcon, { backgroundColor: categoryTone(f.properties.type, C).fg }]}>
                      <PinIcon size={14} color="#fff" weight="fill" />
                    </View>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.pinTitle} numberOfLines={1}>{String(f.properties.title).split(" – ")[0]}</Text>
                      {nights ? <Text style={styles.pinSub}>{nights} {nights === 1 ? "night" : "nights"}</Text> : null}
                    </View>
                  </View>
                  <View style={styles.pinStem} />
                  <View style={styles.pinPoint} />
                </Pressable>
              </MapboxGL.MarkerView>
            );
          })}
          {/* Today's stops show what they are, like the stay pins before the trip; past ones fade */}
          {mapReady && isLiveDay && markerFeatures.features.map((f: any) => {
            const id = f.properties.id as string;
            const PinIcon = categoryIcon(f.properties.type);
            return (
              <MapboxGL.MarkerView key={id} coordinate={f.geometry.coordinates} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
                <Pressable
                  onPress={() => handleMarkerPress(id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`${f.properties.title}, show in list`}
                  style={[styles.dayPin, { backgroundColor: categoryTone(f.properties.type, C).fg, borderColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.9)", opacity: f.properties.isPast ? 0.35 : 1 }]}
                >
                  <PinIcon size={13} color="#fff" weight="fill" />
                </Pressable>
              </MapboxGL.MarkerView>
            );
          })}
        </MapboxGL.MapView>
      )}

      {/* Over the map: where you are in the trip, like the stay chip before it starts; recenter */}
      <Animated.View style={[styles.mapTop(insets.top), mapControlsStyle]} pointerEvents="box-none">
        {dayInfo ? (
          <MapGlass style={styles.dayChip}>
            <View style={styles.dayChipRow}>
              {weather ? <WeatherIcon condition={weather.condition} isDay={weather.isDay} size={16} color={SHEET_GLASS ? C.textPrimary : "#fff"} /> : null}
              <Text style={[styles.pinTitle, { color: SHEET_GLASS ? C.textPrimary : "#fff", flexShrink: 1 }]} numberOfLines={1}>
                {[weather ? `${weather.temp}°` : "", `Day ${dayInfo.day} of ${dayInfo.total}`, showLocalTime && localTimeStr ? `${localTimeStr} local` : ""].filter(Boolean).join(", ")}
              </Text>
            </View>
          </MapGlass>
        ) : <View />}
        {markerCoords.length > 0 && (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFocusedMapEventId(null); fitToMarkers(); }}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            accessibilityRole="button"
            accessibilityLabel="Recenter map"
            hitSlop={6}
          >
            <MapGlass style={styles.mapButton}>
              <View style={{ transform: [{ scaleX: -1 }] }}><NavigationArrow size={18} color={SHEET_GLASS ? C.textPrimary : "#fff"} weight="fill" /></View>
            </MapGlass>
          </Pressable>
        )}
      </Animated.View>
      </View>

      <Animated.ScrollView
        ref={scheduleScrollRef as any}
        pointerEvents="box-none"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      >
      <View pointerEvents="none" style={{ height: mapH - 28 }} />

      {/* The plan rides up over the map like a Maps sheet */}
      <View onLayout={e => { contentY.current = e.nativeEvent.layout.y; }} style={styles.sheet}>
        {/* The same Liquid Glass as the system sheets (Join, Notifications); a blur where it isn't available */}
        {SHEET_GLASS
          ? <GlassView glassEffectStyle="regular" style={styles.sheetGlass} />
          : <BlurView tint={isDark ? "systemChromeMaterialDark" : "systemChromeMaterialLight"} intensity={100} style={styles.sheetGlass} />}
        <View style={styles.grabber} />
        {offline && <View style={styles.offlineNote}><WifiSlash size={16} color={C.textSecondary} /><Text style={{ fontSize: T.base, color: C.textSecondary, flex: 1 }}>You’re offline. Showing saved trip details.</Text></View>}
        <View>
        {!isLiveDay && upcomingTrip ? (
          <PreTripSheetContent trip={travellerTrip!} todayISO={todayISO} weatherCoord={weatherCoord} />
        ) : !isLiveDay && mostRecentTrip ? (
          <PostTripSheetContent trip={travellerTrip!} todayISO={todayISO} />
        ) : (
        <>
        {/* Same sections and rows as the sheet before the trip: what's next, the day, then the trip */}
        {arrival ? (
          <ArrivalSection
            tripId={displayTrip.id}
            flight={arrival.flight}
            live={liveFlightData}
            landedAt={arrival.landedAt}
            then={arrival.then}
            place={arrivalPlace}
            timeZone={arrivalTz}
            weather={arrivalPlace ? weather : null}
            title={ev => normaliseTitle(ev.title, ev.type, ev.transferType)}
            now={now}
            C={C}
          />
        ) : next && (
          <FadeIn delay={0}>
            <SectionHeader
              title={next.phase === "current" ? "Happening now" : "Next up"}
              C={C}
              first
            />
            <ScalePress
              activeScale={0.985}
              onPress={() => { Haptics.selectionAsync(); router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: next.event.id } }); }}
              accessibilityRole="button"
              accessibilityLabel={`${next.phase === "current" ? "Happening now" : "Next up"}: ${normaliseTitle(next.event.title, next.event.type, next.event.transferType)}, ${next.event.time}`}
            >
              <View style={[ps.row, ps.rowTop]}>
                <View style={ps.iconOnTitle}><CategoryDot type={next.event.type} transferType={next.event.transferType} size={32} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[ps.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>{normaliseTitle(next.event.title, next.event.type, next.event.transferType)}</Text>
                  <Text style={[ps.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
                    {[
                      // The countdown only helps when it's close; further out the clock time says it
                      next.phase !== "current" && (next.minsUntil ?? Infinity) <= 60 ? formatCountdown(next.minsUntil ?? 0).replace(/^in /, "In ") : "",
                      scheduledMinutes(next.event.time) == null ? "Time to be confirmed" : next.event.time,
                      tidyLocation(next.event.location),
                    ].filter(Boolean).join(", ")}
                  </Text>
                </View>
              </View>
              {(nextFlightLive?.terminal || nextFlightLive?.gate || nextFlightLive?.status) ? (
                <View style={[ps.flightMeta, { borderTopColor: C.border }]}>
                  {nextFlightLive.terminal ? <Text style={[ps.metaText, { color: C.textSecondary }]}>Terminal {nextFlightLive.terminal}</Text> : null}
                  {nextFlightLive.gate ? <Text style={[ps.metaText, { color: C.textSecondary }]}>Gate {nextFlightLive.gate}</Text> : null}
                  {nextFlightLive.status ? <Text style={[ps.metaText, { color: C.tealText, fontWeight: T.semibold }]}>{nextFlightLive.status}</Text> : null}
                </View>
              ) : null}
            </ScalePress>
          </FadeIn>
        )}

        <FadeIn delay={60}>
          <SectionHeader
            title={`Today, ${new Date(todayISO + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`}
            C={C}
            first={!next && !arrival}
          />
        </FadeIn>

        {displayEvents.length > 0 ? (
          <View onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
            {displayEvents.map((ev, i) => {
              const timing = eventTiming(ev, destTz, now);
              const isPast = timing.phase === "earlier";

              const hasCoord = !!eventCoords[ev.id];
              const rawKm = hasCoord && stayCoord && ev.type !== "hotel" ? distanceKm(stayCoord, eventCoords[ev.id]) : null;
              const km = rawKm != null && rawKm < 100 ? rawKm : null;
              const isHighlighted = highlightedEventId === ev.id;
              const unscheduled = timing.phase === "unscheduled";

              return (
                <View
                  key={ev.id}
                  onLayout={(e) => { eventRowYs.current[ev.id] = e.nativeEvent.layout.y; }}
                >
                  <ScalePress
                    activeScale={0.98}
                    onPress={() => {
                      Haptics.selectionAsync();
                      router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: ev.id } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${normaliseTitle(ev.title, ev.type, ev.transferType)}, ${unscheduled ? "time to be confirmed" : ev.time}`}
                    // The map dot inside the row can't be reached by VoiceOver on its own
                    accessibilityActions={ev.location || ev.locationCoords ? [{ name: "showOnMap", label: "Show on map" }] : undefined}
                    onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === "showOnMap") flyToEvent(ev.id); }}
                  >
                    <View style={[
                      ps.row, ps.rowTop,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
                      isPast && { opacity: 0.5 },
                      isHighlighted && { backgroundColor: C.tealDim, opacity: 1 },
                    ]}>
                      <Pressable
                        onPress={() => { if (ev.location || ev.locationCoords) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); flyToEvent(ev.id); } }}
                        disabled={!ev.location && !ev.locationCoords}
                        hitSlop={6}
                        style={[ps.iconOnTitle, { opacity: ev.location || ev.locationCoords ? 1 : 0.5 }]}
                        accessibilityRole="button"
                        accessibilityLabel="Show event on map"
                      >
                        <CategoryDot type={ev.type} transferType={ev.transferType} size={32} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={[ps.rowTitle, { color: C.textPrimary }]} numberOfLines={2}>
                          {normaliseTitle(ev.title, ev.type, ev.transferType)}
                        </Text>
                        <Text style={[ps.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
                          <Text style={{ color: unscheduled ? C.textSecondary : C.tealText, fontWeight: T.semibold }}>{unscheduled ? "Time to be confirmed" : ev.time}</Text>
                          {km != null ? `, ${formatDistance(km)}` : ""}
                          {ev.location ? `, ${tidyLocation(ev.location)}` : ""}
                        </Text>
                      </View>
                    </View>
                  </ScalePress>
                </View>
              );
            })}
          </View>
        ) : (
          // A free day: say so warmly, and point at the next thing that is planned
          <View>
            <EmptyState
              compact
              symbol="sun.max"
              icon={<Sun size={30} color={C.tealText} weight="duotone" />}
              title="A free day"
              message={nextPlanned ? "Nothing planned today, so the time is yours. Here's what's next." : "Nothing planned today, so the time is yours."}
            />
            {nextPlanned ? (
              <ScalePress
                activeScale={0.985}
                onPress={() => { Haptics.selectionAsync(); router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: nextPlanned.id } }); }}
                accessibilityRole="button"
                accessibilityLabel={`Next up: ${normaliseTitle(nextPlanned.title, nextPlanned.type, nextPlanned.transferType)}`}
                style={[ps.freeNext, { backgroundColor: C.card, borderColor: C.border }]}
              >
                <CategoryDot type={nextPlanned.type} transferType={nextPlanned.transferType} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={[ps.rowSub, { color: C.textTertiary }]}>
                    {new Date(nextPlanned.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                  </Text>
                  <Text style={[ps.rowTitle, { color: C.textPrimary }]} numberOfLines={1}>{normaliseTitle(nextPlanned.title, nextPlanned.type, nextPlanned.transferType)}</Text>
                </View>
                {nextPlanned.time && !/^tb[acd]$/i.test(nextPlanned.time) ? <Text style={[ps.freeTime, { color: C.tealText }]}>{nextPlanned.time}</Text> : null}
              </ScalePress>
            ) : null}
          </View>
        )}

        {/* Where tonight is, with directions back to it */}
        {tonight && (
          <FadeIn delay={120}>
            <SectionHeader title="Tonight" C={C} />
            <StayCard stay={tonight} tripId={displayTrip.id} C={C} />
          </FadeIn>
        )}
        <FadeIn delay={150}>
          <LinkRow label="Full itinerary" onPress={() => { Haptics.selectionAsync(); router.push(`/trip/${displayTrip.id}`); }} C={C} Icon={Calendar} />
        </FadeIn>
        </>
        )}
        </View>
      </View>
      </Animated.ScrollView>
      <CompactHeader title="Today" barStyle={barStyle} />
    </View>
  );
}

// Map overlays are always the dark glass so they read on both the day and night map
const MAP_GLASS = "rgba(24,24,28,0.82)";
const MAP_GLASS_EDGE = "rgba(255,255,255,0.18)";

function makeStyles(C: ThemeColors) {
  return {
    mapTop: (top: number) => ({
      position: "absolute" as const, top: top + 4, left: S.md, right: S.md, zIndex: 10,
      flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: S.sm,
    }),
    ...StyleSheet.create({
    mapButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
    dayChip: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 7, justifyContent: "center", flexShrink: 1 },
    dayChipRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    pinWrap: { alignItems: "center" },
    dayPin: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    pin: {
      flexDirection: "row", alignItems: "center", gap: 7, maxWidth: 250,
      paddingVertical: 5, paddingLeft: 5, paddingRight: 12, borderRadius: 20,
      backgroundColor: MAP_GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: MAP_GLASS_EDGE,
    },
    pinIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    pinTitle: { fontSize: T.sm, fontWeight: T.semibold, color: "#fff" },
    pinSub: { fontSize: T.xs, color: "rgba(255,255,255,0.72)" },
    pinStem: { width: 2, height: 7, backgroundColor: MAP_GLASS },
    pinPoint: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#fff", borderWidth: 2, borderColor: "rgba(24,24,28,0.9)" },
    // Runs to the bottom of the page so its shadow never shows as a band under the content
    sheet: {
      flexGrow: 1, paddingBottom: SCROLL_BOTTOM_PAD,
      marginHorizontal: 6, paddingTop: S.xs,
    },
    // Runs well past the content: iOS leaves room under the content for the tab bar, and the sheet
    // should still reach the bottom of the screen there instead of ending in a hard edge
    sheetGlass: {
      position: "absolute", top: 0, left: 0, right: 0, bottom: -1200,
      borderTopLeftRadius: 34, borderTopRightRadius: 34, overflow: "hidden",
    },
    grabber: { alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: C.border, marginBottom: S.xs },
    mapFallback: { flex: 1, justifyContent: "center", alignItems: "center", gap: S.sm, padding: S.lg },
    offlineNote: { flexDirection: "row", alignItems: "center", gap: S.xs, paddingHorizontal: S.md, paddingTop: S.sm },
    }),
  };
}
