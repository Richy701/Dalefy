import { View, Text, ScrollView, StyleSheet, TextInput, Pressable, Dimensions, RefreshControl, Platform, Share } from "react-native";
import ContextMenu from "@/components/ContextMenu";
import { Illustration } from "@/components/Illustration";
import { CachedImage } from "@/components/CachedImage";
import { ScalePress } from "@/components/ScalePress";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Search, Globe, MapPin, Navigation, Plane } from "lucide-react-native";

const HAS_LIQUID_GLASS = isLiquidGlassAvailable();
import * as Haptics from "expo-haptics";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "expo-router";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S } from "@/constants/theme";

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch { /* native module not available — map will be hidden */ }

const DARK_STYLE  = "mapbox://styles/mapbox/dark-v11";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN!;

const geocodeCache: Record<string, [number, number] | null> = {};

async function geocodeDestination(name: string): Promise<[number, number] | null> {
  if (name in geocodeCache) return geocodeCache[name];
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    );
    const json = await res.json();
    const center = json.features?.[0]?.center as [number, number] | undefined;
    geocodeCache[name] = center ?? null;
    return center ?? null;
  } catch {
    geocodeCache[name] = null;
    return null;
  }
}

const { width: SCREEN_W } = Dimensions.get("window");
const MAP_HEIGHT = 320;

