module.exports = ({ config }) => ({
  ...config,
  plugins: [
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#131316",
      },
    ],
    "expo-status-bar",
    "expo-router",
    "expo-font",
    "expo-image",
    "expo-sharing",
    "expo-quick-actions",
    [
      "expo-widgets",
      {
        bundleIdentifier: "com.dafadventures.app.widgets",
        groupIdentifier: "group.com.dafadventures.app",
        widgets: [
          {
            name: "TripCountdown",
            displayName: "Trip Countdown",
            description: "Countdown to your next adventure",
            supportedFamilies: ["systemSmall", "systemMedium", "systemLarge", "accessoryCircular", "accessoryRectangular", "accessoryInline"],
          },
        ],
        liveActivities: [
          {
            name: "FlightTracker",
          },
          {
            name: "UpcomingEvent",
          },
        ],
      },
    ],
    "./plugins/withNativeWidgets",
    [
      "@rnmapbox/maps",
      { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? "" },
    ],
    "expo-web-browser",
    "expo-apple-authentication",
    "expo-updates",
  ],
});
