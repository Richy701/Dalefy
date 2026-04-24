import { View, Text, ScrollView, StyleSheet, TextInput, Pressable, Dimensions, RefreshControl, Platform, Share } from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { Illustration } from "@/components/Illustration";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Search, Globe, MapPin, Navigation, Plane, Hotel, Compass, Utensils, Car, CalendarDays } from "lucide-react-native";

import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S } from "@/constants/theme";
import SegmentedControl from "@react-native-segmented-control/segmented-control";

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch { /* native module not available */ }

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

type GeoResult = { coords: [number, number]; country: string } | null;
const geocodeCache: Record<string, GeoResult> = {};

async function geocodeDestination(name: string): Promise<GeoResult> {
  if (name in geocodeCache) return geocodeCache[name];
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    );
    const json = await res.json();
    const feature = json.features?.[0];
    const center = feature?.center as [number, number] | undefined;
    if (!center) { geocodeCache[name] = null; return null; }
    const country = feature?.context?.find((c: { id: string }) => c.id.startsWith("country"))?.text
      ?? feature?.place_name?.split(",").pop()?.trim()
      ?? "International";
    const result = { coords: center, country };
    geocodeCache[name] = result;
    return result;
  } catch {
    geocodeCache[name] = null;
    return null;
  }
}

const { width: SCREEN_W } = Dimensions.get("window");

type Destination = {
  name: string; region: string; tripCount: number;
  image: string; eventCount: number; coords?: [number, number];
  nextVisit: string; tripIds: string[];
  types: { flights: number; hotels: number; activities: number; dining: number; transfers: number };
};

