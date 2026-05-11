import { useState, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import greatCircle from "@turf/great-circle";

let MapboxGL: any = null;
try {
  MapboxGL = require("@rnmapbox/maps").default;
} catch {}

interface Props {
  from: [number, number]; // [lng, lat]
  to: [number, number];   // [lng, lat]
  fromCode?: string;
  toCode?: string;
  height?: number;
  accentColor?: string;
  isDark?: boolean;
}

export function FlightRouteMap({
  from,
  to,
  fromCode,
  toCode,
  height = 320,
  accentColor = "#0bd2b5",
  isDark = true,
}: Props) {
  const [ready, setReady] = useState(false);
  const mapRef = useRef<any>(null);

  const onStyleLoaded = useCallback(() => {
    setReady(true);
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setSourceVisibility(false, "composite", "country-label");
      map.setSourceVisibility(false, "composite", "state-label");
      map.setSourceVisibility(false, "composite", "settlement-major-label");
      map.setSourceVisibility(false, "composite", "settlement-minor-label");
      map.setSourceVisibility(false, "composite", "settlement-subdivision-label");
      map.setSourceVisibility(false, "composite", "airport-label");
      map.setSourceVisibility(false, "composite", "poi-label");
      map.setSourceVisibility(false, "composite", "water-point-label");
      map.setSourceVisibility(false, "composite", "water-line-label");
      map.setSourceVisibility(false, "composite", "natural-point-label");
      map.setSourceVisibility(false, "composite", "natural-line-label");
      map.setSourceVisibility(false, "composite", "road-label");
      map.setSourceVisibility(false, "composite", "transit-label");
      map.setSourceVisibility(false, "composite", "continent-label");
    } catch {}
  }, []);

  if (!MapboxGL) return <View style={[styles.fallback, { height }]} />;

  const line = greatCircle(from, to, { npoints: 100 });

  // TODO: render plane along route when flight.state === "in-flight"
  //       use turf along() with progress fraction to position
  //       turf bearing() for icon rotation

  const bounds = {
    ne: [
      Math.max(from[0], to[0]) + 2,
      Math.max(from[1], to[1]) + 2,
    ] as [number, number],
    sw: [
      Math.min(from[0], to[0]) - 2,
      Math.min(from[1], to[1]) - 2,
    ] as [number, number],
    paddingLeft: 60,
    paddingRight: 60,
    paddingTop: 60,
    paddingBottom: 60,
  };

  const endpointFeatures = {
    type: "FeatureCollection" as const,
    features: [
      { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: from }, properties: { id: "dep", label: fromCode || "" } },
      { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: to }, properties: { id: "arr", label: toCode || "" } },
    ],
  };

  return (
    <View style={{ height, overflow: "hidden" }}>
      <MapboxGL.MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        styleURL={isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11"}
        projection="globe"
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        onDidFinishLoadingStyle={onStyleLoaded}
      >
        <MapboxGL.Camera
          bounds={bounds}
          animationDuration={0}
        />

        <MapboxGL.Atmosphere
          style={{
            color: isDark ? "rgb(20, 20, 25)" : "rgb(200, 210, 220)",
            highColor: isDark ? "rgb(10, 10, 11)" : "rgb(180, 196, 210)",
            horizonBlend: 0.15,
            spaceColor: isDark ? "rgb(10, 10, 11)" : "rgb(235, 240, 245)",
            starIntensity: 0,
          }}
        />

        {ready && (
          <>
            <MapboxGL.ShapeSource
              id="route-flight-line"
              shape={line}
            >
              <MapboxGL.LineLayer
                id="route-flight-line-layer"
                style={{
                  lineColor: accentColor,
                  lineWidth: 2,
                  lineOpacity: 0.8,
                  lineDasharray: [3, 3],
                }}
              />
            </MapboxGL.ShapeSource>

            <MapboxGL.ShapeSource
              id="route-flight-endpoints"
              shape={endpointFeatures}
            >
              <MapboxGL.CircleLayer
                id="route-endpoint-outer"
                style={{
                  circleRadius: 8,
                  circleColor: accentColor,
                  circleOpacity: 0.15,
                }}
              />
              <MapboxGL.CircleLayer
                id="route-endpoint-inner"
                style={{
                  circleRadius: 4,
                  circleColor: accentColor,
                  circleOpacity: 1,
                }}
              />
              {(fromCode || toCode) && (
                <MapboxGL.SymbolLayer
                  id="route-endpoint-labels"
                  style={{
                    textField: ["get", "label"],
                    textFont: ["DIN Pro Bold"],
                    textSize: 11,
                    textColor: isDark ? "#ffffff" : "#0d0f14",
                    textHaloColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)",
                    textHaloWidth: 1.5,
                    textOffset: [0, 1.8],
                    textAnchor: "top",
                    textAllowOverlap: true,
                    textLetterSpacing: 0.1,
                  }}
                />
              )}
            </MapboxGL.ShapeSource>
          </>
        )}
      </MapboxGL.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: "#0a0a0a",
  },
});
