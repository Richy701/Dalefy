module.exports = ({ config }) => ({
  ...config,
  plugins: [
    "expo-router",
    "expo-font",
    "expo-image",
    "expo-sharing",
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
            supportedFamilies: ["systemSmall", "systemMedium"],
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
    [
      "@rnmapbox/maps",
      { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? "" },
    ],
    "expo-web-browser",
    "expo-updates",
  ],
});
