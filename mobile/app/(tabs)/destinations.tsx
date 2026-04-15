import { View, Text, ScrollView, Image, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapboxGL from "@rnmapbox/maps";
import { LinearGradient } from "expo-linear-gradient";
import { MapPin, Globe } from "lucide-react-native";
import { useTrips } from "@/context/TripsContext";
import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { type ThemeColors, T, R, S } from "@/constants/theme";

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";

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

export default function DestinationsScreen() {
  const { C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { trips } = useTrips();

  const destinations = useMemo(() => {
    const map = new Map<string, {
      name: string; region: string; tripCount: number;
      image: string; eventCount: number; coords?: [number, number];
    }>();
    trips.forEach(trip => {
      const info = DESTINATION_MAP[trip.name];
      const name = trip.destination || trip.name;
      const region = info?.region || "International";
      if (!map.has(name)) {
        map.set(name, {
          name, region, tripCount: 0,
          image: trip.image, eventCount: 0,
          coords: DEST_COORDS[trip.name],
        });
      }
      const d = map.get(name)!;
      d.tripCount++;
      d.eventCount += trip.events.length;
    });
    return [...map.values()].sort((a, b) => b.eventCount - a.eventCount);
  }, [trips]);

  const regions = new Set(destinations.map(d => d.region)).size;

  const geojson: GeoJSON.FeatureCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: destinations
      .filter(d => d.coords)
      .map(d => ({
        type: "Feature" as const,
        properties: { name: d.name },
        geometry: { type: "Point" as const, coordinates: d.coords! },
      })),
  }), [destinations]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Map ── */}
        <View style={styles.mapWrap}>
          <MapboxGL.MapView
            style={StyleSheet.absoluteFillObject}
            styleURL={DARK_STYLE}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled={false}
          >
            <MapboxGL.Camera
              zoomLevel={1.2}
              centerCoordinate={[40, 22]}
              animationDuration={0}
            />

            <MapboxGL.ShapeSource id="dest-rings" shape={geojson}>
              <MapboxGL.CircleLayer
                id="rings"
                style={{
                  circleRadius: 14,
                  circleColor: "transparent",
                  circleStrokeWidth: 1.5,
                  circleStrokeColor: C.teal,
                  circleStrokeOpacity: 0.5,
                }}
              />
            </MapboxGL.ShapeSource>

            <MapboxGL.ShapeSource id="dest-dots" shape={geojson}>
              <MapboxGL.CircleLayer
                id="dots"
                style={{
                  circleRadius: 6,
                  circleColor: C.teal,
                  circleStrokeWidth: 2,
                  circleStrokeColor: "#ffffff",
                  circleOpacity: 1,
                }}
              />
            </MapboxGL.ShapeSource>
          </MapboxGL.MapView>

          <LinearGradient
            colors={["transparent", C.bg]}
            locations={[0.6, 1]}
            style={styles.mapFade}
          />
        </View>

        {/* ── Title ── */}
        <View style={styles.titleBlock}>
          <Text style={styles.pageTitle}>Your Destinations</Text>
          <Text style={styles.pageSummary}>
            {destinations.length} destinations across {regions} {regions === 1 ? "region" : "regions"}
          </Text>
        </View>

        {/* ── Cards ── */}
        {destinations.length === 0 ? (
          <View style={styles.empty}>
            <Globe size={48} color={C.border} strokeWidth={1} />
            <Text style={styles.emptyTitle}>No destinations yet</Text>
            <Text style={styles.emptyText}>Add trips to see your destinations here.</Text>
          </View>
        ) : (
          destinations.map(dest => (
            <View key={dest.name} style={styles.card}>
              <Image source={{ uri: dest.image }} style={StyleSheet.absoluteFillObject} />
              <LinearGradient
                colors={["#00000010", "#00000050", "#000000c0"]}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.cardContent}>
                <View style={styles.regionTag}>
                  <MapPin size={9} color={C.teal} strokeWidth={2} />
                  <Text style={styles.regionText}>{dest.region}</Text>
                </View>
                <Text style={styles.destName}>{dest.name}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.metaText}>
                    {dest.tripCount} {dest.tripCount === 1 ? "trip" : "trips"}
                  </Text>
                  <View style={styles.metaDot} />
                  <Text style={styles.metaText}>{dest.eventCount} events</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: C.bg },
    scroll: { paddingBottom: S.lg },

    mapWrap: { height: 300, width: "100%", overflow: "hidden" },
    mapFade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 100 },

    titleBlock:  { paddingHorizontal: S.md, paddingTop: S.xs, paddingBottom: S.sm },
    pageTitle:   { fontSize: 28, fontWeight: "900", color: C.textPrimary, letterSpacing: -0.5, marginBottom: 4 },
    pageSummary: { fontSize: T.sm, color: C.textTertiary, fontWeight: T.medium },

    card: {
      height: 190, marginHorizontal: S.md, borderRadius: R.xl,
      overflow: "hidden", marginBottom: S.sm, backgroundColor: C.card,
    },
    cardContent: { position: "absolute", bottom: 0, left: 0, right: 0, padding: S.md, paddingBottom: S.lg },
    regionTag:   { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 5 },
    regionText:  { fontSize: T.xs, fontWeight: "700", color: C.teal, letterSpacing: 1, textTransform: "uppercase" },
    destName:    { fontSize: 22, fontWeight: "900", color: "#fff", letterSpacing: -0.4, marginBottom: 5 },
    cardMeta:    { flexDirection: "row", alignItems: "center", gap: 6 },
    metaText:    { fontSize: T.xs + 1, color: "rgba(255,255,255,0.65)", fontWeight: "500" },
    metaDot:     { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.35)" },

    empty:      { alignItems: "center", padding: S.xl, gap: S.sm },
    emptyTitle: { fontSize: T.xl, fontWeight: "800", color: C.textPrimary },
    emptyText:  { fontSize: T.sm, color: C.textTertiary, textAlign: "center" },
  });
}
