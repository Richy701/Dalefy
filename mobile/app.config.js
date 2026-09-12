module.exports = ({ config }) => ({
  ...config,
  plugins: [
    [
      "expo-secure-store",
      { faceIDPermission: "Dalefy can use Face ID to protect your saved sign-in on this device." },
    ],
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
    [
      "expo-image-picker",
      {
        photosPermission: "Dalefy uses your photo library so you can choose a profile picture and share trip photos with your travel group.",
        cameraPermission: "Dalefy uses your camera to take a profile picture and to scan trip QR codes.",
        microphonePermission: false,
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Dalefy uses your camera to take a profile picture and to scan trip QR codes.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    "expo-sharing",
    "expo-quick-actions",
    // Listed before expo-widgets on purpose: Expo runs same-type mods in reverse
    // plugin order, so this must come first to see the widget target expo-widgets creates.
    "./plugins/withNativeWidgets",
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
    [
      "@rnmapbox/maps",
      { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? "" },
    ],
    "expo-web-browser",
    "expo-apple-authentication",
    "expo-updates",
  ],
});