type Destination = {
  name: string; region: string; tripCount: number;
  image: string; eventCount: number; coords?: [number, number];
  nextVisit: string; tripIds: string[];
  types: { flights: number; hotels: number; activities: number; dining: number };
};

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
  const handleMapLoaded = useCallback(() => setMapReady(true), []);
  const insets = useSafeAreaInsets();

  useEffect(() => { setMapReady(false); }, [isDark]);

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
          types: { flights: 0, hotels: 0, activities: 0, dining: 0 },
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
      });
    });
    return [...map.values()].sort((a, b) => b.eventCount - a.eventCount);
  }, [trips]);

  const [geoCoords, setGeoCoords] = useState<Record<string, [number, number]>>({});

  useEffect(() => {
    destinations.forEach(d => {
      if (d.name in geocodeCache) {
        const cached = geocodeCache[d.name];
        if (cached) setGeoCoords(prev => ({ ...prev, [d.name]: cached }));
      } else {
        geocodeDestination(d.name).then(coords => {
          if (coords) setGeoCoords(prev => ({ ...prev, [d.name]: coords }));
        });
      }
    });
  }, [destinations]);

  const regionCount = new Set(destinations.map(d => d.region)).size;
  const totalEvents = destinations.reduce((s, d) => s + d.eventCount, 0);

  const regionList = useMemo(() => {
    const set = new Set(destinations.map(d => d.region));
    return ["all", ...Array.from(set).sort()];
  }, [destinations]);

  const filtered = useMemo(() =>
    destinations.filter(d => {
      if (regionFilter !== "all" && d.region !== regionFilter) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
          !d.region.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }), [destinations, regionFilter, search]);

  const pinsWithCoords = useMemo(() =>
    destinations
      .map(d => ({ ...d, coords: geoCoords[d.name] as [number, number] | undefined }))
      .filter((d): d is typeof d & { coords: [number, number] } => !!d.coords),
    [destinations, geoCoords]
  );

  const geojson: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: pinsWithCoords.map(d => ({
      type: "Feature" as const,
      properties: { name: d.name, tripCount: d.tripCount },
      geometry: { type: "Point" as const, coordinates: d.coords },
    })),
  }), [pinsWithCoords]);

  const heatmapGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: pinsWithCoords.map(d => ({
      type: "Feature" as const,
      properties: { weight: Math.min(d.tripCount / 3, 1) },
      geometry: { type: "Point" as const, coordinates: d.coords },
    })),
  }), [pinsWithCoords]);


  if (destinations.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Illustration name="movement" width={260} height={160} />
          <Text style={styles.emptyTitle}>Your map awaits</Text>
          <Text style={styles.emptyText}>Add a trip to start dropping pins — each destination you unlock shows up here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = [
    { label: "Places", value: destinations.length, icon: MapPin },
    { label: "Regions", value: regionCount, icon: Globe },
    { label: "Events", value: totalEvents, icon: Navigation },
  ];

  const cardW = (SCREEN_W - S.md * 2 - S.sm) / 2;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
        scrollIndicatorInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ═══════════════════════════════════════════
            MAP HERO — immersive full-bleed with
            glassmorphic stat bar overlaid at bottom
           ═══════════════════════════════════════════ */}
        <View style={styles.mapWrap}>
          {MapboxGL ? (
            <MapboxGL.MapView
              style={StyleSheet.absoluteFillObject}
              styleURL={isDark ? DARK_STYLE : LIGHT_STYLE}
              projection="mercator"
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
              compassEnabled={false}
              scaleBarEnabled={false}
              onDidFinishLoadingStyle={handleMapLoaded}
            >
              <MapboxGL.Camera
                zoomLevel={0.8}
                centerCoordinate={[10, 20]}
                animationDuration={0}
              />
              {mapReady && (
                <>
                  <MapboxGL.ShapeSource id="dest-heatmap" shape={heatmapGeoJSON}>
                    <MapboxGL.HeatmapLayer
                      id="heatmap"
                      style={{
                        heatmapWeight: ["get", "weight"],
                        heatmapIntensity: 0.8,
                        heatmapRadius: 50,
                        heatmapOpacity: 0.6,
                        heatmapColor: [
                          "interpolate", ["linear"], ["heatmap-density"],
                          0, "rgba(0,0,0,0)",
                          0.2, "rgba(11,210,181,0.15)",
                          0.4, "rgba(11,210,181,0.3)",
                          0.6, "rgba(11,210,181,0.5)",
                          0.8, "rgba(11,210,181,0.7)",
                          1, C.teal,
                        ],
                      }}
                    />
                  </MapboxGL.ShapeSource>
                  {/* Outer glow ring */}
                  <MapboxGL.ShapeSource id="dest-glow" shape={geojson}>
                    <MapboxGL.CircleLayer
                      id="glow"
                      style={{
                        circleRadius: 20,
                        circleColor: C.teal,
                        circleOpacity: 0.08,
                        circleBlur: 1,
                      }}
                    />
                  </MapboxGL.ShapeSource>
                  {/* Ring */}
                  <MapboxGL.ShapeSource id="dest-rings" shape={geojson}>
                    <MapboxGL.CircleLayer
                      id="rings"
                      style={{
                        circleRadius: 12,
                        circleColor: "transparent",
                        circleStrokeWidth: 1.5,
                        circleStrokeColor: C.teal,
                        circleStrokeOpacity: 0.5,
                      }}
                    />
                  </MapboxGL.ShapeSource>
                  {/* Center dot */}
                  <MapboxGL.ShapeSource id="dest-dots" shape={geojson}>
                    <MapboxGL.CircleLayer
                      id="dots"
                      style={{
                        circleRadius: 5,
                        circleColor: C.teal,
                        circleStrokeWidth: 2,
                        circleStrokeColor: isDark ? "#131316" : "#ffffff",
                      }}
                    />
                  </MapboxGL.ShapeSource>
                </>
              )}
            </MapboxGL.MapView>
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.mapFallback]} />
          )}

          {/* Top vignette for status bar legibility */}
          <LinearGradient
            colors={[isDark ? "rgba(9,9,11,0.7)" : "rgba(247,248,251,0.6)", "transparent"]}
            locations={[0, 1]}
            style={styles.mapFadeTop}
            pointerEvents="none"
          />
          {/* Bottom fade into bg */}
          <LinearGradient
            colors={["transparent", C.bg]}
            locations={[0.5, 1]}
            style={styles.mapFadeBottom}
            pointerEvents="none"
          />

          {/* Title */}
          <View style={[styles.mapTitleWrap, { top: insets.top + 6 }]} pointerEvents="none">
            <Text style={styles.mapTitleText}>Destinations</Text>
            <Text style={styles.mapSubText}>
              {plural(destinations.length, "place")} · {plural(regionCount, "region")}
            </Text>
          </View>

        </View>

        {/* ── Glassmorphic stats bar ── */}
        <View style={styles.statsBarWrap}>
          {Platform.OS === "ios" && HAS_LIQUID_GLASS ? (
            <GlassView glassEffectStyle="regular" colorScheme={isDark ? "dark" : "light"} style={styles.statsBar}>
              <View style={styles.statsBarInner}>
                {stats.map((stat, idx) => (
                  <View key={stat.label} style={styles.statItem}>
                    {idx > 0 && <View style={styles.statDivider} />}
                    <View style={styles.statBody}>
                      <View style={styles.statIconWrap}>
                        <stat.icon size={13} color={C.teal} strokeWidth={2} />
                      </View>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </GlassView>
          ) : Platform.OS === "ios" ? (
            <BlurView intensity={isDark ? 40 : 60} tint={isDark ? "dark" : "light"} style={styles.statsBar}>
              <View style={styles.statsBarInner}>
                {stats.map((stat, idx) => (
                  <View key={stat.label} style={styles.statItem}>
                    {idx > 0 && <View style={styles.statDivider} />}
                    <View style={styles.statBody}>
                      <View style={styles.statIconWrap}>
                        <stat.icon size={13} color={C.teal} strokeWidth={2} />
                      </View>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </BlurView>
          ) : (
            <View style={[styles.statsBar, {
              backgroundColor: isDark ? "rgba(9,9,11,0.93)" : "rgba(255,255,255,0.93)",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            }]}>
              <View style={styles.statsBarInner}>
                {stats.map((stat, idx) => (
                  <View key={stat.label} style={styles.statItem}>
                    {idx > 0 && <View style={styles.statDivider} />}
                    <View style={styles.statBody}>
                      <View style={styles.statIconWrap}>
                        <stat.icon size={13} color={C.teal} strokeWidth={2} />
                      </View>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      <Text style={styles.statLabel}>{stat.label}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ═══════════════════════════════════════════
            SEARCH + FILTERS
           ═══════════════════════════════════════════ */}
        <View style={styles.searchSection}>
          <View style={styles.searchWrap}>
            <Search size={16} color={C.textTertiary} strokeWidth={1.5} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search destinations..."
              placeholderTextColor={C.textTertiary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              accessibilityLabel="Search destinations"
              accessibilityHint="Filter destinations by name or region"
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {regionList.map(r => {
            const active = regionFilter === r;
            return (
              <Pressable
                key={r}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setRegionFilter(r);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${r === "all" ? "all regions" : r}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {r === "all" ? "All" : r}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

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
                const isHero = i === 0;
                return (
                  <ContextMenu
                    key={dest.name}
                    actions={[
                      { title: "Open Trip", systemIcon: "arrow.right" },
                      { title: "Share", systemIcon: "square.and.arrow.up" },
                    ]}
                    onPress={(e) => {
                      if (e.nativeEvent.index === 0) dest.tripIds[0] && router.push(`/trip/${dest.tripIds[0]}`);
                      else if (e.nativeEvent.index === 1) Share.share({ message: `Check out ${dest.name}` });
                    }}
                  >
                  <ScalePress
                    style={[styles.card, isHero ? styles.cardHero : { width: cardW }]}
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
                      locations={[isHero ? 0.35 : 0.25, 1]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {/* Trip count pill */}
                    <View style={styles.cardTopRow}>
                      <View style={[styles.cardPill, { backgroundColor: C.teal }]}>
                        <Plane size={10} color="#000" strokeWidth={2.5} />
                        <Text style={styles.cardPillText}>
                          {plural(dest.tripCount, "trip")}
                        </Text>
                      </View>
                    </View>
                    {/* Bottom content */}
                    <View style={styles.cardBottom}>
                      <Text style={[styles.cardName, isHero && styles.cardNameHero]} numberOfLines={2}>
                        {dest.name}
                      </Text>
                      <View style={styles.cardMeta}>
                        <Text style={styles.cardMetaText}>{plural(dest.eventCount, "event")}</Text>
                      </View>
                    </View>
                  </ScalePress>
                  </ContextMenu>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════ */

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 120 },

    // ─── Map hero ───
    mapWrap: {
      height: MAP_HEIGHT,
      width: "100%",
      overflow: "hidden",
    },
    mapFallback: { backgroundColor: C.card },
    mapFadeTop: {
      position: "absolute", top: 0, left: 0, right: 0,
      height: 90, zIndex: 2,
    },
    mapFadeBottom: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      height: 120,
    },
    mapTitleWrap: {
      position: "absolute", left: S.lg, right: S.lg, zIndex: 3,
    },
    mapTitleText: {
      fontSize: T["3xl"], fontWeight: T.black, letterSpacing: -0.5,
      color: "#fff",
      textShadowColor: "rgba(0,0,0,0.7)",
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 8,
    },
    mapSubText: {
      fontSize: T.sm, fontWeight: T.semibold, letterSpacing: 0.2,
      color: "rgba(255,255,255,0.65)", marginTop: 3,
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },

    // ─── Glassmorphic stats ───
    statsBarWrap: {
      paddingHorizontal: S.md, marginTop: -S.xl, zIndex: 4,
    },
    statsBar: {
      borderRadius: R.xl,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    },
    statsBarInner: {
      flexDirection: "row",
      paddingVertical: 12,
      paddingHorizontal: 4,
      backgroundColor: isDark ? "rgba(19,19,22,0.55)" : "rgba(255,255,255,0.55)",
    },
    statItem: {
      flex: 1, flexDirection: "row", alignItems: "center",
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
    },
    statBody: {
      flex: 1, alignItems: "center", gap: 2,
    },
    statIconWrap: {
      width: 26, height: 26, borderRadius: 13,
      alignItems: "center", justifyContent: "center",
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      marginBottom: 2,
    },
    statValue: {
      fontSize: T.lg, fontWeight: T.bold, color: isDark ? "#fff" : C.textPrimary,
      letterSpacing: -0.3,
      fontVariant: ["tabular-nums"],
    },
    statLabel: {
      fontSize: 10, fontWeight: T.semibold,
      color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
      letterSpacing: 0.5,
      textTransform: "uppercase",
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
    filterRow: {
      paddingHorizontal: S.md, paddingVertical: S.sm, gap: 8,
    },
    filterChip: {
      paddingHorizontal: 16, minHeight: 36, justifyContent: "center",
      borderRadius: R.full,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.borderLight,
    },
    filterChipActive: {
      backgroundColor: C.teal,
      borderColor: C.teal,
    },
    filterText: {
      fontSize: T.sm, fontWeight: T.semibold, color: C.textSecondary,
    },
    filterTextActive: { color: "#000" },

    // ─── Card grid ───
    gridSection: {
      paddingHorizontal: S.md,
    },
    cardsGrid: {
      flexDirection: "row", flexWrap: "wrap", gap: S.sm,
    },
    card: {
      height: 180, borderRadius: R["2xl"],
      overflow: "hidden", backgroundColor: C.card,
    },
    cardHero: {
      width: "100%", height: 220,
    },
    cardTopRow: {
      position: "absolute", top: 0, left: 0, right: 0,
      padding: S.sm, zIndex: 2,
    },
    cardPill: {
      alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4,
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
    },
    cardPillText: {
      fontSize: T.xs, fontWeight: T.bold, color: "#000",
    },
    cardBottom: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: S.md,
    },
    cardName: {
      fontSize: T.md, fontWeight: T.bold,
      color: "#fff", letterSpacing: -0.2, marginBottom: 4,
    },
    cardNameHero: {
      fontSize: T["2xl"], letterSpacing: -0.4,
    },
    cardMeta: {
      flexDirection: "row", alignItems: "center", gap: 6,
    },
    cardMetaText: {
      fontSize: T.xs, fontWeight: T.medium, color: "rgba(255,255,255,0.65)",
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
