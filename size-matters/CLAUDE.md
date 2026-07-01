# Size Matters — Project Guide

A mobile app for anglers: upload a catch photo and AI resizes the fish (50%–300%) for bragging rights. Detect + resize with Google Gemini (detection: `gemini-2.5-flash`; resize: "Nano Banana" `gemini-3.1-flash-image`, with FLUX.1 Kontext Pro kept as a fallback behind `RESIZE_PROVIDER`), monetize with a watermark paywall via RevenueCat.

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
- **Detection:** Gemini `gemini-2.5-flash` (`GEMINI_TEXT_MODEL`) via `.../{model}:generateContent` with `responseMimeType: application/json` + a response schema, so output parses cleanly. Returns `{hasFish, confidence, species}`. The detected `species` anchors the resize prompt so the fish can't be swapped for another species. (Migrated off OpenAI gpt-5.4-mini on 2026-06-20 — one provider, one key.)
- **Resize (PRIMARY):** Google "Nano Banana" — `POST https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_IMAGE_MODEL}:generateContent`, returning an inline base64 image. Chosen over FLUX because instruction editors that *preserve* structure (FLUX Kontext) barely apply large size changes; Nano Banana actually resizes the fish. Exact factors aren't relied upon — the prompt anchors size to an in-frame reference (the angler's torso/forearm). Model id is the `GEMINI_IMAGE_MODEL` constant (`gemini-3.1-flash-image` GA default — more dramatic/believable than `gemini-2.5-flash-image`; `gemini-3-pro-image` for top quality). ⚠️ Gemini image models are **paid-tier only** — the key's Google project must have billing enabled (a free-tier key returns HTTP 429 `limit: 0`).
- **Anatomy guardrail (the "third hand" fix):** the resize prompt KEEPS the angler's existing hands (it must NOT re-pose arms or "bring in a second hand" — that license is what made Nano Banana hallucinate a third/phantom hand); the enlarged fish just extends past the existing grip. Because image models are stochastic, the prompt can only lower the rate — so every result is also **verified**: a cheap `gemini-2.5-flash` vision pass compares original vs. result, flags an extra/phantom hand or deformed limb, and the resize is **regenerated best-of-N** (`MAX_RESIZE_ATTEMPTS`, bounded by `RESIZE_RETRY_DEADLINE_MS`) so the user only ever sees a clean image. Kill switch: `VERIFY_RESIZE = false` at the top of `fishEditor.ts` (mirrored in `proxy/src/index.ts`). Verifier fails **open** — a verifier error never blocks a good resize.
- **Resize (FALLBACK):** FLUX.1 Kontext Pro (`POST https://api.bfl.ai/v1/flux-kontext-pro`, then poll). Kept live behind the `RESIZE_PROVIDER` flag at the top of `fishEditor.ts` — set it to `'flux'` for instant rollback.
- Keys: `EXPO_PUBLIC_GEMINI_API_KEY` (detection + primary resize), `EXPO_PUBLIC_FLUX_API_KEY` (fallback resize). OpenAI is no longer used.
- ⚠️ These are `EXPO_PUBLIC_*`, so they are bundled into the app binary and are extractable. **Phase 2.5 backend proxy is BUILT** (Cloudflare Worker in `/proxy`, repo root): set `EXPO_PUBLIC_PROXY_URL` (+ optional `EXPO_PUBLIC_PROXY_SECRET`) to route detection+resize through it — then the AI keys live only on the Worker and can be dropped from the client. Empty `EXPO_PUBLIC_PROXY_URL` = direct-to-Google (current default). See `proxy/README.md` to deploy. The Worker owns the resize prompt+model, so you can tune them without an app release.

