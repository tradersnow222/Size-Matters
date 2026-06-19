/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");

module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.tsx", "./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  corePlugins: {
    space: false,
  },
  theme: {
    // Apple HIG compliant design tokens
    extend: {
      // Brand colors with high contrast
      colors: {
        brand: {
          primary: "#00D4FF",
          secondary: "#0891B2",
          muted: "#155E75",
        },
        surface: {
          primary: "#0B1623",
          secondary: "#0F1E30",
          tertiary: "#142536",
        },
      },
      // Apple HIG Typography Scale
      // Minimum 11pt, clear hierarchy for readability
      fontSize: {
        // Caption 2 - smallest (use sparingly)
        "caption-2": ["11px", { lineHeight: "13px", letterSpacing: "0.07px" }],
        // Caption 1 - small labels
        "caption-1": ["12px", { lineHeight: "16px", letterSpacing: "0px" }],
        // Footnote - secondary info
        footnote: ["13px", { lineHeight: "18px", letterSpacing: "-0.08px" }],
        // Subheadline - supporting text
        subheadline: ["15px", { lineHeight: "20px", letterSpacing: "-0.24px" }],
        // Callout - slightly smaller body
        callout: ["16px", { lineHeight: "21px", letterSpacing: "-0.32px" }],
        // Body & Headline - default readable text (17pt is iOS standard)
        body: ["17px", { lineHeight: "22px", letterSpacing: "-0.41px" }],
        headline: ["17px", { lineHeight: "22px", letterSpacing: "-0.41px" }],
        // Title 3
        "title-3": ["18px", { lineHeight: "23px", letterSpacing: "0.34px" }],
        // Title 2
        "title-2": ["20px", { lineHeight: "25px", letterSpacing: "0.38px" }],
        // Title 1
        "title-1": ["22px", { lineHeight: "28px", letterSpacing: "0.35px" }],
        // Large Title
        "large-title": ["28px", { lineHeight: "34px", letterSpacing: "0.36px" }],
        // Display
        display: ["34px", { lineHeight: "41px", letterSpacing: "0.37px" }],
      },
      // Spacing based on 8pt grid
      spacing: {
        "4.5": "18px",
        "5.5": "22px",
        "6.5": "26px",
        "7": "28px",
        "9": "36px",
        "11": "44px", // Minimum touch target
        "12": "48px", // Comfortable touch target
        "14": "56px", // Large touch target
      },
    },
  },
  darkMode: "class",
  plugins: [
    plugin(({ matchUtilities, theme }) => {
      const spacing = theme("spacing");

      // space-{n}  ->  gap: {n}
      matchUtilities(
        { space: (value) => ({ gap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );

      // space-x-{n}  ->  column-gap: {n}
      matchUtilities(
        { "space-x": (value) => ({ columnGap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );

      // space-y-{n}  ->  row-gap: {n}
      matchUtilities(
        { "space-y": (value) => ({ rowGap: value }) },
        { values: spacing, type: ["length", "number", "percentage"] }
      );
    }),
  ],
};

