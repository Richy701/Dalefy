import { View, Text, ScrollView, StyleSheet, Platform, TextInput, Pressable, Dimensions } from "react-native";
import { Illustration } from "@/components/Illustration";
import { CachedImage } from "@/components/CachedImage";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MapPin, Search, Plane, Hotel, Compass, Utensils, CalendarDays } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useState, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S, F } from "@/constants/theme";

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch { /* native module not available — map will be hidden */ }

const DARK_STYLE  = "mapbox://styles/mapbox/dark-v11";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";

const DEST_COORDS: Record<string, [number, number]> = {
  "Kenya Luxury Safari":   [35.14,  -1.50],
  "Japan Discovery":       [139.69,  35.68],
  "Maldives Retreat":      [73.00,    5.11],
  "Amalfi Coast Tour":     [14.61,   40.65],
  "Iceland Coastal FAM":   [-21.90,  64.14],
  "Bali VIP Retreat":      [115.26,  -8.51],
  "Swiss Alps Winter FAM": [7.86,    46.69],
  "New York Urban FAM":    [-74.01,  40.71],
};

const DESTINATION_MAP: Record<string, { region: string }> = {
  "Kenya Luxury Safari":   { region: "East Africa"     },
  "Japan Discovery":       { region: "East Asia"       },
  "Maldives Retreat":      { region: "Indian Ocean"    },
  "Amalfi Coast Tour":     { region: "Southern Europe" },
  "Iceland Coastal FAM":   { region: "Northern Europe" },
  "Bali VIP Retreat":      { region: "Southeast Asia"  },
  "Swiss Alps Winter FAM": { region: "Central Europe"  },
  "New York Urban FAM":    { region: "North America"   },
};

const EVENT_ICONS = {
  flight:   Plane,
  hotel:    Hotel,
  activity: Compass,
  dining:   Utensils,
};

const { width: SCREEN_W } = Dimensions.get("window");

