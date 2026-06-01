import {
  View, Text, ScrollView, StyleSheet, Pressable, Platform, RefreshControl, Linking,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  MapPin, Airplane, Bed, Compass, ForkKnife, Car, Train, Bus, Boat, Anchor,
  Clock, NavigationArrow, CalendarDots, Sun, CloudSun, Thermometer,
  Suitcase, Calendar, Globe, CaretRight, Drop, Wind, CloudRain,
  Crosshair,
} from "phosphor-react-native";
import { CachedImage } from "@/components/CachedImage";
import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import { Illustration } from "@/components/Illustration";
import type { TravelEvent, Trip } from "@/shared/types";
import { getDestinationTz, todayInTz, nowInTz } from "@/shared/timezones";

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
  t = t.replace(/\s*[-–·:]\s*/g, " — ");
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
    const center = json.features?.[0]?.center as [number, number] | undefined;
    geocodeCache[key] = center ?? null;
    return center ?? null;
  } catch {
    geocodeCache[key] = null;
    return null;
  }
}

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  flight: Airplane, hotel: Bed, activity: Compass, dining: ForkKnife, transfer: Car,
};
const TRANSFER_ICONS: Record<string, React.ComponentType<any>> = {
  car: Car, train: Train, bus: Bus, ferry: Boat, cruise: Anchor,
};

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