## Payments (`src/lib/revenuecatClient.ts`)
- Entitlement: `premium`. Packages: `$rc_monthly`, `$rc_annual` (plus a single-photo unlock product).
- Keys: `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` (prod iOS), `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` (prod Android), `EXPO_PUBLIC_REVENUECAT_TEST_KEY` (dev). These are publishable RevenueCat SDK keys — safe to ship.
- Products/offerings are configured in the RevenueCat dashboard (developer's own account).

## Analytics (`src/lib/analytics`)
- **Mixpanel** product analytics via the official `mixpanel-react-native` SDK in native mode. Every event goes through the typed `track()` in `index.ts`; the catalog in `events.ts` IS the tracking plan in code — add/change events there, never call the SDK directly from a screen. Init + app-lifecycle (`App Opened`/`App Backgrounded` + flush) live in `src/app/_layout.tsx`.
- Key: `EXPO_PUBLIC_MIXPANEL_TOKEN` (write-only project token — safe to ship). Empty ⇒ analytics is a graceful no-op (same pattern as `revenuecatClient`). Optional `EXPO_PUBLIC_MIXPANEL_HOST` for EU/India residency (empty = US).
- **Native module** → needs an EAS dev/prod build; it will NOT run in Expo Go, and adding it requires a brand-new build (an OTA reload won't load native code). No Expo config plugin needed (autolinked in prebuild).
- **Identity:** the app has no login. We keep Mixpanel's anonymous device id (never call `identify`/`alias`) and hand it to RevenueCat via the reserved `$mixpanelDistinctId` attribute (`revenuecatClient.setMixpanelDistinctId`), so server-side revenue unifies onto the same person without touching RC's live anonymous IDs.
- **Revenue is owned server-side:** enable the RevenueCat → Mixpanel integration in the RC dashboard (captures renewals/refunds/trials even when the app is closed). The client fires `Purchase Completed` WITHOUT `trackCharge` to avoid double-counting. No ATT prompt is required (first-party analytics, no IDFA) — but declare an App Privacy "Product Interaction" entry in App Store Connect.
- Dev builds DO send (tagged `environment: development` super property so you can verify funnels on a dev client); filter that out for prod reports. Full research + event spec: `docs/ANALYTICS_MIXPANEL_REFERENCE.md`.

## Environment variables
Local dev: put them in `.env` (gitignored — see `.env.example`). Builds: set them as EAS environment variables. Required: the two AI keys (Gemini + FLUX fallback) + three RevenueCat keys above. Optional: `EXPO_PUBLIC_MIXPANEL_TOKEN` (+ `EXPO_PUBLIC_MIXPANEL_HOST` for EU/India) — analytics no-ops without it. (The unused Vibecode-injected keys — Anthropic / Grok / Google / ElevenLabs — have been removed.)

## Build & release (EAS — managed workflow, no `ios/` or `android/` folders)
- Install deps: `bun install`
- Dev server: `bun start`
- Builds & submissions go through EAS: `eas build` / `eas submit` (configured in `eas.json`).
- **Before the FIRST build, verify:**
  1. `ios.bundleIdentifier` is `com.vibecode.reelsize.o65mr2` — the **immutable** bundle ID of the live App Store listing (id `6757819997`) under your Apple account. Do NOT change it (bundle IDs can't be changed on an existing app); it must stay exactly this or updates won't reach the existing listing. The "vibecode" in the string is just the original auto-generated identifier — not a functional dependency.
  2. Real Gemini + Flux keys are present in the EAS environment (the local `.env` may carry placeholders). OpenAI is no longer used.
  3. Bump `ios.buildNumber` every build, and `version` for each new App Store version.

## Conventions
- TypeScript strict: annotate `useState<T[]>([])`; use optional chaining `?.` and `??`.
- Use `Pressable` (not `TouchableOpacity`); custom modals (not `Alert.alert`).
- Zustand: select primitive slices (`useStore(s => s.foo)`); don't run store methods inside selectors.
- SafeArea from `react-native-safe-area-context`. `CameraView`, `LinearGradient`, and `Animated` components don't accept `className` — use the `style` prop.
