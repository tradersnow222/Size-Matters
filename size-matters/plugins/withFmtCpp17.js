const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Fix: fmt "consteval is not a constant expression" under Xcode 26 (Clang 21),
// which Apple now requires (iOS 26 SDK). RN 0.79's fmt uses consteval that Clang
// 21 rejects. We disable consteval for the fmt pod (compile it as C++17 AND define
// FMT_USE_CONSTEVAL=0). Injected AFTER react_native_post_install so RN's own
// post-install (which forces the C++ standard back to c++20) cannot override it.
// Refs: facebook/react-native#55601, expo/expo#44229, fmtlib/fmt#4740.
const FMT_FIX = [
  "",
  "    # [withFmtCpp17] Disable consteval for the fmt pod (Xcode 26 fix)",
  "    installer.pods_project.targets.each do |t|",
  "      next unless t.name == 'fmt'",
  "      t.build_configurations.each do |bc|",
  "        bc.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'",
  "        defs = bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']",
  "        defs = [defs] unless defs.is_a?(Array)",
  "        bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs + ['FMT_USE_CONSTEVAL=0']",
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
          /react_native_post_install\([^)]*\)/,
          (m) => `${m}\n${FMT_FIX}`,
        );
        fs.writeFileSync(podfile, contents, "utf8");
      }
      return cfg;
    },
  ]);
};
