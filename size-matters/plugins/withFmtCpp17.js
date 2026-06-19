const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Fixes the `fmt` "consteval is not a constant expression" build error that
 * appears when building React Native 0.79 (Expo SDK 53) with Xcode 26's Clang 21,
 * which Apple now requires (iOS 26 SDK). Compiles ONLY the `fmt` pod against the
 * C++17 standard — consteval doesn't exist pre-C++20, so the broken code path is
 * skipped and fmt falls back to runtime format-string validation.
 *
 * Refs: facebook/react-native#55601, expo/expo#44229, fmtlib/fmt#4740.
 * Remove once RN ships an fmt version compatible with Xcode 26.
 */
const FMT_FIX = [
  "    # [withFmtCpp17] Build fmt with C++17 to avoid the Xcode 26 consteval error",
  "    installer.pods_project.targets.each do |t|",
  "      if t.name == 'fmt'",
  "        t.build_configurations.each do |bc|",
  "          bc.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'",
  "        end",
  "      end",
  "    end",
].join("\n");

module.exports = function withFmtCpp17(config) {
  return withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes("[withFmtCpp17]")) {
        contents = contents.replace(
          /(post_install do \|installer\|\s*\n)/,
          `$1${FMT_FIX}\n`,
        );
        fs.writeFileSync(podfile, contents, "utf8");
      }
      return cfg;
    },
  ]);
};
