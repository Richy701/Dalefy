const { withXcodeProject } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withNativeWidgets(config) {
  return withXcodeProject(config, async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const targetDir = path.join(
      config.modRequest.platformProjectRoot,
      "ExpoWidgetsTarget"
    );
    const sourceDir = path.join(projectRoot, "native-widgets");

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = fs
      .readdirSync(sourceDir)
      .filter((f) => f.endsWith(".swift") || f.endsWith(".xcprivacy"));
    for (const file of files) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
    }

    // Bundle the extension's privacy manifest as a resource of the widget target.
    const project = config.modResults;
    const targetUuid = project.findTargetKey("ExpoWidgetsTarget");
    const target = targetUuid ? project.pbxNativeTargetSection()[targetUuid] : null;
    const resourcesSection = project.hash.project.objects["PBXResourcesBuildPhase"] || {};
    const hasResources = (target?.buildPhases || []).some((p) => resourcesSection[p.value]);
    if (target && !hasResources && files.includes("PrivacyInfo.xcprivacy")) {
      project.addBuildPhase(
        ["ExpoWidgetsTarget/PrivacyInfo.xcprivacy"],
        "PBXResourcesBuildPhase",
        "Resources",
        targetUuid,
        "app_extension",
        '""'
      );
    }

    return config;
  });
};