function dayOfTrip(start: string): { day: number; total?: number; end?: string } {
  const s = new Date(start + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return { day: Math.floor((now.getTime() - s.getTime()) / 86400000) + 1 };
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

function tripStats(trip: Trip) {
  const flights = trip.events.filter(e => e.type === "flight").length;
  const hotels = trip.events.filter(e => e.type === "hotel").length;
  const activities = trip.events.filter(e => e.type === "activity" || e.type === "dining").length;
  const totalDays = Math.floor(
    (new Date(trip.end + "T00:00:00").getTime() - new Date(trip.start + "T00:00:00").getTime()) / 86400000
  ) + 1;
  return { flights, hotels, activities, totalDays, totalEvents: trip.events.length };
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
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const { trips, reload } = useTrips();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [destCenter, setDestCenter] = useState<[number, number] | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const mapViewRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const snapPoints = useMemo(() => ["40%", "80%"], []);

  const onRefresh = useCallback(async () => {
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

  const displayTrip = activeTrip ?? upcomingTrip;
  const isPreview = !activeTrip && !!upcomingTrip;

  const destTz = useMemo(() => getDestinationTz(displayTrip?.destination), [displayTrip?.destination]);
  const previewTrip = upcomingTrip ?? mostRecentTrip;
  const displayEvents = useMemo(() => {
    if (activeTrip) return getTodayEvents(activeTrip);
    if (previewTrip) {
      return previewTrip.events
        .filter(e => e.date === previewTrip.start)
        .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
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
  const [sheetIndex, setSheetIndex] = useState(0);
  const { height: screenHeight } = useWindowDimensions();
  const eventRowYs = useRef<Record<string, number>>({});
  const scheduleScrollRef = useRef<ScrollView>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

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
      if (ev.locationCoords) directCoords[ev.id] = ev.locationCoords;
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
          const dlat = Math.abs(coord[1] - destCenter[1]);
          const dlng = Math.abs(coord[0] - destCenter[0]);
          if (dlat > 2 || dlng > 2) return null;
        }
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: coord },
          properties: {
            id: ev.id,
            index: index + 1,
            type: ev.type,
            title: normaliseTitle(ev.title, ev.type, ev.transferType),
            isPast: isPreview ? false : timeToMinutes(ev.time) < nowMins,
          },
        };
      })
      .filter(Boolean);
    return { type: "FeatureCollection" as const, features };
  }, [displayEvents, eventCoords, nowMins, isPreview, destCenter]);

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
          zoomLevel: 14,
          pitch: 55,
          animationDuration: 1200,
          animationMode: "flyTo",
        });
      }
      return;
    }
    const sheetFraction = sheetIndex === 1 ? 0.8 : 0.4;
    const padBottom = screenHeight * sheetFraction + 20;
    const padTop = insets.top + 50;
    if (markerCoords.length === 1) {
      cameraRef.current.setCamera({
        centerCoordinate: markerCoords[0],
        zoomLevel: 15,
        pitch: 55,
        padding: { paddingTop: padTop, paddingBottom: padBottom, paddingLeft: 40, paddingRight: 40 },
        animationDuration: 1200,
        animationMode: "flyTo",
      });
      return;
    }
    const lngs = markerCoords.map(c => c[0]);
    const lats = markerCoords.map(c => c[1]);
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
    cameraRef.current.fitBounds(
      ne, sw,
      [padTop, 40, padBottom, 40],
      1200
    );
  }, [markerCoords, destCenter, sheetIndex, screenHeight, insets.top]);

  const homeCoord = destCenter;
  const snapBack = useCallback(() => {
    if (markerCoords.length > 0) {
      fitToMarkers();
    } else if (cameraRef.current && homeCoord) {
      cameraRef.current.setCamera({
        centerCoordinate: homeCoord,
        zoomLevel: 14,
        pitch: 55,
        animationDuration: 1200,
        animationMode: "flyTo",
      });
    }
  }, [homeCoord, markerCoords, fitToMarkers]);

  useEffect(() => {
    if (mapReady && markerCoords.length > 0) fitToMarkers();
  }, [mapReady, markerCoords.length > 0]);

  useFocusEffect(useCallback(() => { snapBack(); }, [snapBack]));

  const handleMarkerPress = useCallback((e: any) => {
    const feature = e?.features?.[0];
    if (!feature?.properties?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const evId = feature.properties.id;
    setHighlightedEventId(evId);
    setTimeout(() => setHighlightedEventId(null), 800);
    const y = eventRowYs.current[evId];
    if (y != null && scheduleScrollRef.current) {
      scheduleScrollRef.current.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }
    if (sheetRef.current) {
      sheetRef.current.snapToIndex(0);
    }
  }, []);

  const flyToEvent = useCallback((evId: string) => {
    const coord = eventCoords[evId];
    if (!coord || !cameraRef.current) return;
    cameraRef.current.setCamera({
      centerCoordinate: coord,
      zoomLevel: 16,
      pitch: 55,
      animationDuration: 800,
      animationMode: "flyTo",
    });
  }, [eventCoords]);

  const EVENT_COLORS_DARK: Record<string, string> = {
    flight: "#0bd2b5", hotel: "#a78bfa", activity: "#f59e0b", dining: "#fb7185", transfer: "#60a5fa",
  };
  const EVENT_COLORS_LIGHT: Record<string, string> = {
    flight: "#0ab8a0", hotel: "#8b5cf6", activity: "#d97706", dining: "#e11d48", transfer: "#3b82f6",
  };
  const EC = isDark ? EVENT_COLORS_DARK : EVENT_COLORS_LIGHT;

  const circleColorExpr: any = useMemo(() => [
    "match", ["get", "type"],
    "flight", EC.flight,
    "hotel", EC.hotel,
    "activity", EC.activity,
    "dining", EC.dining,
    "transfer", EC.transfer,
    C.teal,
  ], [EC, C.teal]);

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

  // ── Traveler avatars ──
  const [showTravelerNames, setShowTravelerNames] = useState(false);
  const AVATAR_COLORS = useMemo(() => [C.teal, "#a78bfa", "#f59e0b", "#fb7185", "#60a5fa", "#10b981"], [C.teal]);

  // No trips at all — empty state
  if (!displayTrip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.97)" }]} />
          )}
          <Text style={styles.screenTitle}>Today</Text>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 50, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
        >
          <View style={styles.headerSection}>
            <Text style={[styles.dateLabel, { color: C.textTertiary }]}>{dateLabel}</Text>
          </View>
          <View style={styles.emptyContent}>
            <View style={{ paddingTop: 80, alignItems: "center", gap: S.sm }}>
              <View style={[styles.emptyIconWrap, { backgroundColor: C.tealDim }]}>
                <Compass size={32} color={C.teal} weight="regular" />
              </View>
              <Text style={styles.emptyTitle}>No trips yet</Text>
              <Text style={[styles.emptyText, { textAlign: "center" }]}>
                When you join a trip, your schedule{"\n"}and daily plans will appear here.
              </Text>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.navigate({ pathname: "/(tabs)", params: { join: "1" } }); }}
                style={({ pressed }) => [styles.emptyCta, { backgroundColor: C.teal, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.emptyCtaText}>Join a trip</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Full-screen Standard 3D map */}
      {!!destCenter && !!MapboxGL && (
        <MapboxGL.MapView
          ref={mapViewRef}
          key={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFillObject}
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
              showRoadLabels: false,
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
            zoomLevel={14}
            centerCoordinate={homeCoord ?? destCenter}
            pitch={55}
            animationDuration={0}
          />
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
                }}
              />
              <MapboxGL.CircleLayer
                id="event-marker-fill"
                style={{
                  circleRadius: 12,
                  circleColor: circleColorExpr,
                  circleOpacity: circleOpacityExpr,
                  circleStrokeWidth: 2.5,
                  circleStrokeColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.9)",
                  circleStrokeOpacity: circleOpacityExpr,
                }}
              />
              <MapboxGL.SymbolLayer
                id="event-marker-labels"
                style={{
                  textField: ["to-string", ["get", "index"]],
                  textFont: ["DIN Pro Bold"],
                  textSize: 11,
                  textColor: isDark ? "#fff" : "#fff",
                  textHaloColor: "rgba(0,0,0,0.3)",
                  textHaloWidth: 0.5,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                  textOpacity: circleOpacityExpr,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
        </MapboxGL.MapView>
      )}

      {/* "Today" floating label + recenter button */}
      <View style={{ position: "absolute", top: insets.top, left: 0, right: 0, zIndex: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }} pointerEvents="box-none">
        <Text style={[styles.screenTitle, !!destCenter && !!MapboxGL && { color: isDark ? "#fff" : "#000", textShadowColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }]}>Today</Text>
        {markerCoords.length > 0 && (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); fitToMarkers(); }}
            style={({ pressed }) => ({
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: isDark ? "rgba(20,20,20,0.7)" : "rgba(255,255,255,0.85)",
              alignItems: "center" as const, justifyContent: "center" as const,
              marginRight: S.md, opacity: pressed ? 0.6 : 1,
              ...Platform.select({
                ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
                android: { elevation: 3 },
              }),
            })}
            accessibilityLabel="Recenter map on events"
            hitSlop={6}
          >
            <Crosshair size={18} color={C.teal} weight="bold" />
          </Pressable>
        )}
      </View>

      {/* Bottom sheet */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: isDark ? "#141414" : C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
        handleIndicatorStyle={{ backgroundColor: C.textDim, width: 36, height: 4 }}
        enableDynamicSizing={false}
        onChange={setSheetIndex}
      >
        <BottomSheetScrollView
          ref={scheduleScrollRef as any}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
        {/* ── Zone 1: Compact Header ── */}
        <View style={styles.headerSection}>
          {/* Row A: Trip name + badge */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.sm }}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${displayTrip.id}`); }}
              style={{ flex: 1 }}
            >
              <Text style={[styles.tripName, { color: C.textPrimary }]} numberOfLines={1}>{displayTrip.name}</Text>
            </Pressable>
            {isPreview && daysUntilNext > 0 ? (
              <View style={[styles.dayBadge, { backgroundColor: C.tealDim }]}>
                <Text style={[styles.dayBadgeText, { color: C.teal }]}>
                  {daysUntilNext === 1 ? "Tomorrow" : `In ${daysUntilNext}d`}
                </Text>
              </View>
            ) : isPreview && mostRecentTrip ? (
              <View style={[styles.dayBadge, { backgroundColor: C.elevated }]}>
                <Text style={[styles.dayBadgeText, { color: C.textTertiary }]}>Past</Text>
              </View>
            ) : dayInfo ? (
              <View style={[styles.dayBadge, { backgroundColor: C.tealDim }]}>
                <Text style={[styles.dayBadgeText, { color: C.teal }]}>
                  Day {dayInfo.day}/{dayInfo.total}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Row B: Context strip — destination + weather + local time */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
            {displayTrip.destination && (
              <>
                <MapPin size={10} color={C.teal} weight="fill" />
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
                <Text style={{ fontSize: T.sm, fontWeight: T.medium, color: C.textTertiary }}>{localTimeStr}</Text>
              </>
            ) : null}
          </View>

          {/* Row C: Preview stats line */}
          {isPreview && (() => {
            const s = tripStats(displayTrip);
            return (
              <Text style={{ fontSize: T.xs, fontWeight: T.semibold, color: C.textDim, marginTop: 4 }}>
                {s.flights} flights · {s.hotels} hotels · {s.totalEvents} events · {s.totalDays} days
              </Text>
            );
          })()}

          {/* Row D: Traveler avatars */}
          {(displayTrip.travelers?.length ?? 0) > 0 && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTravelerNames(v => !v); }}
              style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}
            >
              <View style={{ flexDirection: "row", marginRight: 8 }}>
                {displayTrip.travelers!.slice(0, 6).map((t, i) => {
                  const col = AVATAR_COLORS[i % AVATAR_COLORS.length];
                  return (
                    <View
                      key={t.id}
                      style={{
                        width: 26, height: 26, borderRadius: 13,
                        backgroundColor: `${col}18`,
                        borderWidth: 2,
                        borderColor: isDark ? "#141414" : C.bg,
                        alignItems: "center", justifyContent: "center",
                        marginLeft: i === 0 ? 0 : -8,
                        zIndex: 10 - i,
                      }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: "800", color: col }}>{t.initials}</Text>
                    </View>
                  );
                })}
                {displayTrip.travelers!.length > 6 && (
                  <View
                    style={{
                      width: 26, height: 26, borderRadius: 13,
                      backgroundColor: C.elevated,
                      borderWidth: 2,
                      borderColor: isDark ? "#141414" : C.bg,
                      alignItems: "center", justifyContent: "center",
                      marginLeft: -8,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: "700", color: C.textTertiary }}>
                      +{displayTrip.travelers!.length - 6}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: T.xs, fontWeight: T.medium, color: C.textDim }}>
                {displayTrip.travelers!.length} {displayTrip.travelers!.length === 1 ? "traveler" : "travelers"}
              </Text>
            </Pressable>
          )}
          {showTravelerNames && (displayTrip.travelers?.length ?? 0) > 0 && (
            <View style={{
              marginTop: 6, paddingVertical: 8, paddingHorizontal: 12,
              backgroundColor: C.card, borderRadius: R.lg,
            }}>
              {displayTrip.travelers!.map((t, i) => (
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

        {/* Compact NEXT UP banner (active trip only) */}
        {!isPreview && next && (() => {
          const nextEvColor = (EC as any)[next.event.type] ?? C.teal;
          return (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: next.event.id } });
              }}
              style={({ pressed }) => ({
                flexDirection: "row" as const, alignItems: "center" as const,
                marginHorizontal: S.md, marginTop: S.xs,
                paddingVertical: 10, paddingHorizontal: S.md,
                borderRadius: R.lg, backgroundColor: C.card,
                gap: S.xs, opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ width: 3, height: 28, borderRadius: 1.5, backgroundColor: nextEvColor, marginRight: 4 }} />
              <Text style={{ fontSize: 9, fontWeight: "800", color: C.teal, letterSpacing: 1, marginRight: 4 }}>NEXT</Text>
              <Text style={{ fontSize: T.sm, fontWeight: "700", color: C.textPrimary, flex: 1 }} numberOfLines={1}>
                {normaliseTitle(next.event.title, next.event.type, next.event.transferType)}
              </Text>
              <Text style={{ fontSize: T.xs, fontWeight: "800", color: C.teal }}>{formatCountdown(next.minsUntil)}</Text>
            </Pressable>
          );
        })()}

        {/* ── Zone 2: Schedule ── */}
        {/* Section header */}
        <View style={styles.timelineSection}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
            <Text style={[styles.sectionLabel, { color: C.textTertiary }]}>
              {isPreview ? "YOUR FIRST DAY" : "YOUR SCHEDULE"}
            </Text>
            {isPreview ? (
              <Text style={[styles.sectionCount, { color: C.textDim }]}>
                {new Date(displayTrip.start + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </Text>
            ) : (
              <Text style={[styles.sectionCount, { color: C.textDim }]}>
                {pastCount} of {displayEvents.length} done
              </Text>
            )}
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginBottom: S.xs }} />
        </View>

        {displayEvents.length > 0 ? (
          <View style={{ paddingHorizontal: S.md }}>
            {displayEvents.map((ev, i) => {
              const Icon = ev.type === "transfer"
                ? (TRANSFER_ICONS[ev.transferType || "car"] || Car)
                : (TYPE_ICONS[ev.type] ?? Compass);
              const evMins = timeToMinutes(ev.time);
              const isPast = !isPreview && evMins < nowMins;
              const nextEvMins = i < displayEvents.length - 1 ? timeToMinutes(displayEvents[i + 1].time) : Infinity;
              const showNowLine = !isPreview && isPast && nextEvMins > nowMins;

              const hasCoord = !!eventCoords[ev.id];
              const evColor = (EC as any)[ev.type] ?? C.teal;
              const isHighlighted = highlightedEventId === ev.id;

              return (
                <View
                  key={ev.id}
                  onLayout={(e) => { eventRowYs.current[ev.id] = e.nativeEvent.layout.y; }}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({ pathname: "/trip/event", params: { tripId: displayTrip.id, eventId: ev.id } });
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <View style={[
                      styles.eventRow,
                      isPast && { opacity: 0.45 },
                      isHighlighted && { backgroundColor: `${C.teal}12`, borderRadius: R.lg, marginHorizontal: -4, paddingHorizontal: 4 },
                    ]}>
                      <Pressable
                        onPress={() => { if (hasCoord) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); flyToEvent(ev.id); } }}
                        disabled={!hasCoord}
                        hitSlop={4}
                      >
                        <View style={[
                          styles.eventIconWrap,
                          { backgroundColor: hasCoord ? `${evColor}20` : `${C.teal}15` },
                        ]}>
                          {hasCoord ? (
                            <Text style={{ fontSize: 12, fontWeight: "800", color: evColor }}>{i + 1}</Text>
                          ) : (
                            <Icon size={16} color={C.teal} weight="regular" />
                          )}
                        </View>
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventTitle, { color: C.textPrimary }]} numberOfLines={2}>
                          {normaliseTitle(ev.title, ev.type, ev.transferType)}
                        </Text>
                        {ev.location && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                            <MapPin size={10} color={C.textTertiary} weight="regular" />
                            <Text style={[styles.eventLocation, { color: C.textTertiary }]} numberOfLines={1}>
                              {ev.location}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.eventTime, { color: C.textTertiary }]}>{ev.time}</Text>
                    </View>
                  </Pressable>
                  {showNowLine && (
                    <View style={styles.nowLineWrap}>
                      <View style={[styles.nowDot, { backgroundColor: C.teal }]} />
                      <View style={[styles.nowLine, { backgroundColor: C.teal }]} />
                      <Text style={[styles.nowLabel, { color: C.teal }]}>NOW</Text>
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
                <Text style={[styles.seeAllBtnText, { color: C.teal }]}>See full itinerary</Text>
                <CaretRight size={14} color={C.teal} weight="bold" />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.noEventsWrap}>
            <Sun size={32} color={C.textDim} weight="regular" />
            <Text style={[styles.noEventsText, { color: C.textTertiary }]}>
              {isPreview ? "No events on your first day yet" : "No events scheduled for today"}
            </Text>
          </View>
        )}

        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    stickyHeader: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      overflow: "hidden",
    },
    screenTitle: {
      fontSize: 22, fontWeight: "800",
      color: C.textPrimary, paddingHorizontal: S.md,
      paddingVertical: 10,
    },

    // Map
    mapWrap: {
      height: 140, overflow: "hidden",
      backgroundColor: C.card,
    },

    // Header
    headerSection: {
      paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: 0,
    },
    dateLabel: { fontSize: T.base, fontWeight: "600", letterSpacing: 0.2 },
    tripName: { fontSize: T.xl, fontWeight: "800", letterSpacing: -0.3 },
    destination: { fontSize: T.sm, fontWeight: "600" },
    dayBadge: {
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 3,
    },
    dayBadgeText: { fontSize: T.xs, fontWeight: "700" },

    // Next up
    nextCard: {
      flexDirection: "row", alignItems: "center",
      marginHorizontal: S.md, marginTop: S.sm,
      padding: S.md, borderRadius: R.xl, gap: S.sm,
    },
    nextLeft: { flex: 1 },
    nextLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 4 },
    nextTitle: { fontSize: T.base, fontWeight: "700" },
    nextLocation: { fontSize: T.xs, fontWeight: "500", marginTop: 2 },
    nextCountdown: {
      borderRadius: R.full, paddingHorizontal: 12, paddingVertical: 6,
    },
    nextCountdownText: { fontSize: T.xs, fontWeight: "800", color: "#000" },

    // Timeline
    timelineSection: {
      paddingHorizontal: S.md, paddingTop: S.md,
    },
    sectionLabel: { fontSize: T.xs, fontWeight: "700", letterSpacing: 1 },
    sectionCount: { fontSize: T.xs, fontWeight: "600" },
    eventRow: {
      flexDirection: "row", alignItems: "center",
      paddingVertical: 10, gap: S.sm,
    },
    eventIconWrap: {
      width: 32, height: 32, borderRadius: 16,
      alignItems: "center", justifyContent: "center",
    },
    eventTitle: { fontSize: T.base, fontWeight: "600" },
    eventTime: { fontSize: T.xs, fontWeight: "600" },
    eventLocation: { fontSize: T.xs, fontWeight: "500" },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
    nowLineWrap: {
      flexDirection: "row", alignItems: "center",
      marginVertical: 6,
    },
    nowDot: {
      width: 8, height: 8, borderRadius: 4,
    },
    nowLine: {
      flex: 1, height: 1.5, marginLeft: 4,
    },
    nowLabel: {
      fontSize: 9, fontWeight: "800", letterSpacing: 1, marginLeft: 6,
    },

    // No events
    noEventsWrap: {
      alignItems: "center", paddingTop: 60, gap: S.sm,
    },
    noEventsText: { fontSize: T.sm, fontWeight: "500" },

    // Active stats strip
    activeStatsStrip: {
      flexDirection: "row", alignItems: "center",
      gap: 5, marginTop: 6,
    },
    activeStatsText: { fontSize: T.xs, fontWeight: "600", color: C.textTertiary },
    activeStatsDot: {
      width: 3, height: 3, borderRadius: 1.5,
      backgroundColor: C.textTertiary, opacity: 0.4,
    },

    // Upcoming headline
    upcomingHeadline: {
      fontSize: T["2xl"], fontWeight: "800", letterSpacing: -0.3,
      marginBottom: S.md,
    },

    // See all button
    seeAllBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 4, paddingVertical: 12, borderRadius: R.xl,
    },
    seeAllBtnText: { fontSize: T.sm, fontWeight: "700" },

    // Empty state
    emptyContent: {
      paddingHorizontal: S.md, paddingTop: S.sm,
    },
    emptyIconWrap: {
      width: 64, height: 64, borderRadius: 32,
      alignItems: "center", justifyContent: "center",
      marginBottom: S.xs,
    },
    emptyTitle: { fontSize: T.xl, fontWeight: "800", color: C.textPrimary, letterSpacing: -0.3 },
    emptyText: { fontSize: T.sm, color: C.textTertiary, lineHeight: 20, marginTop: 4 },
    emptyCta: {
      marginTop: S.md,
      paddingHorizontal: S.xl, paddingVertical: 12,
      borderRadius: R.full,
    },
    emptyCtaText: { fontSize: T.base, fontWeight: "700", color: "#000" },

    // Hero trip card
    heroCard: {
      height: 200, borderRadius: R["2xl"], overflow: "hidden",
      justifyContent: "flex-end",
    },
    heroContent: {
      padding: S.md, gap: 3,
    },
    heroBadge: {
      alignSelf: "flex-start",
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 3,
      marginBottom: 4,
    },
    heroBadgeText: { fontSize: T.xs, fontWeight: "800", color: "#000" },
    heroName: { fontSize: T.xl, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
    heroDest: { fontSize: T.sm, fontWeight: "600", color: "rgba(255,255,255,0.7)" },
    heroMeta: { fontSize: T.sm, fontWeight: "600", color: "rgba(255,255,255,0.9)" },
    heroMetaSub: { fontSize: T.xs, fontWeight: "600", color: "rgba(255,255,255,0.65)" },

    previewLabel: { fontSize: T.xs, fontWeight: "700", letterSpacing: 1 },
    previewDate: { fontSize: T.xs, fontWeight: "600" },
    previewCard: {
      borderRadius: R.xl, overflow: "hidden",
      paddingHorizontal: S.md,
    },
    previewRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm, paddingVertical: 12,
    },
    previewIcon: {
      width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
    },
    previewTitle: { fontSize: T.base, fontWeight: "600" },
    previewTime: { fontSize: T.xs, fontWeight: "600" },
    previewLocation: { fontSize: T.xs, fontWeight: "500" },
    previewDivider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },

    infoRow: {
      flexDirection: "row", alignItems: "center", gap: S.sm,
      marginTop: S.md, padding: S.md, borderRadius: R.xl,
    },

    statsFooter: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 5, marginTop: S.xl, paddingBottom: S.md,
    },
    statsFooterText: { fontSize: T.xs, fontWeight: "600", color: C.textDim },
    statsFooterDot: { fontSize: T.xs, color: C.textDim, opacity: 0.5 },

  });
}
