import { View, Text, ScrollView, StyleSheet, TextInput, Pressable, Dimensions, RefreshControl } from "react-native";
import { Illustration } from "@/components/Illustration";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Search, Globe, MapPin, Navigation } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

import { interpolateArc } from "@/shared/mapUtils";

const { width: SCREEN_W } = Dimensions.get("window");

type Destination = {
  name: string; region: string; tripCount: number;
  image: string; eventCount: number; coords?: [number, number];
  nextVisit: string; tripIds: string[];
  types: { flights: number; hotels: number; activities: number; dining: number };
};

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

  const connectionLines: GeoJSON.FeatureCollection = useMemo(() => {
    const added = new Set<string>();
    const features: GeoJSON.Feature[] = [];
    for (const from of pinsWithCoords) {
      const nearest = [...pinsWithCoords]
        .filter(p => p.name !== from.name)
        .sort((a, b) => {
          const da = Math.hypot(from.coords[0] - a.coords[0], from.coords[1] - a.coords[1]);
          const db = Math.hypot(from.coords[0] - b.coords[0], from.coords[1] - b.coords[1]);
          return da - db;
        })
        .slice(0, 2);
      for (const to of nearest) {
        const key = [from.name, to.name].sort().join("-");
        if (!added.has(key)) {
          added.add(key);
          features.push({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [from.coords, to.coords] },
          });
        }
      }
    }
    return { type: "FeatureCollection", features };
  }, [pinsWithCoords]);

  // Heatmap GeoJSON — weighted by trip count
  const heatmapGeoJSON: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: pinsWithCoords.map(d => ({
      type: "Feature" as const,
      properties: { weight: Math.min(d.tripCount / 3, 1) },
      geometry: { type: "Point" as const, coordinates: d.coords },
    })),
  }), [pinsWithCoords]);

  // Animated plane positions along connection lines
  const [planeGeoJSON, setPlaneGeoJSON] = useState<GeoJSON.FeatureCollection>({
    type: "FeatureCollection", features: [],
  });
  const planeTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (connectionLines.features.length === 0) {
      setPlaneGeoJSON({ type: "FeatureCollection", features: [] });
      return;
    }
    const arcs = connectionLines.features.map(f => (f.geometry as any).coordinates as number[][]);
    const DURATION = 8000;
    const start = Date.now();

    planeTimerRef.current = setInterval(() => {
      const t = ((Date.now() - start) % DURATION) / DURATION;
      const features: GeoJSON.Feature[] = arcs.map((arc, i) => {
        const pos = interpolateArc(arc, t);
        return {
          type: "Feature" as const,
          properties: { bearing: pos.bearing, idx: i },
          geometry: { type: "Point" as const, coordinates: [pos.lng, pos.lat] },
        };
      });
      setPlaneGeoJSON({ type: "FeatureCollection", features });
    }, 80); // ~12fps — smooth enough, battery-friendly

    return () => clearInterval(planeTimerRef.current);
  }, [connectionLines]);

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

  const featured = filtered[0];
  const gridItems = filtered.slice(1);

  const stats = [
    { label: "Destinations", value: destinations.length, icon: MapPin },
    { label: "Regions", value: regionCount, icon: Globe },
    { label: "Events",  value: totalEvents, icon: Navigation },
  ];

  return (
    <View style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentInset={{ top: 0, bottom: 0, left: 0, right: 0 }}
        scrollIndicatorInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.teal} />}
      >

        {/* ── World Map — full bleed with fade ── */}
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
                  zoomLevel={0.5}
                  centerCoordinate={[10, 15]}
                  animationDuration={0}
                />
                {mapReady && (
                  <>
                    {/* Heatmap layer */}
                    <MapboxGL.ShapeSource id="dest-heatmap" shape={heatmapGeoJSON}>
                      <MapboxGL.HeatmapLayer
                        id="heatmap"
                        style={{
                          heatmapWeight: ["get", "weight"],
                          heatmapIntensity: 0.6,
                          heatmapRadius: 40,
                          heatmapOpacity: 0.5,
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
                    {/* Connection lines */}
                    <MapboxGL.ShapeSource id="dest-connections" shape={connectionLines}>
                      <MapboxGL.LineLayer
                        id="connection-lines"
                        style={{
                          lineColor: C.teal,
                          lineWidth: 1,
                          lineOpacity: 0.35,
                          lineCap: "round",
                          lineJoin: "round",
                        }}
                      />
                    </MapboxGL.ShapeSource>
                    {/* Animated planes along connections */}
                    <MapboxGL.ShapeSource id="dest-planes" shape={planeGeoJSON}>
                      <MapboxGL.SymbolLayer
                        id="plane-icons"
                        style={{
                          iconImage: "airport",
                          iconSize: 0.7,
                          iconColor: C.teal,
                          iconRotate: ["get", "bearing"],
                          iconRotationAlignment: "map",
                          iconAllowOverlap: true,
                          iconIgnorePlacement: true,
                        }}
                      />
                    </MapboxGL.ShapeSource>
                    {/* Destination rings */}
                    <MapboxGL.ShapeSource id="dest-rings" shape={geojson}>
                      <MapboxGL.CircleLayer
                        id="rings"
                        style={{
                          circleRadius: 14,
                          circleColor: "transparent",
                          circleStrokeWidth: 1.2,
                          circleStrokeColor: C.teal,
                          circleStrokeOpacity: 0.3,
                        }}
                      />
                    </MapboxGL.ShapeSource>
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
          {/* Fade overlay at bottom of map */}
          <LinearGradient
            colors={["transparent", C.bg]}
            locations={[0.4, 1]}
            style={styles.mapFade}
            pointerEvents="none"
          />
          {/* Title overlay */}
          <View style={[styles.mapTitle, { top: insets.top + 8 }]} pointerEvents="none">
            <Text style={styles.mapTitleText}>Destinations</Text>
            <Text style={styles.mapSubText}>{destinations.length} places · {regionCount} regions</Text>
          </View>
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          {stats.map(stat => (
            <View key={stat.label} style={styles.statChip}>
              <stat.icon size={13} color={C.teal} strokeWidth={1.8} />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Search ── */}
        <View style={styles.searchSection}>
          <View style={styles.searchWrap}>
            <Search size={14} color={C.textTertiary} strokeWidth={1.5} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search destinations"
              placeholderTextColor={C.textTertiary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* ── Region filter chips ── */}
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
                onPress={() => setRegionFilter(r)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {r === "all" ? "All" : r}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={styles.noMatch}>
            <Text style={styles.noMatchText}>No matches found</Text>
          </View>
        ) : (
          <>
            {/* ── Featured destination — full width hero ── */}
            {featured && (
              <View style={styles.featuredSection}>
                <Pressable
                  style={styles.featuredCard}
                  onPress={() => featured.tripIds[0] && router.push(`/trip/${featured.tripIds[0]}`)}
                >
                  <CachedImage uri={featured.image} style={StyleSheet.absoluteFillObject} />
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.8)"]}
                    locations={[0.25, 1]}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {/* Region badge */}
                  <View style={styles.featuredBadgeWrap}>
                    <View style={styles.featuredBadge}>
                      <Text style={styles.featuredBadgeText}>{featured.region}</Text>
                    </View>
                  </View>
                  {/* Bottom content */}
                  <View style={styles.featuredContent}>
                    <Text style={styles.featuredName} numberOfLines={2}>{featured.name}</Text>
                    <View style={styles.featuredMeta}>
                      <Text style={styles.featuredMetaText}>
                        {featured.tripCount} {featured.tripCount === 1 ? "trip" : "trips"}
                      </Text>
                      <View style={styles.metaDot} />
                      <Text style={styles.featuredMetaText}>{featured.eventCount} events</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            )}

            {/* ── Grid ── */}
            {gridItems.length > 0 && (
              <View style={styles.gridSection}>
                <Text style={styles.sectionLabel}>All Destinations</Text>
                <View style={styles.cardsGrid}>
                  {gridItems.map(dest => {
                    const cardW = (SCREEN_W - S.md * 2 - S.xs) / 2;
                    return (
                      <Pressable
                        key={dest.name}
                        style={[styles.card, { width: cardW }]}
                        onPress={() => dest.tripIds[0] && router.push(`/trip/${dest.tripIds[0]}`)}
                      >
                        <CachedImage uri={dest.image} style={StyleSheet.absoluteFillObject} />
                        <LinearGradient
                          colors={["transparent", "rgba(0,0,0,0.75)"]}
                          locations={[0.3, 1]}
                          style={StyleSheet.absoluteFillObject}
                        />
                        <View style={styles.cardTopRow}>
                          <View style={styles.cardBadge}>
                            <Text style={styles.cardBadgeText}>{dest.region}</Text>
                          </View>
                        </View>
                        <View style={styles.cardContent}>
                          <Text style={styles.destName} numberOfLines={2}>{dest.name}</Text>
                          <View style={styles.cardMeta}>
                            <Text style={styles.cardMetaText}>
                              {dest.tripCount} {dest.tripCount === 1 ? "trip" : "trips"}
                            </Text>
                            <View style={styles.metaDot} />
                            <Text style={styles.cardMetaText}>{dest.eventCount} events</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },

    // Map
    mapWrap: {
      height: 240,
      width: "100%", overflow: "hidden",
    },
    mapFallback: { backgroundColor: C.card },
    mapFade: {
      position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
    },
    mapTitle: {
      position: "absolute", left: S.md, right: S.md,
    },
    mapTitleText: {
      fontSize: T["2xl"], fontWeight: T.bold,
      color: "#fff", letterSpacing: -0.3,
      textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
    },
    mapSubText: {
      fontSize: T.xs, fontWeight: T.medium,
      color: "rgba(255,255,255,0.7)", marginTop: 2,
      textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
    },

    // Stats
    statsRow: {
      flexDirection: "row", paddingHorizontal: S.md, gap: S.xs,
      marginTop: -S.md,
      marginBottom: S.sm,
    },
    statChip: {
      flex: 1, alignItems: "center", gap: 2,
      backgroundColor: C.card, borderRadius: R.lg,
      paddingVertical: S.sm,
    },
    statValue: {
      fontSize: T.xl, fontWeight: T.bold, color: C.textPrimary,
      letterSpacing: -0.5,
    },
    statLabel: {
      fontSize: 9, fontWeight: T.medium, color: C.textTertiary, letterSpacing: 0.3,
    },

    // Search
    searchSection: {
      paddingHorizontal: S.md, marginBottom: S.xs,
    },
    searchWrap: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      backgroundColor: C.card, borderRadius: R.lg,
      paddingHorizontal: S.sm, height: 40,
    },
    searchInput: {
      flex: 1, fontSize: T.sm, color: C.textPrimary,
      fontWeight: T.medium,
    },

    // Filters
    filterRow: {
      paddingHorizontal: S.md, paddingVertical: S.xs, gap: 6,
    },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.full,
      backgroundColor: C.card,
    },
    filterChipActive: { backgroundColor: C.teal },
    filterText: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textSecondary,
    },
    filterTextActive: { color: "#000" },

    // Featured card
    featuredSection: {
      paddingHorizontal: S.md, marginBottom: S.sm,
    },
    featuredCard: {
      height: 240, borderRadius: R.xl,
      overflow: "hidden", backgroundColor: C.card,
    },
    featuredBadgeWrap: {
      position: "absolute", top: 0, left: 0, right: 0,
      padding: S.sm, zIndex: 2,
    },
    featuredBadge: {
      alignSelf: "flex-start",
      backgroundColor: "rgba(0,0,0,0.45)",
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4,
    },
    featuredBadgeText: {
      fontSize: T.xs, fontWeight: T.semibold, color: "rgba(255,255,255,0.9)",
    },
    featuredContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: S.md,
    },
    featuredName: {
      fontSize: T.xl, fontWeight: T.bold,
      color: "#fff", letterSpacing: -0.3, marginBottom: 6,
    },
    featuredMeta: {
      flexDirection: "row", alignItems: "center", gap: 6,
    },
    featuredMetaText: {
      fontSize: T.xs, fontWeight: T.medium, color: "rgba(255,255,255,0.7)",
    },

    // Section label
    gridSection: {
      paddingHorizontal: S.md,
    },
    sectionLabel: {
      fontSize: T.xs, fontWeight: T.semibold, color: C.textTertiary,
      letterSpacing: 0.5, marginBottom: S.sm,
    },

    // Cards — 2-column grid
    cardsGrid: {
      flexDirection: "row", flexWrap: "wrap", gap: S.xs,
    },
    card: {
      height: 200, borderRadius: R.lg,
      overflow: "hidden", backgroundColor: C.card,
    },
    cardTopRow: {
      position: "absolute", top: 0, left: 0, right: 0,
      padding: S.xs, zIndex: 2,
    },
    cardBadge: {
      alignSelf: "flex-start",
      backgroundColor: "rgba(0,0,0,0.45)",
      borderRadius: R.full, paddingHorizontal: 7, paddingVertical: 3,
    },
    cardBadgeText: {
      fontSize: 9, fontWeight: T.semibold, color: "rgba(255,255,255,0.85)",
    },
    cardContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: S.xs,
    },
    destName: {
      fontSize: T.base, fontWeight: T.bold,
      color: "#fff", letterSpacing: -0.2, marginBottom: 3,
    },
    cardMeta: {
      flexDirection: "row", alignItems: "center", gap: 4,
    },
    cardMetaText: {
      fontSize: 9, fontWeight: T.medium, color: "rgba(255,255,255,0.6)",
    },
    metaDot: {
      width: 2, height: 2, borderRadius: 1,
      backgroundColor: "rgba(255,255,255,0.3)",
    },

    // Empty / no match
    empty: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingTop: 120, paddingHorizontal: S.xl, gap: S.sm,
    },
    emptyTitle: {
      fontSize: T.xl, fontWeight: T.bold,
      color: C.textPrimary, letterSpacing: -0.3,
    },
    emptyText: { fontSize: T.base, color: C.textTertiary, textAlign: "center", lineHeight: 24 },
    noMatch: { alignItems: "center", paddingTop: 40 },
    noMatchText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },
  });
}
