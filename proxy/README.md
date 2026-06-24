# Size Matters — backend proxy (Cloudflare Worker)

Holds the AI keys **server-side** so they are no longer shipped in the app binary, centralizes the
resize prompt + model (tune them without an app release), and adds a kill switch + rate limiting.

The app calls `POST /detect` and `POST /resize` here instead of calling Google directly. It's opt-in:
the app only uses the proxy when `EXPO_PUBLIC_PROXY_URL` is set, so you can deploy and roll out safely.

## Endpoints

- `POST /detect` — body `{ "imageBase64": "..." }` → `{ hasFish, confidence, species?, suggestion? }`
- `POST /resize` — body `{ "imageBase64": "...", "scale": 3, "species": "largemouth bass", "aspectRatio": "3:4" }`
  → `{ imageBase64, mimeType }`

## Deploy

```bash
cd "Apps/Size Matters/proxy"
npm install            # or: bun install
npx wrangler login

# Required secret (your billing-enabled Gemini key):
npx wrangler secret put GEMINI_API_KEY

# Optional gate — a value the app sends in the x-app-secret header (set the SAME value as
# EXPO_PUBLIC_PROXY_SECRET in the app). Raises the bar; App Attest is the real upgrade.
npx wrangler secret put APP_SHARED_SECRET

# Optional per-IP daily cap (recommended for a viral launch):
npx wrangler kv namespace create RATE_LIMIT
#   → paste the printed id into wrangler.toml under [[kv_namespaces]] and uncomment that block

npm run deploy         # prints your Worker URL, e.g. https://size-matters-proxy.<you>.workers.dev
```

## Wire the app to it

In the app's `.env` (and as EAS env vars for builds):

```
EXPO_PUBLIC_PROXY_URL=https://size-matters-proxy.<you>.workers.dev
EXPO_PUBLIC_PROXY_SECRET=<same value you set for APP_SHARED_SECRET, if you set one>
```

Once `EXPO_PUBLIC_PROXY_URL` is set, the app sends only the photo to the Worker — **the Gemini/Flux
keys are no longer needed in the client and can be removed** from `.env` / EAS and the binary.
Leave `EXPO_PUBLIC_PROXY_URL` empty to fall back to direct-to-Google (keys required client-side).

## Notes / next hardening

- The `x-app-secret` gate is obfuscation, not strong auth (the value still ships in the app). For a
  hard gate against a determined attacker, add **App Attest (iOS) / Play Integrity (Android)** via
  Firebase App Check and verify the token in `fetch()` before calling Gemini.
- `RATE_LIMIT` KV gives a simple per-IP daily cap (`DAILY_FREE_LIMIT`, default 50). For real abuse
  resistance, key the counter on a per-install id and/or enforce the RevenueCat `premium` entitlement
  server-side before spending on a paid edit.
- Tune resize quality by editing `generateResizePrompt()` / `RESIZE_MODEL` here and redeploying — no
  app release required.
