import {
  View, Text, ScrollView, StyleSheet, Pressable, Platform, RefreshControl, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  MapPin, Airplane, Bed, Compass, ForkKnife, Car, Train, Bus, Boat, Anchor,
  Clock, NavigationArrow, CalendarDots, Sun, CloudSun, Thermometer,
  Suitcase, Calendar, Globe, CaretRight,
} from "phosphor-react-native";
import { CachedImage } from "@/components/CachedImage";
import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, eventColor } from "@/constants/theme";
import { Illustration } from "@/components/Illustration";
import type { TravelEvent, Trip } from "@/shared/types";

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch {}


const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

const geocodeCache: Record<string, [number, number] | null> = {};
async function geocodeLocation(loc: string): Promise<[number, number] | null> {
  if (loc in geocodeCache) return geocodeCache[loc];
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(loc)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    );
    const json = await res.json();
    const center = json.features?.[0]?.center as [number, number] | undefined;
    geocodeCache[loc] = center ?? null;
    return center ?? null;
  } catch {
    geocodeCache[loc] = null;
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
  const s = new Date(trip.start + "T00:00:00");
  const e = new Date(trip.end + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = Math.floor((now.getTime() - s.getTime()) / 86400000) + 1;
  const total = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return { day, total };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function findActiveTrip(trips: Trip[]): Trip | null {
  const today = todayStr();
  return trips.find(t => t.start <= today && t.end >= today) ?? null;
}


function getTodayEvents(trip: Trip): TravelEvent[] {
  const today = todayStr();
  const evts = trip.events.filter(e => e.date === today);
  evts.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return evts;
}

interface WeatherData {
  temp: number;
  description: string;
  icon: string;
}

const WEATHER_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_KEY;

async function fetchWeather(destination: string): Promise<WeatherData | null> {
  if (!WEATHER_KEY) return null;
  try {
    const geoRes = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(destination)}&limit=1&appid=${WEATHER_KEY}`
    );
    const geoJson = await geoRes.json();
    if (!geoJson[0]) return null;
    const { lat, lon } = geoJson[0];
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_KEY}`
    );
    const json = await res.json();
    return {
      temp: Math.round(json.main.temp),
      description: json.weather[0].description,
      icon: json.weather[0].icon,
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

function formatCountdownFull(ms: number): { days: number; hours: number } {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return { days, hours };
}

function getNextEvent(events: TravelEvent[]): { event: TravelEvent; minsUntil: number } | null {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
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
  const [coords, setCoords] = useState<Record<string, [number, number]>>({});

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const activeTrip = useMemo(() => findActiveTrip(trips), [trips]);
  const todayEvents = useMemo(() => activeTrip ? getTodayEvents(activeTrip) : [], [activeTrip]);
  const next = useMemo(() => getNextEvent(todayEvents), [todayEvents]);
  const dayInfo = useMemo(() => activeTrip ? tripDayInfo(activeTrip) : null, [activeTrip]);
  const nowMins = useMemo(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }, []);
  const pastCount = useMemo(() => todayEvents.filter(e => timeToMinutes(e.time) < nowMins).length, [todayEvents, nowMins]);

  // Find the next upcoming trip if none active
  const upcomingTrip = useMemo(() => {
    if (activeTrip) return null;
    const today = todayStr();
    const future = trips.filter(t => t.start > today).sort((a, b) => a.start.localeCompare(b.start));
    return future[0] ?? null;
  }, [trips, activeTrip]);

  const daysUntilNext = useMemo(() => {
    if (!upcomingTrip) return 0;
    return Math.ceil((new Date(upcomingTrip.start + "T00:00:00").getTime() - Date.now()) / 86400000);
  }, [upcomingTrip]);

  const countdown = useMemo(() => {
    if (!upcomingTrip) return null;
    return formatCountdownFull(new Date(upcomingTrip.start + "T00:00:00").getTime() - Date.now());
  }, [upcomingTrip]);

  const stats = useMemo(() => upcomingTrip ? tripStats(upcomingTrip) : null, [upcomingTrip]);

  const day1Events = useMemo(() => {
    if (!upcomingTrip) return [];
    const evts = upcomingTrip.events
      .filter(e => e.date === upcomingTrip.start)
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    return evts.slice(0, 4);
  }, [upcomingTrip]);

  const hasInfo = useMemo(() => (upcomingTrip?.info?.length ?? 0) > 0, [upcomingTrip]);

  const [weather, setWeather] = useState<WeatherData | null>(null);
  useEffect(() => {
    if (!upcomingTrip?.destination || activeTrip) return;
    fetchWeather(upcomingTrip.destination).then(setWeather);
  }, [upcomingTrip?.destination, activeTrip]);

  // Events with mappable locations (skip flights — departure airport is irrelevant)
  const mappableEvents = useMemo(() => todayEvents.filter(ev => ev.type !== "flight"), [todayEvents]);

  // Geocode event locations for map pins
  useEffect(() => {
    mappableEvents.forEach(ev => {
      const loc = ev.location;
      if (!loc || loc in coords) return;
      if (ev.locationCoords) {
        setCoords(prev => ({ ...prev, [loc]: [ev.locationCoords![1], ev.locationCoords![0]] }));
        return;
      }
      geocodeLocation(loc).then(c => {
        if (c) setCoords(prev => ({ ...prev, [loc]: c }));
      });
    });
  }, [mappableEvents]);

  const pinsGeoJson: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: mappableEvents
      .filter(ev => ev.location && coords[ev.location])
      .map((ev, i) => ({
        type: "Feature" as const,
        properties: { title: ev.title, index: i, type: ev.type },
        geometry: { type: "Point" as const, coordinates: coords[ev.location!] },
      })),
  }), [mappableEvents, coords]);

  const pinCoords = pinsGeoJson.features.map(f => (f.geometry as any).coordinates as [number, number]);

  useEffect(() => { setMapReady(false); }, [isDark]);

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  // No active trip
  if (!activeTrip) {
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
          {/* Header */}
          <View style={styles.headerSection}>
            <Text style={[styles.dateLabel, { color: C.textTertiary }]}>{dateLabel}</Text>
            <Text style={[styles.tripName, { color: C.textPrimary }]}>Nothing on today</Text>
          </View>

          {upcomingTrip ? (
            <View style={styles.emptyContent}>
              {/* Trip hero */}
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${upcomingTrip.id}`); }}
                style={({ pressed }) => [styles.heroCard, { opacity: pressed ? 0.9 : 1 }]}
              >
                <CachedImage uri={upcomingTrip.image} style={StyleSheet.absoluteFillObject} />
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.65)"]} style={StyleSheet.absoluteFillObject} />
                <View style={styles.heroContent}>
                  <View style={[styles.heroBadge, { backgroundColor: C.teal }]}>
                    <Text style={styles.heroBadgeText}>
                      {daysUntilNext === 1 ? "Tomorrow" : `In ${daysUntilNext} days`}
                    </Text>
                  </View>
                  <Text style={styles.heroName} numberOfLines={1}>{upcomingTrip.name}</Text>
                  {upcomingTrip.destination && !upcomingTrip.name.toLowerCase().includes(upcomingTrip.destination.split(",")[0].toLowerCase()) && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <MapPin size={11} color="rgba(255,255,255,0.7)" weight="fill" />
                      <Text style={styles.heroDest}>{upcomingTrip.destination}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <Calendar size={14} color="rgba(255,255,255,0.85)" weight="bold" />
                    <Text style={styles.heroMeta}>
                      {new Date(upcomingTrip.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      {" - "}
                      {new Date(upcomingTrip.end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </Text>
                    {weather && (
                      <>
                        <View style={{ width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.3)" }} />
                        <CloudSun size={14} color="rgba(255,255,255,0.85)" weight="bold" />
                        <Text style={styles.heroMeta}>{weather.temp}°C, {weather.description}</Text>
                      </>
                    )}
                  </View>
                </View>
              </Pressable>

              {/* Day 1 preview */}
              {day1Events.length > 0 && (
                <View style={{ marginTop: S.lg }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: S.sm }}>
                    <Text style={[styles.previewLabel, { color: C.textTertiary }]}>YOUR FIRST DAY</Text>
                    <Text style={[styles.previewDate, { color: C.textDim }]}>
                      {new Date(upcomingTrip.start + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  <View style={[styles.previewCard, { backgroundColor: C.card }]}>
                    {day1Events.map((ev, i) => {
                      const Icon = ev.type === "transfer"
                        ? (TRANSFER_ICONS[ev.transferType || "car"] || Car)
                        : (TYPE_ICONS[ev.type] ?? Compass);
                      return (
                        <View key={ev.id}>
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              router.push({ pathname: "/trip/event", params: { tripId: upcomingTrip.id, eventId: ev.id } });
                            }}
                            style={({ pressed }) => [styles.previewRow, { opacity: pressed ? 0.7 : 1 }]}
                          >
                            <View style={[styles.previewIcon, { backgroundColor: `${C.teal}15` }]}>
                              <Icon size={16} color={C.teal} weight="regular" />
                            </View>
                            <View style={{ flex: 1, marginRight: S.sm }}>
                              <Text style={[styles.previewTitle, { color: C.textPrimary }]} numberOfLines={1}>{ev.title}</Text>
                              {ev.location && (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }}>
                                  <MapPin size={10} color={C.textTertiary} weight="regular" />
                                  <Text style={[styles.previewLocation, { color: C.textTertiary }]} numberOfLines={1}>{ev.location}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.previewTime, { color: C.textTertiary }]}>{ev.time}</Text>
                          </Pressable>
                          {i < day1Events.length - 1 && (
                            <View style={[styles.previewDivider, { backgroundColor: C.border }]} />
                          )}
                        </View>
                      );
                    })}
                    {upcomingTrip.events.filter(e => e.date === upcomingTrip.start).length > 4 && (
                      <>
                        <View style={[styles.previewDivider, { backgroundColor: C.border }]} />
                        <Pressable
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${upcomingTrip.id}`); }}
                          style={({ pressed }) => [styles.previewRow, { opacity: pressed ? 0.7 : 1, justifyContent: "center" }]}
                        >
                          <Text style={{ fontSize: T.sm, fontWeight: "600", color: C.teal }}>
                            See all {upcomingTrip.events.filter(e => e.date === upcomingTrip.start).length} events
                          </Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              )}

              {/* Trip info shortcut */}
              {hasInfo && (
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: "/trip/info", params: { tripId: upcomingTrip.id } }); }}
                  style={({ pressed }) => [styles.infoRow, { backgroundColor: C.card, opacity: pressed ? 0.8 : 1 }]}
                >
                  <View style={[styles.previewIcon, { backgroundColor: `${C.teal}15` }]}>
                    <Globe size={16} color={C.teal} weight="regular" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewTitle, { color: C.textPrimary }]}>Trip information</Text>
                    <Text style={[styles.previewLocation, { color: C.textTertiary, marginTop: 2 }]}>Contacts, details, and more</Text>
                  </View>
                  <CaretRight size={16} color={C.textDim} weight="bold" />
                </Pressable>
              )}

              {/* Organizer */}
              {upcomingTrip.organizer?.name && (
                <View style={[styles.infoRow, { backgroundColor: C.card }]}>
                  <View style={[styles.previewIcon, { backgroundColor: `${C.teal}15` }]}>
                    <Suitcase size={16} color={C.teal} weight="regular" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.previewTitle, { color: C.textPrimary }]}>{upcomingTrip.organizer.name}</Text>
                    <Text style={[styles.previewLocation, { color: C.textTertiary, marginTop: 2 }]}>
                      {upcomingTrip.organizer.role || "Trip organizer"}
                    </Text>
                  </View>
                  {upcomingTrip.organizer.phone && (
                    <Pressable
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); Linking.openURL(`tel:${upcomingTrip.organizer!.phone}`); }}
                      hitSlop={8}
                    >
                      <View style={[styles.previewIcon, { backgroundColor: `${C.teal}15` }]}>
                        <NavigationArrow size={14} color={C.teal} weight="bold" style={{ transform: [{ rotate: "90deg" }] }} />
                      </View>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Stats footer */}
              {stats && (
                <View style={styles.statsFooter}>
                  <Airplane size={12} color={C.textDim} weight="bold" />
                  <Text style={styles.statsFooterText}>{stats.flights} {stats.flights === 1 ? "flight" : "flights"}</Text>
                  <Text style={styles.statsFooterDot}>·</Text>
                  <Bed size={12} color={C.textDim} weight="bold" />
                  <Text style={styles.statsFooterText}>{stats.hotels} {stats.hotels === 1 ? "hotel" : "hotels"}</Text>
                  <Text style={styles.statsFooterDot}>·</Text>
                  <CalendarDots size={12} color={C.textDim} weight="bold" />
                  <Text style={styles.statsFooterText}>{stats.totalEvents} events</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyContent}>
              <View style={{ paddingTop: 60, alignItems: "center", gap: S.xs }}>
                <Compass size={28} color={C.textDim} weight="regular" />
                <Text style={styles.emptyTitle}>No trips yet</Text>
                <Text style={[styles.emptyText, { textAlign: "center" }]}>
                  Join a trip and your daily schedule will appear here
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Sticky header */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.97)" }]} />
        )}
        <Text style={styles.screenTitle}>Today</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 50, paddingBottom: 100 }}
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >
        {/* Map — Apple Maps on iOS, Mapbox on Android */}
        {pinCoords.length > 0 && (
          <View style={styles.mapWrap}>
            {MapboxGL ? (
              <MapboxGL.MapView
                key={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFillObject}
                styleURL={isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                logoEnabled={false}
                attributionEnabled={false}
                compassEnabled={false}
                scaleBarEnabled={false}
                onDidFinishLoadingStyle={() => setMapReady(true)}
              >
                <MapboxGL.Camera
                  bounds={pinCoords.length > 1 ? {
                    ne: [
                      Math.max(...pinCoords.map(p => p[0])) + 0.02,
                      Math.max(...pinCoords.map(p => p[1])) + 0.02,
                    ],
                    sw: [
                      Math.min(...pinCoords.map(p => p[0])) - 0.02,
                      Math.min(...pinCoords.map(p => p[1])) - 0.02,
                    ],
                    paddingLeft: 40, paddingRight: 40, paddingTop: 50, paddingBottom: 60,
                  } : undefined}
                  zoomLevel={pinCoords.length === 1 ? 14 : undefined}
                  centerCoordinate={pinCoords.length === 1 ? pinCoords[0] : undefined}
                  animationDuration={0}
                />
                {mapReady && pinCoords.length > 1 && (
                  <MapboxGL.ShapeSource id="route-line" shape={{
                    type: "Feature", properties: {},
                    geometry: { type: "LineString", coordinates: pinCoords },
                  }}>
                    <MapboxGL.LineLayer
                      id="route"
                      style={{
                        lineColor: C.teal, lineWidth: 1.5,
                        lineOpacity: 0.4, lineDasharray: [4, 3],
                      }}
                    />
                  </MapboxGL.ShapeSource>
                )}
                {pinsGeoJson.features.map((f, i) => {
                  const coord = (f.geometry as any).coordinates as [number, number];
                  const ev = mappableEvents.filter(e => e.location && coords[e.location])[i];
                  const Icon = ev ? (ev.type === "transfer" ? (TRANSFER_ICONS[ev.transferType || "car"] || Car) : (TYPE_ICONS[ev.type] ?? Compass)) : MapPin;
                  return (
                    <MapboxGL.MarkerView key={`pin-${i}`} coordinate={coord}>
                      <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: C.teal, alignItems: "center", justifyContent: "center" }}>
                        <Icon size={11} color="#fff" weight="fill" />
                      </View>
                    </MapboxGL.MarkerView>
                  );
                })}
              </MapboxGL.MapView>
            ) : null}
          </View>
        )}

        {/* Header */}
        <View style={styles.headerSection}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[styles.dateLabel, { color: C.textTertiary }]}>{dateLabel}</Text>
            {dayInfo && (
              <View style={[styles.dayBadge, { backgroundColor: C.tealDim }]}>
                <Text style={[styles.dayBadgeText, { color: C.teal }]}>
                  Day {dayInfo.day} of {dayInfo.total}
                </Text>
              </View>
            )}
          </View>
          <Pressable
            onPress={() => {

              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/trip/${activeTrip.id}`);
            }}
          >
            <Text style={[styles.tripName, { color: C.textPrimary }]}>{activeTrip.name}</Text>
          </Pressable>
          {activeTrip.destination && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              <MapPin size={12} color={C.teal} weight="fill" />
              <Text style={[styles.destination, { color: C.textSecondary }]}>{activeTrip.destination}</Text>
            </View>
          )}
        </View>

        {/* Next up card */}
        {next && (
          <Pressable
            onPress={() => {

              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: "/trip/event", params: { tripId: activeTrip.id, eventId: next.event.id } });
            }}
            style={({ pressed }) => [styles.nextCard, { backgroundColor: C.tealDim, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={styles.nextLeft}>
              <Text style={[styles.nextLabel, { color: C.teal }]}>NEXT UP</Text>
              <Text style={[styles.nextTitle, { color: C.textPrimary }]} numberOfLines={1}>{next.event.title}</Text>
              {next.event.location && (
                <Text style={[styles.nextLocation, { color: C.textSecondary }]} numberOfLines={1}>{next.event.location}</Text>
              )}
            </View>
            <View style={[styles.nextCountdown, { backgroundColor: C.teal }]}>
              <Text style={styles.nextCountdownText}>{formatCountdown(next.minsUntil)}</Text>
            </View>
          </Pressable>
        )}

        {/* Schedule */}
        {todayEvents.length > 0 ? (
          <View style={styles.timelineSection}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: S.sm }}>
              <Text style={[styles.sectionLabel, { color: C.textTertiary }]}>YOUR SCHEDULE</Text>
              <Text style={[styles.sectionCount, { color: C.textDim }]}>
                {pastCount} of {todayEvents.length} done
              </Text>
            </View>
            {todayEvents.map((ev, i) => {
              const Icon = ev.type === "transfer"
                ? (TRANSFER_ICONS[ev.transferType || "car"] || Car)
                : (TYPE_ICONS[ev.type] ?? Compass);
              const evMins = timeToMinutes(ev.time);
              const isPast = evMins < nowMins;
              const nextEvMins = i < todayEvents.length - 1 ? timeToMinutes(todayEvents[i + 1].time) : Infinity;
              const showNowLine = isPast && nextEvMins > nowMins;

              return (
                <View key={ev.id}>
                  <Pressable
                    onPress={() => {
        
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push({ pathname: "/trip/event", params: { tripId: activeTrip.id, eventId: ev.id } });
                    }}
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <View style={[styles.eventRow, isPast && { opacity: 0.45 }]}>
                      <View style={[styles.eventIconWrap, { backgroundColor: `${C.teal}15` }]}>
                        <Icon size={16} color={C.teal} weight="regular" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.eventTitle, { color: C.textPrimary }]} numberOfLines={1}>
                          {ev.title}
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
                  {i < todayEvents.length - 1 && !showNowLine && (
                    <View style={[styles.divider, { backgroundColor: C.border }]} />
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noEventsWrap}>
            <Sun size={32} color={C.textDim} weight="regular" />
            <Text style={[styles.noEventsText, { color: C.textTertiary }]}>No events scheduled for today</Text>
          </View>
        )}
      </ScrollView>
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
      color: C.teal, paddingHorizontal: S.md,
      paddingVertical: 10,
    },

    // Map
    mapWrap: {
      height: 240, overflow: "hidden",
      backgroundColor: C.card,
    },

    // Header
    headerSection: {
      paddingHorizontal: S.md, paddingTop: S.md, paddingBottom: S.sm,
    },
    dateLabel: { fontSize: T.base, fontWeight: "600", letterSpacing: 0.2 },
    tripName: { fontSize: T["2xl"], fontWeight: "800", letterSpacing: -0.3, marginTop: 2 },
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
      paddingHorizontal: S.md, paddingTop: S.lg,
    },
    sectionLabel: { fontSize: T.xs, fontWeight: "700", letterSpacing: 1 },
    sectionCount: { fontSize: T.xs, fontWeight: "600" },
    eventRow: {
      flexDirection: "row", alignItems: "center",
      paddingVertical: 12, gap: S.sm,
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

    // Empty state
    emptyContent: {
      paddingHorizontal: S.md, paddingTop: S.sm,
    },
    emptyTitle: { fontSize: T.xl, fontWeight: "800", color: C.textPrimary, letterSpacing: -0.3 },
    emptyText: { fontSize: T.sm, color: C.textTertiary, lineHeight: 20, marginTop: 4 },

    // Hero trip card
    heroCard: {
      height: 180, borderRadius: R["2xl"], overflow: "hidden",
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
