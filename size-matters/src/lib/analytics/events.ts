/**
 * Analytics event catalog — the single source of truth for every event Size Matters
 * sends to Mixpanel. This file IS the tracking plan, in code: adding or changing an event
 * here is a typed, reviewable diff, and `track()` (in ./index.ts) only accepts a name +
 * props that appear in this map, so a typo or a wrong property is a compile error.
 *
 * Conventions (see docs/ANALYTICS_MIXPANEL_REFERENCE.md §2):
 *   • Event names  — Title Case "Object Action"  → "Resize Completed", "Paywall Viewed"
 *   • Property keys — snake_case                  → free_resizes_remaining, has_watermark
 *   • Never bake a value into the name. Model the action as the event and push the
 *     variation into a property: ONE "Resize Completed" with a `factor`, not "Resize 2x".
 *   • Keep the same property keys across every step of a funnel (e.g. `placement`,
 *     `plan_id`) so a single breakdown segments the whole funnel.
 */

/** Events that carry no properties. Keeps the `track()` props argument optional for them. */
export type EmptyProps = Record<string, never>;

export interface EventMap {
  // ── Acquisition / lifecycle ───────────────────────────────────────────────
  /** First launch ever on this install. Fired once, guarded by AsyncStorage. */
  'App Installed': EmptyProps;
  /** Every foreground entry. `source` distinguishes a cold start from a resume. */
  'App Opened': { is_first_open: boolean; source: 'cold' | 'foreground' };
  /** App sent to background — also the moment we flush the queue. */
  'App Backgrounded': EmptyProps;

  // ── Activation · onboarding funnel ────────────────────────────────────────
  'Onboarding Started': { onboarding_version: string };
  /** One event per step, step in a property — funnel-friendly (build the funnel later). */
  'Onboarding Step Viewed': { step_index: number; step_name: string; onboarding_version: string };
  'Onboarding Completed': { onboarding_version: string };

  // ── Activation · core resize flow (the "aha" funnel) ──────────────────────
  /** Funnel step 1. The user selected a catch photo. */
  'Photo Picked': { source: 'library' | 'camera' };
  'Detection Started': { provider: string };
  /** Funnel step 2. The fish-detection result (the pipeline fails open, so this fires
   *  even on a low-confidence pass-through). */
  'Detection Completed': { has_fish: boolean; confidence: string; species?: string; provider: string };
  /** Detection threw (rare — the service normally fails open). */
  'Detection Failed': { error_type: string; provider: string };
  /** The "No Fish Detected" overlay was shown. */
  'No Fish Prompt Shown': { confidence: string };
  'No Fish Prompt Result': { action: 'try_another' | 'use_anyway' };
  /** The size slider / preset buttons were touched. `factor` = 0.5 / 0.75 / 1 / 2 / 3. */
  'Resize Adjusted': { factor: number; method: 'slider' | 'preset' };
  /** Funnel step 3. Resize requested. Wrapped with `timeEvent('Resize Completed')`. */
  'Resize Started': {
    factor: number;
    species?: string;
    provider: string;
    model_id: string;
    is_subscriber: boolean;
    free_resizes_remaining: number;
  };
  /** Funnel step 4 / the core value event (aha candidate). `duration_sec` is the true
   *  engine latency (measured from request to result, excluding the UI's minimum-overlay
   *  hold), and `edit_number` is the user's lifetime resize count for this one. */
  'Resize Completed': {
    factor: number;
    species?: string;
    provider: string;
    model_id: string;
    is_subscriber: boolean;
    edit_number: number;
    duration_sec?: number;
  };
  /** `error_type` mirrors the app's hardened failure buckets. */
  'Resize Failed': { error_type: string; provider: string; model_id: string; factor: number };
  /** Result of the OS photo-library (add-only) permission prompt, shown at save time. */
  'Photo Permission Result': { granted: boolean; status: string };
  /** Kept the result to the camera roll — realized value. */
  'Photo Saved': {
    factor: number;
    species?: string;
    has_watermark: boolean;
    destination: string;
    source: 'home' | 'gallery';
  };
  /** Shared the result — realized value AND the referral surface (watermark = passive ad). */
  'Photo Shared': { has_watermark: boolean; source: 'home' | 'gallery'; factor?: number; species?: string };

  // ── Retention / engagement ────────────────────────────────────────────────
  'Gallery Viewed': { saved_count: number };
  'Gallery Item Opened': { species?: string };
  'Gallery Item Deleted': EmptyProps;
  'Gallery Item Set As Profile': EmptyProps;
  'Profile Viewed': { lifetime_resizes: number; lifetime_shares: number };
  /** The post-win review prompt was shown (gated on ≥1 edit, 7-day cooldown). */
  'Rate Prompt Shown': { trigger: string };
  'Rate Prompt Result': { action: 'native_review' | 'feedback' | 'dismissed' };
  /** Delete-intent feedback (the 3D-touch quick action) was submitted. */
  'Feedback Submitted': { reason?: string; has_detail: boolean };
  'Achievement Unlocked': { achievement_id: string };
  'App Data Reset': EmptyProps;

  // ── Revenue · paywall + subscription ──────────────────────────────────────
  /** Funnel step 1. `placement` = after_free_resize / premium_tab / watermark_removal_home /
   *  watermark_removal_gallery. */
  'Paywall Viewed': { placement: string; free_resizes_remaining: number };
  'Paywall Dismissed': { placement: string };
  /** Funnel step 2. */
  'Plan Selected': { plan_id: string; placement: string; price?: number; currency?: string };
  /** Funnel step 3 — fires when purchasePackage() is invoked. */
  'Purchase Started': { plan_id: string; placement: string; price?: number; currency?: string };
  /** Funnel step 4 — in-session signal ONLY (no client trackCharge; RevenueCat's
   *  server-side integration owns the revenue dollars, to avoid double-counting). */
  'Purchase Completed': { plan_id: string; placement: string; is_trial: boolean; price?: number; currency?: string };
  'Purchase Failed': { reason: string; user_cancelled: boolean; placement: string; plan_id?: string };
  'Purchase Restored': { found_subscription: boolean; placement: string };
  /** Entitlement state resolved/changed — drives the `is_subscriber` super property. */
  'Entitlement Changed': { entitlement: string; source: string };

  // ── Cross-cutting · quality (HEART "Task success") ────────────────────────
  'Error Shown': { error_type: string; screen: string };
}

export type EventName = keyof EventMap;
