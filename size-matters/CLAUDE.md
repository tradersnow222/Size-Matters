# Size Matters — Project Guide

A mobile app for anglers: upload a catch photo and AI resizes the fish (50%–300%) for bragging rights. Detect with OpenAI vision, resize with FLUX.1 Kontext Pro, monetize with a watermark paywall via RevenueCat.

**Status: migrated off the Vibecode no-code platform.** Builds and App Store releases are now owned via EAS Build under the developer's own Apple account. Do NOT reintroduce any of: `@vibecodeapp/*` packages, `withVibecodeMetro`, `EXPO_PUBLIC_VIBECODE_*` env vars, or the Vibecode React Native patches.

## Stack
- Expo SDK 53, React Native 0.79.6, **bun** (not npm)
- Expo Router (file-based routes in `src/app/`)
- NativeWind + Tailwind v3 — use `cn()` from `src/lib/cn.ts` to merge classNames
- React Query (async/server state), Zustand (local state, persisted via AsyncStorage)
- react-native-reanimated v3, react-native-gesture-handler
- RevenueCat (`react-native-purchases`) for payments

## Structure
- `src/app/` — routes. `_layout.tsx` is root; `(tabs)/` holds the 4 main tabs (index / gallery / premium / profile); `feedback.tsx` is the delete-intent quick-action modal.
- `src/components/` — UI (OnboardingSplash, PaywallModal, ShareableImage, WatermarkOverlay, FeedbackModal, FishTapGame, …)
- `src/lib/` — `fishEditor.ts` (AI detect + resize), `revenuecatClient.ts` (payments wrapper), `store.ts` (Zustand), `appConfig.ts` (support email, App Store ID), `watermark.ts`, `taglines.ts`, `design.ts` (design tokens).

## AI integration (`src/lib/fishEditor.ts`)
- **Detection:** `POST https://api.openai.com/v1/responses`, model `gpt-5.4-mini`. Returns `{hasFish, confidence, species}`. The detected `species` anchors the resize prompt so the fish can't be swapped for another species.
- **Resize:** `POST https://api.bfl.ai/v1/flux-kontext-pro` (FLUX.1 Kontext Pro), then poll for the result and download it.
- Keys: `EXPO_PUBLIC_OPENAI_API_KEY`, `EXPO_PUBLIC_FLUX_API_KEY`.
- ⚠️ These are `EXPO_PUBLIC_*`, so they are bundled into the app binary and are extractable. Planned (Phase 2.5): move both calls behind a backend proxy and drop these keys from the client.

## Payments (`src/lib/revenuecatClient.ts`)
- Entitlement: `premium`. Packages: `$rc_monthly`, `$rc_annual` (plus a single-photo unlock product).
- Keys: `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` (prod iOS), `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` (prod Android), `EXPO_PUBLIC_REVENUECAT_TEST_KEY` (dev). These are publishable RevenueCat SDK keys — safe to ship.
- Products/offerings are configured in the RevenueCat dashboard (developer's own account).

## Environment variables
Local dev: put them in `.env` (gitignored — see `.env.example`). Builds: set them as EAS environment variables. Required: the two AI keys + three RevenueCat keys above. (The unused Vibecode-injected keys — Anthropic / Grok / Google / ElevenLabs — have been removed.)

## Build & release (EAS — managed workflow, no `ios/` or `android/` folders)
- Install deps: `bun install`
- Dev server: `bun start`
- Builds & submissions go through EAS: `eas build` / `eas submit` (configured in `eas.json`).
- **Before the FIRST build, verify:**
  1. `ios.bundleIdentifier` is `com.vibecode.reelsize.o65mr2` — the **immutable** bundle ID of the live App Store listing (id `6757819997`) under your Apple account. Do NOT change it (bundle IDs can't be changed on an existing app); it must stay exactly this or updates won't reach the existing listing. The "vibecode" in the string is just the original auto-generated identifier — not a functional dependency.
  2. Real OpenAI + Flux keys are present in the EAS environment (the local `.env` may carry placeholders).
  3. Bump `ios.buildNumber` every build, and `version` for each new App Store version.

## Conventions
- TypeScript strict: annotate `useState<T[]>([])`; use optional chaining `?.` and `??`.
- Use `Pressable` (not `TouchableOpacity`); custom modals (not `Alert.alert`).
- Zustand: select primitive slices (`useStore(s => s.foo)`); don't run store methods inside selectors.
- SafeArea from `react-native-safe-area-context`. `CameraView`, `LinearGradient`, and `Animated` components don't accept `className` — use the `style` prop.
