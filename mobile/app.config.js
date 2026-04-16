module.exports = ({ config }) => ({
  ...config,
  plugins: [
    "expo-router",
    [
      "@rnmapbox/maps",
      { RNMapboxMapsDownloadToken: process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ?? "" },
    ],
  ],
});
