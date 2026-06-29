Refer to CLAUDE.md and follow instructions precisely.

## Analytics tracking plan (Mixpanel)

- **Canonical event catalog = the tracking plan:** `src/lib/analytics/events.ts` — every event
  and its typed properties. Add/change events THERE; the typed `track()` makes a wrong
  event/property a compile error. **Never** call `mixpanel-react-native` directly from a
  screen — always go through `src/lib/analytics/index.ts`.
- **Conventions:** Title Case "Object Action" event names (`Resize Completed`); snake_case
  property keys (`free_resizes_remaining`); never bake a value into an event name. Keep funnel
  keys (`placement`, `plan_id`) identical across steps.
- **Native module** → needs a fresh EAS build (not Expo Go; OTA won't load it). Config:
  `EXPO_PUBLIC_MIXPANEL_TOKEN` (no-op if unset), `EXPO_PUBLIC_MIXPANEL_HOST` (EU/India; empty=US).
- **Identity:** no app login → keep Mixpanel's anonymous id, never `identify()`/`alias()`;
  revenue unifies via RevenueCat's `$mixpanelDistinctId`. Revenue dollars are owned by the
  RevenueCat→Mixpanel server integration; the client omits `trackCharge` (no double-count).
- Full spec: `docs/ANALYTICS_MIXPANEL_REFERENCE.md`. Deeper notes in CLAUDE.md.