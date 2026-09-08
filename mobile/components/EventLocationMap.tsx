import { useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch {}

interface Props {
  coords: [number, number]; // [lng, lat]
  height?: number;
  accentColor: string;
  isDark: boolean;
}

/** Frozen map snippet centred on one point. Renders nothing when Mapbox is unavailable. */
export function EventLocationMap({ coords, height = 140, accentColor, isDark }: Props) {
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
        key={isDark ? "dark" : "light"}
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
            showPointOfInterestLabels: true,
            showTransitLabels: false,
            showPlaceLabels: true,
            showRoadLabels: false,
            show3dObjects: false,
          } as any}
        />
        <MapboxGL.Camera centerCoordinate={coords} zoomLevel={15} animationDuration={0} />
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
      </MapboxGL.MapView>
    </View>
  );
}
