import {
  View, Text, ScrollView, StyleSheet, Pressable, RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin, Clock, Sun, CaretRight, Crosshair, Compass } from "phosphor-react-native";
import { CategoryDot } from "@/components/ui/CategoryDot";
import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import Animated from "react-native-reanimated";
import { useCollapsingHeader, CompactHeader } from "@/components/ui/CollapsingHeader";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, shadow, SCROLL_BOTTOM_PAD } from "@/constants/theme";
import { EmptyState } from "@/components/ui/EmptyState";
import { MicroLabel } from "@/components/ui/MicroLabel";
import { Pill } from "@/components/ui/Pill";
import { Avatar } from "@/components/ui/Avatar";
import { ScreenTitle } from "@/components/ui/CollapsingHeader";
import { FadeIn } from "@/components/FadeIn";
import { ScalePress } from "@/components/ScalePress";
import type { TravelEvent, Trip } from "@/shared/types";
import { toLngLat, isSamePoint, AREA_PLACE_TYPES, distanceKm, formatDistance } from "@/shared/coordinates";
import { getDestinationTz, todayInTz, nowInTz } from "@/shared/timezones";
import { PreTripSheetContent, PostTripSheetContent } from "@/components/TodayPreTrip";
import { useFlightLiveData } from "@/hooks/useFlightLiveData";

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
  t = t.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  t = t.replace(/\s+[-–—·]\s+|:\s+/g, " — ");
  return t;
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
    geocodeCache[key] = center ?? null;
    return center ?? null;
  } catch {
    geocodeCache[key] = null;
    return null;
  }
}


function timeToMinutes(t: string): number {
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  const m = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return 720;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const pm = m[3].toUpperCase() === "PM";
  if (pm && h < 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return "Now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
}

function tripDayInfo(trip: Trip): { day: number; total: number } {
  const tz = getDestinationTz(trip.destination);
  const today = todayInTz(tz);
  const s = new Date(trip.start + "T00:00:00");
  const e = new Date(trip.end + "T00:00:00");
  const t = new Date(today + "T00:00:00");
  const day = Math.floor((t.getTime() - s.getTime()) / 86400000) + 1;
  const total = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return { day, total };
}

function findActiveTrip(trips: Trip[]): Trip | null {
  for (const t of trips) {
    const tz = getDestinationTz(t.destination);
    const today = todayInTz(tz);
    if (t.start <= today && t.end >= today) return t;
  }
  return null;
}

function getTodayEvents(trip: Trip): TravelEvent[] {
  const tz = getDestinationTz(trip.destination);
  const today = todayInTz(tz);
  const evts = trip.events.filter(e => e.date === today);
  evts.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return evts;
}

interface WeatherData {
  temp: number;
  description: string;
  icon: string;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  high?: number;
  low?: number;
  rainChance?: number;
}

const WEATHER_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_KEY;

async function geocodeDestination(destination: string): Promise<{ lat: number; lon: number } | null> {
  if (!WEATHER_KEY) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(destination)}&limit=1&appid=${WEATHER_KEY}`
    );
    const json = await res.json();
    if (!json[0]) return null;
    return { lat: json[0].lat, lon: json[0].lon };
  } catch {
    return null;
  }
}

async function fetchCurrentWeather(destination: string): Promise<WeatherData | null> {
  const geo = await geocodeDestination(destination);
  if (!geo) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${geo.lat}&lon=${geo.lon}&units=metric&appid=${WEATHER_KEY}`
    );
    const json = await res.json();
    return {
      temp: Math.round(json.main.temp),
      description: json.weather[0].description,
      icon: json.weather[0].icon,
      feelsLike: Math.round(json.main.feels_like),
      humidity: json.main.humidity,
      windSpeed: Math.round(json.wind.speed * 3.6),
    };
  } catch {
    return null;
  }
}

