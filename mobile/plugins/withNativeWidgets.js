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
    // Asset catalogs are compiled into the extension, with no network dependency.
    const catalog = path.join(targetDir, "Airlines.xcassets");
    fs.mkdirSync(catalog, { recursive: true });
    fs.writeFileSync(path.join(catalog, "Contents.json"), JSON.stringify({ info: { version: 1, author: "xcode" } }));
    const logos = path.join(projectRoot, "assets/airlines");
    for (const file of fs.readdirSync(logos).filter(f => /^[A-Z0-9]{2}\.png$/.test(f))) {
      const set = path.join(catalog, `airline-${path.basename(file, ".png")}.imageset`);
      fs.mkdirSync(set, { recursive: true });
      fs.copyFileSync(path.join(logos, file), path.join(set, file));
      fs.writeFileSync(path.join(set, "Contents.json"), JSON.stringify({
        images: [{ filename: file, idiom: "universal" }], info: { version: 1, author: "xcode" },
      }));
    }
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

    if (target && !project.hasFile("ExpoWidgetsTarget/Airlines.xcassets")) {
      project.addResourceFile("ExpoWidgetsTarget/Airlines.xcassets", { target: targetUuid });
    }

    return config;
  });
};
