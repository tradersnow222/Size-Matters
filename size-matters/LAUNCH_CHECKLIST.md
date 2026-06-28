# Size Matters — Launch Checklist (next EAS update)

Context: the live App Store build is still **v1.0** (never updated). This local code
(**v1.0.4 / build 13**) is the pending first EAS update. The audit fixes from 2026-06-28
are applied in code; the items below are the **account-level steps that require your
Apple / Google / Cloudflare / RevenueCat / domain logins** — they can't be done from the
codebase.

## 🔴 Must do before submitting

### 1. Stand up the legal pages (currently 404)
`https://sizematters.app/privacy` and `/terms` resolve to a parked Namecheap host and
return **404**. Apple requires a working Privacy Policy URL, and the subscription screen
now links Terms + Privacy (`src/lib/appConfig.ts` → `PRIVACY_URL` / `TERMS_URL`).
- Publish real Privacy Policy + Terms pages at those exact URLs (or change the two
  constants in `appConfig.ts` to wherever you host them).
- Set the same Privacy Policy URL in **App Store Connect → App Privacy**.
- The App Privacy "nutrition label" must declare that **user photos are sent to Google**
  (Gemini) for processing (User Content → Photos, used by a third party).

### 2. Deploy the proxy and pull the AI keys out of the binary
The billing-enabled Gemini key currently ships inside the app (`EXPO_PUBLIC_GEMINI_API_KEY`,
extractable). The Cloudflare Worker in `/proxy` fixes this; the client already prefers it
when `EXPO_PUBLIC_PROXY_URL` is set (`src/lib/fishEditor.ts`).
```
cd ../proxy            # repo-root /proxy
npm i
npx wrangler login
npx wrangler secret put GEMINI_API_KEY        # paste the real key
npx wrangler secret put APP_SHARED_SECRET     # any long random string
# Bind a KV namespace named RATE_LIMIT in wrangler.toml, then:
npx wrangler deploy
```
Then in EAS (production + preview):
```
eas env:create --name EXPO_PUBLIC_PROXY_URL    --value https://<your-worker>.workers.dev --visibility plaintext
eas env:create --name EXPO_PUBLIC_PROXY_SECRET --value <same APP_SHARED_SECRET>          --visibility sensitive
# and DELETE EXPO_PUBLIC_GEMINI_API_KEY / EXPO_PUBLIC_FLUX_API_KEY from the EAS client env
```

### 3. Catalog is Annual + Single Unlock (weekly removed from the app ✅)
Confirmed catalog: `$rc_annual` → `sizematters_annual` ($29.99/yr) and
`$rc_custom_single_unlock` → `sizematters_single_unlock` ($0.99). Weekly was removed from
sale in App Store Connect, so the weekly card was **stripped from the paywall + Premium
tab** in code. Remaining cleanup (your side):
- Remove the **"Weekly Pro at $2.99/week"** line from the live App Store description.
- Optionally delete the now-empty `$rc_weekly` package in RevenueCat (harmless if left).
- Confirm the **"default" offering is set as Current** in RevenueCat (the app reads
  `offerings.current`; if nothing is marked Current the paywall has no plans).

### 4. Bump the build number
`app.json` → `ios.buildNumber` must be **> 13** for the next EAS build/submit.

## ✅ Smoke-test before promoting from TestFlight
- Buy the **weekly** sub from the paywall → watermark actually disappears (this was the
  `'pro'` vs `'premium'` bug — now fixed, but confirm end-to-end with a sandbox account).
- Buy the **single $0.99 unlock** → that one photo exports clean.
- **Restore Purchases** on a fresh install → premium returns.
- Tap **"Make It Happen" at 1× with no size chosen** → it now jumps to 2× and resizes
  (no more dead/greyed button).
- New user gets **1 free resize** (per your choice) — update the App Store description to
  say "1 free resize" (it currently says "Try 3 free resizes").
- Save a catch, force-quit, reopen → it's still in **My Catches** (document-dir persistence).
  Old pre-update photos may show a "Photo unavailable" tile — expected for cache-dir URIs.
- Turn off Wi-Fi mid-resize → error says **"Connection problem"**, not "bad photo".
- After a successful share/save → the **native rating sheet** appears (not a web redirect).
- Delete a catch → a **confirmation** dialog appears first.

## Notes
- `console.*` is now stripped from production bundles (babel), kept in dev.
- AI model IDs (`gemini-3.1-flash-image`, `gemini-2.5-flash`) were verified live against
  the Gemini API on 2026-06-28.
