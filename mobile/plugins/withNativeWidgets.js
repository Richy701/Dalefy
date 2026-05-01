const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withNativeWidgets(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        "ExpoWidgetsTarget"
      );
      const sourceDir = path.join(projectRoot, "native-widgets");

      const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith(".swift"));
      for (const file of files) {
        fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
      }

      return config;
    },
  ]);
};