export default function DestinationsScreen() {
  const { C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const { trips } = useTrips();
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");

  const destinations = useMemo(() => {
    const map = new Map<string, {
      name: string; region: string; tripCount: number;
      image: string; eventCount: number; coords?: [number, number];
      nextVisit: string;
      types: { flights: number; hotels: number; activities: number; dining: number };
    }>();
    trips.forEach(trip => {
      const info   = DESTINATION_MAP[trip.name];
      const name   = trip.destination || trip.name;
      const region = info?.region || "International";
      if (!map.has(name)) {
        map.set(name, {
          name, region, tripCount: 0,
          image: trip.image, eventCount: 0,
          coords: DEST_COORDS[trip.name],
          nextVisit: trip.start,
          types: { flights: 0, hotels: 0, activities: 0, dining: 0 },
        });
      }
      const d = map.get(name)!;
      d.tripCount++;
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

  const geojson: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: destinations
      .filter(d => d.coords)
      .map(d => ({
        type: "Feature" as const,
        properties: { name: d.name, tripCount: d.tripCount },
        geometry: { type: "Point" as const, coordinates: d.coords! },
      })),
  }), [destinations]);

  const connectionLines: GeoJSON.FeatureCollection = useMemo(() => {
    const pins = destinations.filter(d => d.coords);
    const added = new Set<string>();
    const features: GeoJSON.Feature[] = [];
    for (const from of pins) {
      const nearest = [...pins]
        .filter(p => p.name !== from.name)
        .sort((a, b) => {
          const da = Math.hypot(from.coords![0] - a.coords![0], from.coords![1] - a.coords![1]);
          const db = Math.hypot(from.coords![0] - b.coords![0], from.coords![1] - b.coords![1]);
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
            geometry: { type: "LineString", coordinates: [from.coords!, to.coords!] },
          });
        }
      }
    }
    return { type: "FeatureCollection", features };
  }, [destinations]);

  if (destinations.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Illustration name="movement" width={260} height={160} />
          <Text style={styles.emptyTitle}>No destinations yet</Text>
          <Text style={styles.emptyText}>Create trips to see your world map</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = [
    { label: "Visited", value: destinations.length },
    { label: "Regions", value: regionCount },
    { label: "Events",  value: totalEvents },
  ];

  return (
    <View style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── World Map — full bleed behind status bar ── */}
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
              >
                <MapboxGL.Camera
                  zoomLevel={0.5}
                  centerCoordinate={[10, 15]}
                  animationDuration={0}
                />
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
                {/* Outer rings */}
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
                {/* Core dots */}
                <MapboxGL.ShapeSource id="dest-dots" shape={geojson}>
                  <MapboxGL.CircleLayer
                    id="dots"
                    style={{
                      circleRadius: 5,
                      circleColor: C.teal,
                      circleStrokeWidth: 2,
                      circleStrokeColor: isDark ? "#111111" : "#ffffff",
                    }}
                  />
                </MapboxGL.ShapeSource>
              </MapboxGL.MapView>
            ) : (
              <View style={[StyleSheet.absoluteFillObject, styles.mapFallback]} />
            )}
        </View>

        {/* ── Title + Stats ── */}
        <View style={styles.titleSection}>
          <Text style={styles.brandName}>DAF Adventures</Text>
          <View style={styles.titleRow}>
            <Text style={styles.pageTitle}>Destinations</Text>
            <View style={styles.statsRow}>
              {stats.map((stat, i) => (
                <View key={stat.label} style={styles.statItem}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label.toUpperCase()}</Text>
                  {i < stats.length - 1 && <View style={styles.statDivider} />}
                </View>
              ))}
            </View>
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
                  {r === "all" ? "All Regions" : r}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Search ── */}
        <View style={styles.searchWrap}>
          <Search size={14} color={C.textTertiary} strokeWidth={1.5} />
          <TextInput
            style={styles.searchInput}
            placeholder="SEARCH DESTINATIONS..."
            placeholderTextColor={C.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {/* ── Cards ── */}
        {filtered.length === 0 ? (
          <View style={styles.noMatch}>
            <Text style={styles.noMatchText}>No matches found</Text>
          </View>
        ) : (
          <View style={styles.cardsWrap}>
            {filtered.map(dest => (
              <View key={dest.name} style={styles.card}>
                <CachedImage uri={dest.image} style={StyleSheet.absoluteFillObject} />
                <LinearGradient
                  colors={["#00000008", "#00000030", "#000000f2"]}
                  locations={[0, 0.35, 1]}
                  style={StyleSheet.absoluteFillObject}
                />

                {/* Top row: region + event count badges */}
                <View style={styles.cardTopRow}>
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>{dest.region}</Text>
                  </View>
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>{dest.eventCount} Events</Text>
                  </View>
                </View>

                {/* Bottom content */}
                <View style={styles.cardContent}>
                  <Text style={styles.destName}>{dest.name}</Text>

                  {/* Bottom divider row: date + trips */}
                  <View style={styles.cardFooter}>
                    <View style={styles.cardFooterItem}>
                      <CalendarDays size={11} color={C.teal} strokeWidth={2} />
                      <Text style={styles.cardFooterText}>
                        {new Date(dest.nextVisit).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    <View style={styles.cardFooterItem}>
                      <MapPin size={11} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                      <Text style={styles.cardFooterText}>
                        {dest.tripCount} {dest.tripCount === 1 ? "Trip" : "Trips"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(C: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: 100 },

    // Map — full bleed behind status bar
    mapWrap: {
      height: Platform.OS === "android" ? 300 : 320,
      width: "100%", overflow: "hidden",
    },
    mapFallback: { backgroundColor: C.card },

    // Title + stats
    titleSection: {
      paddingHorizontal: S.md, paddingTop: S.sm, paddingBottom: S.xs,
    },
    brandName: {
      fontSize: 10, fontWeight: "900" as const, color: C.teal,
      letterSpacing: 3, textTransform: "uppercase", marginBottom: 4,
    },
    titleRow: {
      flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    },
    pageTitle: {
      fontSize: T["3xl"], fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5,
    },
    statsRow: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: C.card, borderRadius: R.full,
      paddingHorizontal: 12, paddingVertical: 6,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      gap: 10, marginBottom: 4,
    },
    statItem: {
      flexDirection: "row", alignItems: "baseline", gap: 2,
    },
    statValue: {
      fontSize: T.xs, fontWeight: T.black, color: C.teal,
    },
    statLabel: {
      fontSize: 8, fontWeight: T.bold, color: C.textTertiary, letterSpacing: 0.8,
    },
    statDivider: {
      width: 2, height: 2, borderRadius: 1,
      backgroundColor: C.textTertiary, opacity: 0.3,
    },

    // Filters
    filterRow: { paddingHorizontal: S.md, gap: 6, marginBottom: S.sm },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.full,
      backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    },
    filterChipActive: { backgroundColor: C.teal, borderColor: C.teal },
    filterText: {
      fontSize: 10, fontWeight: T.bold, color: C.textSecondary,
      letterSpacing: 1.2, textTransform: "uppercase",
    },
    filterTextActive: { color: "#000" },

    // Search
    searchWrap: {
      flexDirection: "row", alignItems: "center", gap: S.xs,
      backgroundColor: C.card, borderRadius: R.full,
      paddingHorizontal: S.md, height: 44,
      borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
      marginHorizontal: S.md, marginBottom: S.md,
    },
    searchInput: {
      flex: 1, fontSize: T.xs, color: C.textPrimary,
      fontWeight: "700" as const, letterSpacing: 1.5, textTransform: "uppercase",
    },

    // Cards — tall like web
    cardsWrap: { paddingHorizontal: S.md, gap: S.md },
    card: {
      height: 340, borderRadius: 28,
      overflow: "hidden", backgroundColor: C.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)",
    },
    cardTopRow: {
      position: "absolute", top: 0, left: 0, right: 0,
      flexDirection: "row", justifyContent: "space-between",
      padding: S.md, zIndex: 2,
    },
    cardBadge: {
      backgroundColor: "rgba(0,0,0,0.5)",
      borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.15)",
    },
    cardBadgeText: {
      fontSize: 10, fontWeight: T.bold, color: "#fff",
      letterSpacing: 0.8, textTransform: "uppercase",
    },
    cardContent: {
      position: "absolute", bottom: 0, left: 0, right: 0,
      padding: S.md, paddingBottom: S.md,
    },
    destName: {
      fontSize: T["2xl"] + 4, fontFamily: F.black, fontWeight: T.black,
      color: "#fff", letterSpacing: -0.3, marginBottom: 10, textTransform: "uppercase",
      lineHeight: 32,
    },
    typePills: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: S.md },
    typePill: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: "rgba(0,0,0,0.4)",
      borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4,
      borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.15)",
    },
    typePillText: {
      fontSize: 10, fontWeight: T.bold, color: "rgba(255,255,255,0.9)",
    },
    cardFooter: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingTop: S.sm,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.15)",
    },
    cardFooterItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    cardFooterText: {
      fontSize: 10, fontWeight: T.bold, color: "rgba(255,255,255,0.8)",
      letterSpacing: 0.8, textTransform: "uppercase",
    },

    // Empty / no match
    empty: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingTop: 120, paddingHorizontal: S.xl, gap: S.sm,
    },
    emptyTitle: {
      fontSize: T.xl, fontFamily: F.black, fontWeight: T.black,
      color: C.textPrimary, letterSpacing: -0.5, textTransform: "uppercase",
    },
    emptyText: { fontSize: T.base, color: C.textTertiary, textAlign: "center", lineHeight: 24 },
    noMatch: { alignItems: "center", paddingTop: 40 },
    noMatchText: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },
  });
}
