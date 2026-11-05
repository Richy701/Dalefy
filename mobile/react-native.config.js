// Google's native sign-in is Android only: iOS keeps its browser sign-in, so this never reaches an iOS build
module.exports = {
  dependencies: {
    "@react-native-google-signin/google-signin": { platforms: { ios: null } },
  },
};