const SHORT_NAMES: Record<string, string> = {
  "United Arab Emirates": "UAE",
  "United Kingdom": "UK",
  "United States": "USA",
  "Dominican Republic": "Dom. Rep.",
  "South Korea": "S. Korea",
  "New Zealand": "NZ",
  "Czech Republic": "Czechia",
  "Saudi Arabia": "S. Arabia",
};
function shortName(name: string) { return SHORT_NAMES[name] ?? name; }

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function DestinationsScreen() {
  const { C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const { trips, reload } = useTrips();
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [mapReady, setMapReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const destinations = useMemo(() => {
    const map = new Map<string, Destination>();
    trips.forEach(trip => {
      const name = trip.destination || trip.name;
      if (!map.has(name)) {
        map.set(name, {
          name, region: "International", tripCount: 0, tripIds: [],
          image: trip.image, eventCount: 0,
          nextVisit: trip.start,
          types: { flights: 0, hotels: 0, activities: 0, dining: 0, transfers: 0 },
        });
      }
      const d = map.get(name)!;
      d.tripCount++;
      if (!d.tripIds.includes(trip.id)) d.tripIds.push(trip.id);
      d.eventCount += trip.events.length;
      if (trip.start < d.nextVisit) d.nextVisit = trip.start;
      trip.events.forEach(e => {
        if (e.type === "flight") d.types.flights++;
        else if (e.type === "hotel") d.types.hotels++;
        else if (e.type === "activity") d.types.activities++;
        else if (e.type === "dining") d.types.dining++;
        else if (e.type === "transfer") d.types.transfers++;
      });
    });
    return [...map.values()].sort((a, b) => b.eventCount - a.eventCount);
  }, [trips]);

  const [geoData, setGeoData] = useState<Record<string, { coords: [number, number]; country: string }>>({});

  useEffect(() => {
    destinations.forEach(d => {
      if (d.name in geocodeCache) {
        const cached = geocodeCache[d.name];
        if (cached) setGeoData(prev => ({ ...prev, [d.name]: cached }));
      } else {
        geocodeDestination(d.name).then(result => {
          if (result) setGeoData(prev => ({ ...prev, [d.name]: result }));
        });
      }
    });
  }, [destinations]);

  // Enrich destinations with resolved country
  const enriched = useMemo(() =>
    destinations.map(d => ({
      ...d,
      region: geoData[d.name]?.country ?? "International",
    })),
    [destinations, geoData]
  );

  const regionCount = new Set(enriched.map(d => d.region)).size;
  const totalEvents = enriched.reduce((s, d) => s + d.eventCount, 0);

  const regionList = useMemo(() => {
    const set = new Set(enriched.map(d => d.region));
    return ["all", ...Array.from(set).sort()];
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enriched.filter(d => {
      if (regionFilter !== "all" && d.region !== regionFilter) return false;
      if (q && !d.name.toLowerCase().includes(q) &&
          !d.region.toLowerCase().includes(q) &&
          !trips.some(t => d.tripIds.includes(t.id) && t.name.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [enriched, regionFilter, search, trips]);

  const pinsWithCoords = useMemo(() =>
    enriched
      .map(d => ({ ...d, coords: geoData[d.name]?.coords as [number, number] | undefined }))
      .filter((d): d is typeof d & { coords: [number, number] } => !!d.coords),
    [enriched, geoData]
  );

  const geojson: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: pinsWithCoords.map(d => ({
      type: "Feature" as const,
      properties: { name: d.name, tripCount: d.tripCount },
      geometry: { type: "Point" as const, coordinates: d.coords },
    })),
  }), [pinsWithCoords]);

  useEffect(() => { setMapReady(false); }, [isDark]);

  if (destinations.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.card }}>
        <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
          {Platform.OS === "ios" ? (
            <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.97)" }]} />
          )}
          <Text style={styles.screenTitle}>Destinations</Text>
        </View>
        <View style={styles.empty}>
          <Illustration name="movement" width={260} height={160} />
          <Text style={styles.emptyTitle}>Your map awaits</Text>
          <Text style={styles.emptyText}>Add a trip to start dropping pins — each destination you unlock shows up here.</Text>
        </View>
      </View>
    );
  }

  const stats = [
    { label: "Places", value: enriched.length, icon: MapPin },
    { label: "Regions", value: regionCount, icon: Globe },
    { label: "Events", value: totalEvents, icon: Navigation },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.card }}>
      {/* ── Sticky blur header ── */}
      <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.97)" }]} />
        )}
        <Text style={styles.screenTitle}>Destinations</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40 }]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ── Map card ── */}
        {MapboxGL && (
          <View style={styles.mapCard}>
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
                defaultSettings={{
                  zoomLevel: 0.5,
                  centerCoordinate: [10, 20],
                }}
                bounds={pinsWithCoords.length > 1 ? {
                  ne: [
                    Math.max(...pinsWithCoords.map(p => p.coords[0])) + 15,
                    Math.max(...pinsWithCoords.map(p => p.coords[1])) + 10,
                  ],
                  sw: [
                    Math.min(...pinsWithCoords.map(p => p.coords[0])) - 15,
                    Math.min(...pinsWithCoords.map(p => p.coords[1])) - 10,
                  ],
                  paddingLeft: 20, paddingRight: 20, paddingTop: 20, paddingBottom: 20,
                } : undefined}
                zoomLevel={pinsWithCoords.length <= 1 ? 1.5 : undefined}
                centerCoordinate={pinsWithCoords.length === 1 ? pinsWithCoords[0].coords : undefined}
                animationDuration={0}
              />
              {mapReady && (
                <>
                  <MapboxGL.ShapeSource id="dest-glow" shape={geojson}>
                    <MapboxGL.CircleLayer
                      id="glow"
                      style={{
                        circleRadius: 16,
                        circleColor: C.teal,
                        circleOpacity: 0.1,
                        circleBlur: 0.8,
                      }}
                    />
                  </MapboxGL.ShapeSource>
                  <MapboxGL.ShapeSource
                    id="dest-dots"
                    shape={geojson}
                    hitbox={{ width: 30, height: 30 }}
                    onPress={(e: any) => {
                      const name = e.features?.[0]?.properties?.name;
                      if (!name) return;
                      const dest = enriched.find(d => d.name === name);
                      if (dest?.tripIds[0]) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/trip/${dest.tripIds[0]}`);
                      }
                    }}
                  >
                    <MapboxGL.CircleLayer
                      id="dots"
                      style={{
                        circleRadius: 4.5,
                        circleColor: C.teal,
                        circleStrokeWidth: 1.5,
                        circleStrokeColor: isDark ? "#1a1a1e" : "#ffffff",
                      }}
                    />
                  </MapboxGL.ShapeSource>
                </>
              )}
            </MapboxGL.MapView>
          </View>
        )}

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          {stats.map((stat, idx) => (
            <View key={stat.label} style={styles.statChip}>
              <Text style={styles.statChipValue}>{stat.value}</Text>
              <Text style={styles.statChipLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ═══════════════════════════════════════════
            SEARCH + FILTERS
           ═══════════════════════════════════════════ */}
        <View style={styles.searchSection}>
          <View style={styles.searchWrap}>
            <Search size={15} color={C.textTertiary} strokeWidth={1.5} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search destinations..."
              placeholderTextColor={C.textTertiary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              returnKeyType="search"
              accessibilityLabel="Search destinations"
              accessibilityHint="Filter destinations by name or region"
            />
          </View>
        </View>

        <View style={styles.segmentWrap}>
          <SegmentedControl
            values={regionList.map(r => r === "all" ? "All" : shortName(r))}
            selectedIndex={regionList.indexOf(regionFilter)}
            onChange={(e) => {
              const idx = e.nativeEvent.selectedSegmentIndex;
              Haptics.selectionAsync();
              setRegionFilter(regionList[idx]);
            }}
            appearance={isDark ? "dark" : "light"}
            activeFontStyle={{ fontWeight: "600", color: "#fff" }}
            tintColor={C.teal}
          />
        </View>

        {/* ═══════════════════════════════════════════
            DESTINATION CARDS
           ═══════════════════════════════════════════ */}
        {filtered.length === 0 ? (
          <View style={styles.noMatch}>
            <Text style={styles.noMatchText}>No matches found</Text>
          </View>
        ) : (
          <View style={styles.gridSection}>
            <View style={styles.cardsGrid}>
              {filtered.map((dest, i) => {
                return (
                  <ContextMenu
                    key={dest.name}
                    style={{ width: "100%" }}
                    actions={[
                      { title: "Open Trip", systemIcon: "arrow.right" },
                      { title: "Share", systemIcon: "square.and.arrow.up" },
                    ]}
                    onPress={(e: any) => {
                      if (e.nativeEvent.index === 0) dest.tripIds[0] && router.push(`/trip/${dest.tripIds[0]}`);
                      else if (e.nativeEvent.index === 1) Share.share({ message: `Check out ${dest.name}` });
                    }}
                  >
                  <ScalePress
                    style={styles.card}
                    activeScale={0.97}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      dest.tripIds[0] && router.push(`/trip/${dest.tripIds[0]}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${dest.name}, ${plural(dest.tripCount, "trip")}, ${plural(dest.eventCount, "event")}`}
                  >
                    <CachedImage uri={dest.image} style={StyleSheet.absoluteFillObject} />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.85)"]}
                      locations={[0.3, 1]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {/* Top pills */}
                    <View style={styles.cardTopRow}>
                      <View style={[styles.cardPill, { backgroundColor: C.teal }]}>
                        <Plane size={10} color="#000" strokeWidth={2.5} />
                        <Text style={styles.cardPillText}>
                          {plural(dest.tripCount, "trip")}
                        </Text>
                      </View>
                      {dest.region !== "International" && (
                        <View style={styles.regionPill}>
                          <Text style={styles.regionPillText}>{dest.region}</Text>
                        </View>
                      )}
                    </View>
                    {/* Bottom content */}
                    <View style={styles.cardBottom}>
                      <Text style={styles.cardName} numberOfLines={2}>
                        {dest.name}
                      </Text>
                      {/* Event type breakdown */}
                      <View style={styles.cardTypes}>
                        {dest.types.flights > 0 && (
                          <View style={styles.typeBadge}>
                            <Plane size={9} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                            <Text style={styles.typeBadgeText}>{dest.types.flights}</Text>
                          </View>
                        )}
                        {dest.types.hotels > 0 && (
                          <View style={styles.typeBadge}>
                            <Hotel size={9} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                            <Text style={styles.typeBadgeText}>{dest.types.hotels}</Text>
                          </View>
                        )}
                        {dest.types.activities > 0 && (
                          <View style={styles.typeBadge}>
                            <Compass size={9} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                            <Text style={styles.typeBadgeText}>{dest.types.activities}</Text>
                          </View>
                        )}
                        {dest.types.dining > 0 && (
                          <View style={styles.typeBadge}>
                            <Utensils size={9} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                            <Text style={styles.typeBadgeText}>{dest.types.dining}</Text>
                          </View>
                        )}
                        {dest.types.transfers > 0 && (
                          <View style={styles.typeBadge}>
                            <Car size={9} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                            <Text style={styles.typeBadgeText}>{dest.types.transfers}</Text>
                          </View>
                        )}
                      </View>
                      {/* Next visit */}
                      {new Date(dest.nextVisit) > new Date() && (
                        <View style={styles.cardMeta}>
                          <CalendarDays size={10} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
                          <Text style={styles.cardMetaText}>
                            {new Date(dest.nextVisit).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </Text>
                        </View>
                      )}
                    </View>
                  </ScalePress>
                  </ContextMenu>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════ */

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.card },
    scroll: { paddingBottom: 120 },
    stickyHeader: {
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      overflow: "hidden",
    },
    screenTitle: {
      fontSize: 22, fontWeight: "700",
      color: C.teal, paddingHorizontal: S.md,
      paddingVertical: 10,
    },

    // ─── Header ───
    headerWrap: {
      paddingHorizontal: S.md, paddingTop: S.md, paddingBottom: S.sm,
    },
    headerTitle: {
      fontSize: T["3xl"], fontWeight: T.black, letterSpacing: -0.5,
      color: C.textPrimary,
    },
    headerSub: {
      fontSize: T.sm, fontWeight: T.semibold,
      color: C.textSecondary, marginTop: 3,
    },
    mapCard: {
      height: 220,
      overflow: "hidden",
      backgroundColor: C.card,
    },

    // ─── Stats chips ───
    statsRow: {
      flexDirection: "row", gap: 8,
      paddingHorizontal: S.md, marginTop: S.sm,
    },
    statChip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: C.card,
      borderRadius: R.full,
      paddingHorizontal: 12, paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.borderLight,
    },
    statChipValue: {
      fontSize: T.sm, fontWeight: T.bold, color: C.teal,
      fontVariant: ["tabular-nums"],
    },
    statChipLabel: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textSecondary,
      textTransform: "uppercase", letterSpacing: 0.5,
    },

    // ─── Search ───
    searchSection: {
      paddingHorizontal: S.md, marginTop: S.sm, marginBottom: S.xs,
    },
    searchWrap: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      backgroundColor: C.card, borderRadius: R.xl,
      paddingHorizontal: S.sm + 2, height: 44,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.borderLight,
    },
    searchInput: {
      flex: 1, fontSize: T.base, color: C.textPrimary,
      fontWeight: T.medium,
    },

    // ─── Filters ───
    segmentWrap: {
      paddingHorizontal: S.md, marginBottom: S.sm,
    },

    // ─── Card grid ───
    gridSection: {
      paddingHorizontal: S.md,
    },
    cardsGrid: {
      gap: S.sm,
    },
    card: {
      width: "100%", height: 200, borderRadius: R["2xl"],
      overflow: "hidden", backgroundColor: C.card,
    },
    cardTopRow: {
      position: "absolute", top: 0, left: 0, right: 0,
      padding: S.sm, zIndex: 2,
      flexDirection: "row", alignItems: "center", gap: 6,
    },
    cardPill: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
    },
    cardPillText: {
      fontSize: T.xs, fontWeight: T.bold, color: "#000",
    },
    regionPill: {
      backgroundColor: "rgba(0,0,0,0.5)",
      borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(255,255,255,0.15)",
    },
    regionPillText: {
      fontSize: 10, fontWeight: T.bold, color: "#fff",
      letterSpacing: 0.5, textTransform: "uppercase",
    },
    cardBottom: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: S.md,
    },
    cardName: {
      fontSize: T.md, fontWeight: T.bold,
      color: "#fff", letterSpacing: -0.2, marginBottom: 4,
    },
    cardTypes: {
      flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6,
      flexWrap: "wrap",
    },
    typeBadge: {
      flexDirection: "row", alignItems: "center", gap: 3,
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: R.full, paddingHorizontal: 7, paddingVertical: 3,
    },
    typeBadgeText: {
      fontSize: 10, fontWeight: T.bold, color: "rgba(255,255,255,0.7)",
      fontVariant: ["tabular-nums"],
    },
    cardMeta: {
      flexDirection: "row", alignItems: "center", gap: 5,
    },
    cardMetaText: {
      fontSize: T.xs, fontWeight: T.medium, color: "rgba(255,255,255,0.55)",
    },

    // ─── Empty states ───
    empty: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingTop: 120, paddingHorizontal: S.xl, gap: S.sm,
    },
    emptyTitle: {
      fontSize: T.xl, fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.3,
    },
    emptyText: {
      fontSize: T.base, color: C.textTertiary, textAlign: "center", lineHeight: 24,
    },
    noMatch: { alignItems: "center", paddingTop: 40 },
    noMatchText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },
  });
}
