import { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { T } from "@/constants/theme";

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch {}

interface Props {
  coords: [number, number]; // [lng, lat]
  height?: number;
  accentColor: string;
  isDark: boolean;
  /** Name shown on the pin */
  label?: string;
}

/** Frozen map snippet centred on one point. Renders nothing when Mapbox is unavailable. */
export function EventLocationMap({ coords, height = 140, accentColor, isDark, label }: Props) {
  const [ready, setReady] = useState(false);

  const shape = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: [
      { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: coords }, properties: {} },
    ],
  }), [coords[0], coords[1]]);

  if (!MapboxGL) return null;

  return (
    <View style={{ height, overflow: "hidden" }} pointerEvents="none">
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL="mapbox://styles/mapbox/standard"
        projection="mercator"
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        onDidFinishLoadingStyle={() => setReady(true)}
      >
        <MapboxGL.StyleImport
          id="basemap"
          existing
          config={{
            lightPreset: isDark ? "night" : "day",
            // Mapbox's own café and bar icons were louder than the stop itself
            showPointOfInterestLabels: false,
            showTransitLabels: false,
            showPlaceLabels: true,
            showRoadLabels: false,
            show3dObjects: false,
          } as any}
        />
        <MapboxGL.Camera centerCoordinate={coords} zoomLevel={15} animationDuration={0} padding={label ? { paddingTop: 40, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } : undefined} />
        {ready && (
          <MapboxGL.ShapeSource id="event-location" shape={shape}>
            <MapboxGL.CircleLayer
              id="event-location-glow"
              style={{ circleRadius: 16, circleColor: accentColor, circleOpacity: 0.18 }}
            />
            <MapboxGL.CircleLayer
              id="event-location-fill"
              style={{
                circleRadius: 8,
                circleColor: accentColor,
                circleStrokeWidth: 2.5,
                circleStrokeColor: isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.95)",
              }}
            />
          </MapboxGL.ShapeSource>
        )}
        {ready && label ? (
          <MapboxGL.MarkerView coordinate={coords} anchor={{ x: 0.5, y: 1.55 }} allowOverlap>
            <View style={[styles.label, { backgroundColor: isDark ? "rgba(24,24,28,0.88)" : "rgba(255,255,255,0.95)" }]}>
              <Text style={[styles.labelText, { color: isDark ? "#fff" : "#111" }]} numberOfLines={1}>{label}</Text>
            </View>
          </MapboxGL.MarkerView>
        ) : null}
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    maxWidth: 240, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  labelText: { fontSize: T.sm, fontWeight: T.semibold },
});