async function fetchForecastWeather(destination: string, targetDate: string): Promise<WeatherData | null> {
  const geo = await geocodeDestination(destination);
  if (!geo) return null;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${geo.lat}&lon=${geo.lon}&units=metric&appid=${WEATHER_KEY}`
    );
    const json = await res.json();
    const targetDay = targetDate.slice(0, 10);
    const dayEntries = (json.list ?? []).filter((e: any) => (e.dt_txt as string).startsWith(targetDay));
    if (dayEntries.length === 0) return null;
    const midday = dayEntries.find((e: any) => (e.dt_txt as string).includes("12:00")) ?? dayEntries[0];
    const high = Math.round(Math.max(...dayEntries.map((e: any) => e.main.temp_max)));
    const low = Math.round(Math.min(...dayEntries.map((e: any) => e.main.temp_min)));
    const maxRainChance = Math.round(Math.max(...dayEntries.map((e: any) => (e.pop ?? 0) * 100)));
    return {
      temp: Math.round(midday.main.temp),
      description: midday.weather[0].description,
      icon: midday.weather[0].icon,
      high,
      low,
      rainChance: maxRainChance,
    };
  } catch {
    return null;
  }
}


function getNextEvent(events: TravelEvent[], tz?: string): { event: TravelEvent; minsUntil: number } | null {
  const { minutes: nowMins } = nowInTz(tz);
  for (const ev of events) {
    const evMins = timeToMinutes(ev.time);
    if (evMins > nowMins) return { event: ev, minsUntil: evMins - nowMins };
  }
  return null;
}

export default function TodayScreen() {
  const { C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips, reload } = useTrips();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [destCenter, setDestCenter] = useState<[number, number] | null>(null);
  const mapViewRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const { height: winH } = useWindowDimensions();
  // The map is a hero at the top of a normal page; the content scrolls up over it
  const mapH = Math.round(winH * 0.46);

  const onRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const activeTrip = useMemo(() => findActiveTrip(trips), [trips]);

  // Find the next upcoming trip if none active
  const upcomingTrip = useMemo(() => {
    if (activeTrip) return null;
    const future = trips.filter(t => {
      const tz = getDestinationTz(t.destination);
      return t.start > todayInTz(tz);
    }).sort((a, b) => a.start.localeCompare(b.start));
    return future[0] ?? null;
  }, [trips, activeTrip]);

  const mostRecentTrip = useMemo(() => {
    if (activeTrip || upcomingTrip) return null;
    return [...trips].sort((a, b) => b.end.localeCompare(a.end))[0] ?? null;
  }, [trips, activeTrip, upcomingTrip]);

  const displayTrip = activeTrip ?? upcomingTrip ?? mostRecentTrip;
  const isPreview = !activeTrip && !!upcomingTrip;
  // Before and after a trip the map is a backdrop: region view, no pins
  const isLiveDay = !!activeTrip;

  const destTz = useMemo(() => getDestinationTz(displayTrip?.destination), [displayTrip?.destination]);
  const previewTrip = upcomingTrip ?? mostRecentTrip;
  const displayEvents = useMemo(() => {
    if (activeTrip) return getTodayEvents(activeTrip);
    if (previewTrip) {
      return previewTrip.events
        .filter(e => e.type !== "flight" && (e.location || e.locationCoords))
        .sort((a, b) => a.date.localeCompare(b.date) || timeToMinutes(a.time) - timeToMinutes(b.time))
        .slice(0, 40);
    }
    return [];
  }, [activeTrip, previewTrip]);
  const next = useMemo(() => activeTrip ? getNextEvent(displayEvents, destTz) : null, [activeTrip, displayEvents, destTz]);
  const dayInfo = useMemo(() => activeTrip ? tripDayInfo(activeTrip) : null, [activeTrip]);
  const nowMins = useMemo(() => activeTrip ? nowInTz(destTz).minutes : -1, [activeTrip, destTz]);
  const pastCount = useMemo(() => activeTrip ? displayEvents.filter(e => timeToMinutes(e.time) < nowMins).length : 0, [activeTrip, displayEvents, nowMins]);

  const daysUntilNext = useMemo(() => {
    if (upcomingTrip) return Math.ceil((new Date(upcomingTrip.start + "T00:00:00").getTime() - Date.now()) / 86400000);
    return 0;
  }, [upcomingTrip]);


  const weatherTrip = activeTrip ?? upcomingTrip;
  const [weather, setWeather] = useState<WeatherData | null>(null);
  useEffect(() => {
    const dest = weatherTrip?.destination;
    if (!dest) return;
    setWeather(null);
    if (activeTrip) {
      fetchCurrentWeather(dest).then(setWeather);
    } else {
      fetchForecastWeather(dest, weatherTrip.start).then(w => {
        if (w) setWeather(w);
        else fetchCurrentWeather(dest).then(setWeather);
      });
    }
  }, [weatherTrip?.destination, !!activeTrip]);


  useEffect(() => {
    setDestCenter(null);
    const dest = displayTrip?.destination;
    if (!dest) return;
    geocodeLocation(dest).then(c => { if (c) setDestCenter(c); });
  }, [displayTrip?.destination]);

  useEffect(() => { setMapReady(false); }, [isDark]);

  // ── Geocode event locations for map markers ──
  const [eventCoords, setEventCoords] = useState<Record<string, [number, number]>>({});
  const eventRowYs = useRef<Record<string, number>>({});
  const listY = useRef(0);
  const scheduleScrollRef = useRef<ScrollView>(null);
  const { onScroll, barStyle } = useCollapsingHeader();
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

  useEffect(() => {
    if (!displayEvents.length || !destCenter) { setEventCoords({}); return; }
    let cancelled = false;
    const locMap = new Map<string, string[]>();
    for (const ev of displayEvents) {
      if (!ev.location) continue;
      if (ev.locationCoords) continue;
      const key = ev.location.toLowerCase().trim();
      if (!locMap.has(key)) locMap.set(key, []);
      locMap.get(key)!.push(ev.id);
    }
    const directCoords: Record<string, [number, number]> = {};
    for (const ev of displayEvents) {
      const stored = toLngLat(ev.locationCoords, destCenter);
      // Stored coords equal to the destination centroid are a failed geocode, not a venue
      if (stored && !isSamePoint(stored, destCenter)) directCoords[ev.id] = stored;
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
            label: isLiveDay ? String(index + 1) : "",
            type: ev.type,
            title: normaliseTitle(ev.title, ev.type, ev.transferType),
            isPast: isPreview ? false : timeToMinutes(ev.time) < nowMins,
          },
        };
      })
      .filter(Boolean);
    return { type: "FeatureCollection" as const, features };
  }, [displayEvents, eventCoords, nowMins, isPreview, destCenter, isLiveDay]);

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
          zoomLevel: isLiveDay ? 15 : 7,
          pitch: isLiveDay ? 55 : 0,
          animationDuration: 1200,
          animationMode: "flyTo",
        });
      }
      return;
    }
    const padBottom = 56;
    const padTop = insets.top + 56;
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
  }, [markerCoords, destCenter, insets.top, isLiveDay]);

  const homeCoord = destCenter;
  const snapBack = useCallback(() => {
    if (markerCoords.length > 0) {
      fitToMarkers();
    } else if (cameraRef.current && homeCoord) {
      cameraRef.current.setCamera({
        centerCoordinate: homeCoord,
        zoomLevel: isLiveDay ? 15 : 7,
        pitch: isLiveDay ? 55 : 0,
        animationDuration: 1200,
        animationMode: "flyTo",
      });
    }
  }, [homeCoord, markerCoords, fitToMarkers, isLiveDay]);

  useEffect(() => {
    if (mapReady && markerCoords.length > 0) fitToMarkers();
  }, [mapReady, markerCoords.length > 0]);

  // Recentre each time the tab is opened
  useFocusEffect(useCallback(() => { snapBack(); }, [snapBack]));

  const handleMarkerPress = useCallback((e: any) => {
    const feature = e?.features?.[0];
    if (!feature?.properties?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const evId = feature.properties.id;
    if (!isLiveDay) {
      router.push({ pathname: "/trip/event", params: { tripId: displayTrip?.id ?? "", eventId: evId } });
      return;
    }
    setHighlightedEventId(evId);
    setTimeout(() => setHighlightedEventId(null), 800);
    const y = eventRowYs.current[evId];
    if (y != null && scheduleScrollRef.current) {
      scheduleScrollRef.current.scrollTo({ y: Math.max(0, mapH + listY.current + y - 120), animated: true });
    }
  }, [isLiveDay, displayTrip?.id, router, mapH]);

  const flyToEvent = useCallback((evId: string) => {
    const coord = eventCoords[evId];
    if (!coord || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: coord,
      zoomLevel: 16.5,
      pitch: 60,
      animationDuration: 800,
      animationMode: "flyTo",
    });
  }, [eventCoords]);

  const circleColorExpr: any = useMemo(() => [
    "match", ["get", "type"],
    "flight", C.flight,
    "hotel", C.hotel,
    "activity", C.activity,
    "dining", C.dining,
    "transfer", C.transfer,
    C.teal,
  ], [C]);

  const circleOpacityExpr: any = useMemo(() => [
    "case", ["get", "isPast"], 0.35, 1,
  ], []);

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // ── Local time strip ──
  const deviceTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const showLocalTime = !!destTz && destTz !== deviceTz;
  const [localTimeStr, setLocalTimeStr] = useState("");
  useEffect(() => {
    if (!showLocalTime || !destTz) return;
    const fmt = () => {
      try {
        setLocalTimeStr(
          new Intl.DateTimeFormat("en-US", { timeZone: destTz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date())
        );
      } catch {}
    };
    fmt();
    const id = setInterval(fmt, 60000);
    return () => clearInterval(id);
  }, [showLocalTime, destTz]);

  const nextFlight = next?.event.type === "flight" ? next.event : null;
  const { data: nextFlightLive } = useFlightLiveData(nextFlight?.flightNum, nextFlight?.date);
  const hoursFromHome = useMemo(() => {
    if (!showLocalTime || !destTz) return 0;
    try {
      const now = new Date();
      const toMins = (tz: string) => {
        const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hour12: false }).formatToParts(now);
        const h = parseInt(p.find(x => x.type === "hour")?.value ?? "0") % 24;
        const m = parseInt(p.find(x => x.type === "minute")?.value ?? "0");
        return h * 60 + m;
      };
      let diff = toMins(destTz) - toMins(deviceTz);
      if (diff > 720) diff -= 1440;
      if (diff < -720) diff += 1440;
      return Math.round(diff / 30) / 2;
    } catch { return 0; }
  }, [showLocalTime, destTz, deviceTz]);

  // ── Traveler avatars ──
  const [showTravelerNames, setShowTravelerNames] = useState(false);
  const AVATAR_COLORS = useMemo(() => [C.teal, C.hotel, C.activity, C.dining, C.transfer, C.green], [C]);

  // No trips at all — empty state
  if (!displayTrip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: SCROLL_BOTTOM_PAD }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
        >
          <ScreenTitle>Today</ScreenTitle>
          <View style={styles.headerSection}>
            <Text style={[styles.dateLabel, { color: C.textTertiary }]}>{dateLabel}</Text>
          </View>
          <View style={{ paddingTop: S["2xl"] }}>
            <EmptyState
              icon={<Compass size={32} color={C.textTertiary} weight="regular" />}
              title="No trips yet"
              message={"When you join a trip, your schedule\nand daily plans will appear here."}
              cta={{
                label: "Join a trip",
                onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.navigate({ pathname: "/(tabs)", params: { join: "1" } }); },
              }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Animated.ScrollView
        ref={scheduleScrollRef as any}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SCROLL_BOTTOM_PAD }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} progressBackgroundColor={C.bg} />}
      >
      {/* ── Map hero (3D street level on trip days, flat overview otherwise) ── */}
      <View style={{ height: mapH, backgroundColor: C.elevated }}>
      {!!destCenter && !!MapboxGL && (
        <MapboxGL.MapView
          ref={mapViewRef}
          key={isDark ? "dark" : "light"}
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
            animationDuration={0}
          />
          {isLiveDay && (
            <MapboxGL.UserLocation visible showsUserHeadingIndicator androidRenderMode="compass" />
          )}
          {mapReady && markerFeatures.features.length > 0 && (
            <MapboxGL.ShapeSource
              id="today-event-markers"
              shape={markerFeatures}
              onPress={handleMarkerPress}
              hitbox={{ width: 30, height: 30 }}
            >
              <MapboxGL.CircleLayer
                id="event-marker-glow"
                style={{
                  circleRadius: 16,
                  circleColor: circleColorExpr,
                  circleOpacity: ["case", ["get", "isPast"], 0.06, 0.15],
                  circleEmissiveStrength: 1,
                }}
              />
              <MapboxGL.CircleLayer
                id="event-marker-fill"
                style={{
                  circleRadius: 12,
                  circleColor: circleColorExpr,
                  circleOpacity: circleOpacityExpr,
                  circleEmissiveStrength: 1,
                  circleStrokeWidth: 2.5,
                  circleStrokeColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.9)",
                  circleStrokeOpacity: circleOpacityExpr,
                }}
              />
              <MapboxGL.SymbolLayer
                id="event-marker-labels"
                style={{
                  textField: ["get", "label"],
                  textFont: ["DIN Pro Bold"],
                  textSize: 11,
                  textColor: "#fff",
                  textHaloColor: "rgba(0,0,0,0.3)",
                  textHaloWidth: 0.5,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                  textOpacity: circleOpacityExpr,
                  textEmissiveStrength: 1,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
        </MapboxGL.MapView>
      )}

      {/* Recenter button over the map */}
      <View style={{ position: "absolute", top: insets.top + 4, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }} pointerEvents="box-none">
        {markerCoords.length > 0 && (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); fitToMarkers(); }}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: C.glass,
              borderWidth: 1, borderColor: C.glassBorder,
              alignItems: "center" as const, justifyContent: "center" as const,
              marginRight: S.md, opacity: pressed ? 0.6 : 1,
              ...shadow("deep", isDark),
            })}
            accessibilityRole="button"
            accessibilityLabel="Recenter map on events"
            hitSlop={6}
          >
            <Crosshair size={18} color={C.teal} weight="bold" />
          </Pressable>
        )}
      </View>
      </View>

      {/* ── Page content, lifted over the bottom edge of the map ── */}
      <View style={{ marginTop: -R.xl, backgroundColor: C.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: S.xs }}>
        <View>
        {!isLiveDay && upcomingTrip ? (
          <PreTripSheetContent trip={upcomingTrip} />
        ) : !isLiveDay && mostRecentTrip ? (
          <PostTripSheetContent trip={mostRecentTrip} />
        ) : (
        <>
        {/* ── Zone 1: Compact Header ── */}
        <FadeIn delay={0}>
        <View style={styles.headerSection}>
          <Text style={[styles.scope, { color: C.textTertiary }]}>
            {isPreview ? "Your first day" : "Today"}
            {" · "}
            {new Date((isPreview ? displayTrip.start : todayInTz(destTz)) + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </Text>
          {/* Row A: Trip name + badge */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${displayTrip.id}`); }}
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityLabel={`Open trip ${displayTrip.name}`}
            >
              <Text style={[styles.tripName, { color: C.textPrimary }]} numberOfLines={1}>{displayTrip.name}</Text>
            </Pressable>
            {isPreview && daysUntilNext > 0 ? (
              <Pill tone="custom" bg={C.tealDim} color={C.tealText} label={daysUntilNext === 1 ? "Tomorrow" : `In ${daysUntilNext}d`} />
            ) : isPreview && mostRecentTrip ? (
              <Pill tone="custom" bg={C.elevated} color={C.textTertiary} label="Past" />
            ) : dayInfo ? (
              <Pill tone="custom" bg={C.tealDim} color={C.tealText} label={`Day ${dayInfo.day}/${dayInfo.total}`} />
            ) : null}
          </View>

          {/* Row B: Context strip — destination + weather + local time */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
            {displayTrip.destination && (
              <>
                <MapPin size={10} color={C.textTertiary} weight="fill" />
                <Text style={{ fontSize: T.sm, fontWeight: T.semibold, color: C.textSecondary, flexShrink: 1 }} numberOfLines={1}>{displayTrip.destination}</Text>
              </>
            )}
            {weather && displayTrip.destination && (
              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.textDim, opacity: 0.4 }} />
            )}
            {weather && (
              <Text style={{ fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary }} numberOfLines={1}>
                {weather.temp}°, {weather.description}
              </Text>
            )}
            {showLocalTime && localTimeStr ? (
              <>
                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.textDim, opacity: 0.4 }} />
                <Clock size={10} color={C.textTertiary} weight="bold" />
                <Text style={{ fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary }}>
                  {localTimeStr}{hoursFromHome !== 0 ? ` (${hoursFromHome > 0 ? "+" : ""}${hoursFromHome}h)` : ""}
                </Text>
              </>
            ) : null}
          </View>

          {/* Row D: Traveler avatars */}
          {(displayTrip.travelers?.length ?? 0) > 0 && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTravelerNames(v => !v); }}
              style={{ flexDirection: "row", alignItems: "center", marginTop: S.xs }}
              accessibilityRole="button"
              accessibilityLabel={`${displayTrip.travelers!.length} ${displayTrip.travelers!.length === 1 ? "traveller" : "travellers"}, show names`}
              accessibilityState={{ expanded: showTravelerNames }}
            >
              <View style={{ flexDirection: "row", marginRight: S.xs }}>
                {displayTrip.travelers!.slice(0, 6).map((t, i) => {
                  const col = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  return (
                    <View key={t.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
                      <Avatar size={26} initials={t.initials} color={col} ringColor={isDark ? C.card : C.bg} />
                    </View>
                  );
                })}
                {displayTrip.travelers!.length > 6 && (
                  <View style={{ marginLeft: -8 }}>
                    <Avatar size={26} initials={`+${displayTrip.travelers!.length - 6}`} color={C.textTertiary} ringColor={isDark ? C.card : C.bg} />
                  </View>
                )}
              </View>
              <Text style={{ fontSize: T.xs, fontWeight: T.medium, color: C.textTertiary }}>
                {displayTrip.travelers!.length} {displayTrip.travelers!.length === 1 ? "traveller" : "travellers"}
              </Text>
            </Pressable>
          )}
          {showTravelerNames && (displayTrip.travelers?.length ?? 0) > 0 && (
            <View style={{
              marginTop: S.xs2, paddingVertical: S.xs, paddingHorizontal: S.sm,
              backgroundColor: C.card, borderRadius: R.lg,
            }}>
              {displayTrip.travelers!.map((t) => (
                <Text key={t.id} style={{
                  fontSize: T.sm, fontWeight: T.medium,
                  color: C.textSecondary, paddingVertical: 3,
                }}>
                  {t.name}
                </Text>
              ))}
            </View>
          )}
        </View>
        </FadeIn>

        {/* Compact NEXT UP banner (active trip only) */}
        {!isPreview && next && (() => {
          return (
            <FadeIn delay={60}>
            <ScalePress
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: next.event.id } });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Next up: ${normaliseTitle(next.event.title, next.event.type, next.event.transferType)}, ${formatCountdown(next.minsUntil)}`}
              style={{
                flexDirection: "row", alignItems: "center",
                marginHorizontal: S.md, marginTop: S.xs,
                paddingVertical: S.sm2, paddingHorizontal: S.md,
                borderRadius: R.lg, backgroundColor: C.card,
                gap: S.xs,
                ...shadow("card", isDark),
              }}
            >
              <CategoryDot type={next.event.type} transferType={next.event.transferType} size={28} />
              <MicroLabel color={C.textSecondary} style={{ marginRight: S["2xs"] }}>Next</MicroLabel>
              <Text style={{ fontSize: T.sm, fontWeight: "700", color: C.textPrimary, flex: 1 }} numberOfLines={1}>
                {normaliseTitle(next.event.title, next.event.type, next.event.transferType)}
              </Text>
              <Text style={{ fontSize: T.xs, fontWeight: "800", color: C.tealText }}>{formatCountdown(next.minsUntil)}</Text>
            </ScalePress>
            {nextFlightLive && (nextFlightLive.status || nextFlightLive.gate || nextFlightLive.terminal) ? (
              <Text style={{ fontSize: T.sm, color: C.textSecondary, marginHorizontal: S.md, marginTop: S.xs2, paddingLeft: 28 + S.xs }} numberOfLines={1}>
                {[
                  nextFlightLive.status,
                  nextFlightLive.terminal ? `Terminal ${nextFlightLive.terminal}` : "",
                  nextFlightLive.gate ? `Gate ${nextFlightLive.gate}` : "",
                ].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
            </FadeIn>
          );
        })()}

        {/* ── Zone 2: Schedule ── */}
        {/* Section header */}
        <FadeIn delay={120}>
        <View style={styles.timelineSection}>
          {!isPreview && displayEvents.length > 0 && (
            <Text style={[styles.sectionCount, { color: C.textTertiary, textAlign: "right", marginBottom: 2 }]}>
              {pastCount} of {displayEvents.length} done
            </Text>
          )}
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginBottom: S.xs }} />
        </View>
        </FadeIn>

        {displayEvents.length > 0 ? (
          <View style={{ paddingHorizontal: S.md }} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
            {displayEvents.map((ev, i) => {
              const evMins = timeToMinutes(ev.time);
              const isPast = !isPreview && evMins < nowMins;
              const nextEvMins = i < displayEvents.length - 1 ? timeToMinutes(displayEvents[i + 1].time) : Infinity;
              const showNowLine = !isPreview && isPast && nextEvMins > nowMins;

              const hasCoord = !!eventCoords[ev.id];
              const rawKm = hasCoord && stayCoord && ev.type !== "hotel" ? distanceKm(stayCoord, eventCoords[ev.id]) : null;
              const km = rawKm != null && rawKm < 100 ? rawKm : null;
              const isHighlighted = highlightedEventId === ev.id;

              return (
                <View
                  key={ev.id}
                  onLayout={(e) => { eventRowYs.current[ev.id] = e.nativeEvent.layout.y; }}
                >
                  <ScalePress
                    activeScale={0.98}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: ev.id } });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${normaliseTitle(ev.title, ev.type, ev.transferType)}, ${ev.time}`}
                  >
                    <View style={[
                      styles.eventRow,
                      isPast && { opacity: 0.45 },
                      isHighlighted && { backgroundColor: C.tealDim, borderRadius: R.lg, marginHorizontal: -S["2xs"], paddingHorizontal: S["2xs"] },
                    ]}>
                      <Pressable
                        onPress={() => { if (hasCoord) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); flyToEvent(ev.id); } }}
                        disabled={!hasCoord}
                        hitSlop={6}
                        style={{ opacity: hasCoord ? 1 : 0.35 }}
                        accessibilityRole="button"
                        accessibilityLabel="Show event on map"
                      >
                        <CategoryDot type={ev.type} transferType={ev.transferType} size={32} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventTitle, { color: C.textPrimary }]} numberOfLines={2}>
                          {normaliseTitle(ev.title, ev.type, ev.transferType)}
                        </Text>
                        {(ev.location || km != null) && (
                          <Text style={[styles.eventLocation, { color: C.textTertiary, marginTop: 2 }]} numberOfLines={1}>
                            {km != null ? <Text style={{ color: C.tealText, fontWeight: "600" }}>{formatDistance(km)}</Text> : null}
                            {km != null && ev.location ? " · " : ""}
                            {ev.location}
                          </Text>
                        )}
                      </View>
                      <Text style={[styles.eventTime, { color: C.textTertiary }]}>{ev.time}</Text>
                    </View>
                  </ScalePress>
                  {showNowLine && (
                    <View style={styles.nowLineWrap}>
                      <View style={[styles.nowDot, { backgroundColor: C.teal }]} />
                      <View style={[styles.nowLine, { backgroundColor: C.teal }]} />
                      <Text style={[styles.nowLabel, { color: C.tealText }]}>NOW</Text>
                    </View>
                  )}
                  {i < displayEvents.length - 1 && !showNowLine && (
                    <View style={[styles.divider, { backgroundColor: C.border }]} />
                  )}
                </View>
              );
            })}
            {/* See full itinerary */}
            <View style={{ marginTop: S.md }}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${displayTrip.id}`); }}
                style={({ pressed }) => [styles.seeAllBtn, { backgroundColor: C.card, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.seeAllBtnText, { color: C.tealText }]}>See full itinerary</Text>
                <CaretRight size={14} color={C.tealText} weight="regular" style={{ alignSelf: "center" }} />
              </Pressable>
            </View>
          </View>
        ) : (
          <EmptyState
            compact
            icon={<Sun size={28} color={C.textTertiary} weight="regular" />}
            title={isPreview ? "No events on your first day yet" : "No events scheduled for today"}
          />
        )}
        </>
        )}
        </View>
      </View>
      </Animated.ScrollView>
      <CompactHeader title={isLiveDay ? "Today" : (upcomingTrip ? "Next trip" : "Last trip")} barStyle={barStyle} />
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    scope: { fontSize: T.sm, fontWeight: "500", marginBottom: 2 },

    // Header
    headerSection: {
      paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: 0,
    },
    dateLabel: { fontSize: T.base, fontWeight: "600", letterSpacing: 0.2 },
    tripName: { fontSize: T.xl, fontWeight: "700", letterSpacing: -0.3 },

    // Timeline
    timelineSection: {
      paddingHorizontal: S.md, paddingTop: S.md,
    },
    sectionCount: { fontSize: T.xs, fontWeight: "600" },
    eventRow: {
      flexDirection: "row", alignItems: "center",
      paddingVertical: S.sm2, gap: S.sm,
    },
    eventTitle: { fontSize: T.base, fontWeight: "600" },
    eventTime: { fontSize: T.xs, fontWeight: "600" },
    eventLocation: { fontSize: T.xs, fontWeight: "500" },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
    nowLineWrap: {
      flexDirection: "row", alignItems: "center",
      marginVertical: S.xs2,
    },
    nowDot: {
      width: 8, height: 8, borderRadius: 4,
    },
    nowLine: {
      flex: 1, height: 1.5, marginLeft: S["2xs"],
    },
    nowLabel: {
      fontSize: T["2xs"], fontWeight: "800", letterSpacing: 1, marginLeft: S.xs2,
    },

    // See all button
    seeAllBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: S["2xs"], paddingVertical: S.sm, borderRadius: R.xl,
    },
    seeAllBtnText: { fontSize: T.sm, fontWeight: "700" },
  });
}
