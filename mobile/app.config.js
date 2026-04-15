module.exports = ({ config }) => ({
  ...config,
  plugins: [
    "expo-router",
    [
      "@rnmapbox/maps",
      { RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN ?? "" },
    ],
  ],
});
