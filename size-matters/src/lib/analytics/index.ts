/**
 * Analytics service — the ONLY way Size Matters emits product events.
 *
 * Everything funnels through the typed `track()` below (backed by the catalog in
 * ./events.ts), so events are never scattered as raw `mixpanel.track('...')` calls —
 * which is how a tracking plan rots. The typed catalog turns a misspelled event or a
 * wrong property into a compile error.
 *
 * Design (see docs/ANALYTICS_MIXPANEL_REFERENCE.md §7):
 *  • Graceful no-op. With no EXPO_PUBLIC_MIXPANEL_TOKEN the whole module is inert — the
 *    app behaves identically, nothing crashes, nothing is sent. (Same pattern as
 *    revenuecatClient.ts.)
 *  • Official `mixpanel-react-native` in NATIVE mode (auto device props, offline queue,
 *    auto-flush on background). Requires an EAS dev/prod build — it will NOT run in Expo Go.
 *  • Identity: this app has NO login. We let Mixpanel keep its anonymous device id and
 *    never call identify()/alias(). Revenue is unified by handing that distinct_id to
 *    RevenueCat ($mixpanelDistinctId) — see revenuecatClient.setMixpanelDistinctId().
 *  • Revenue dollars are owned by RevenueCat's server-side Mixpanel integration, NOT a
 *    client trackCharge() — so we never double-count (hence no trackCharge here).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mixpanel } from 'mixpanel-react-native';
import { useAppStore } from '@/lib/store';
import type { EmptyProps, EventMap, EventName } from './events';

export type { EventMap, EventName } from './events';

// A Mixpanel PROJECT TOKEN is a write-only ingestion key — safe to bundle into the
// client (unlike a secret API key), matching the existing EXPO_PUBLIC_* convention.
const TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;

// Data residency. Unset = US (https://api.mixpanel.com, the default). For an EU project
// set EXPO_PUBLIC_MIXPANEL_HOST=https://api-eu.mixpanel.com (India: api-in.mixpanel.com).
// Must match the region the Mixpanel project was created in or data silently won't land.
const SERVER_URL = process.env.EXPO_PUBLIC_MIXPANEL_HOST?.trim() || undefined;

// Inert until a token is present — local dev / unconfigured builds send nothing.
const ENABLED = !!TOKEN;

// One-shot guard so "App Installed" fires exactly once per install.
const FIRST_OPEN_KEY = 'sm_analytics_first_open_v1';

let mp: Mixpanel | null = null;
let initialized = false;

function devLog(...args: unknown[]) {
  // Stripped from production bundles by babel-plugin-transform-remove-console.
  if (__DEV__) console.log('[analytics]', ...args);
}

/** Initialize Mixpanel once. Safe to call unconditionally — no-ops without a token. */
export async function initAnalytics(): Promise<void> {
  if (!ENABLED || initialized) return;
  try {
    // Token goes in the CONSTRUCTOR (not init). trackAutomaticEvents=true follows
    // Mixpanel's setup skill — it adds automatic session + lifecycle events ($ae_session
    // with length, $ae_first_open, $ae_updated, $ae_crashed) ALONGSIDE our richer custom
    // App Opened / App Installed / App Backgrounded.
    // A const keeps the instance non-null across the await (a module-level `let` would
    // re-widen to `| null`); we publish it to `mp` only once init has succeeded.
    const instance = new Mixpanel(TOKEN!, true);
    // Stamp `environment` on EVERY event from the first one, so dev / TestFlight traffic
    // is trivially filtered out of production reports (we intentionally send in dev too,
    // so you can verify the funnel on a dev build).
    const baseSuper = { environment: __DEV__ ? 'development' : 'production' };
    await instance.init(false, baseSuper, SERVER_URL);
    // Native verbose logging in dev only (Mixpanel skill); prod stays quiet.
    instance.setLoggingEnabled(__DEV__);
    mp = instance;
    initialized = true;
    devLog('initialized', { residency: SERVER_URL ?? 'us (default)' });
    // Make every event segmentable by subscription state from the very first event.
    syncSubscriptionState();
  } catch (e) {
    devLog('init failed', e);
    mp = null;
  }
}

// ── Core tracking ────────────────────────────────────────────────────────────

// Props are required for events that have them, and optional for the empty ones.
type TrackArgs<N extends EventName> = EventMap[N] extends EmptyProps
  ? [props?: EventMap[N]]
  : [props: EventMap[N]];

/** The single, typed entry point for every event. */
export function track<N extends EventName>(name: N, ...args: TrackArgs<N>): void {
  const props = (args[0] ?? {}) as Record<string, unknown>;
  devLog(name, props);
  mp?.track(name, props);
}

/**
 * Start a duration timer for `name`; the matching `track(name, …)` injects `$duration`
 * (seconds). Call this immediately BEFORE kicking off the work being timed.
 */
export function timeEvent(name: EventName): void {
  mp?.timeEvent(name);
}

// ── Super properties (ride every event) & profile properties (current state) ──

export function registerSuper(props: Record<string, unknown>): void {
  mp?.registerSuperProperties(props);
}

export function setProfile(props: Record<string, unknown>): void {
  mp?.getPeople().set(props);
}

export function setProfileOnce(props: Record<string, unknown>): void {
  mp?.getPeople().setOnce(props);
}

export function incrementProfile(prop: string, by = 1): void {
  mp?.getPeople().increment(prop, by);
}

/**
 * Mirror the store's subscription state into Mixpanel: `is_subscriber`/`entitlement`/`plan`
 * as super properties (point-in-time, on every event) and `subscription_status`/`plan_tier`
 * as profile properties (current state, for cohorts). Call at startup and whenever the
 * entitlement changes (purchase / restore / launch re-sync).
 */
export function syncSubscriptionState(): void {
  if (!mp) return;
  const s = useAppStore.getState();
  const entitlement = s.isPremium ? 'premium' : 'none';
  registerSuper({
    is_subscriber: s.isPremium,
    entitlement,
    plan: s.isPremium ? 'annual' : 'none',
  });
  setProfile({
    subscription_status: s.isPremium ? 'active' : 'free',
    plan_tier: entitlement,
  });
}

// ── Identity / lifecycle helpers ──────────────────────────────────────────────

/** Mixpanel's anonymous distinct_id — handed to RevenueCat to unify revenue. */
export async function getDistinctId(): Promise<string | null> {
  if (!mp) return null;
  try {
    return await mp.getDistinctId();
  } catch {
    return null;
  }
}

/** Force-send the queue (native mode also auto-flushes on background). */
export function flush(): void {
  mp?.flush();
}

/** True exactly once per install (drives `App Installed` + `is_first_open`). */
export async function consumeFirstOpen(): Promise<boolean> {
  try {
    const seen = await AsyncStorage.getItem(FIRST_OPEN_KEY);
    if (seen) return false;
    await AsyncStorage.setItem(FIRST_OPEN_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** GDPR hooks for a future consent toggle (not wired to UI yet). */
export function optOutTracking(): void {
  mp?.optOutTracking();
}
export function optInTracking(): void {
  mp?.optInTracking();
}

/** Whether analytics is configured in this build (token present). */
export const analyticsEnabled = ENABLED;
