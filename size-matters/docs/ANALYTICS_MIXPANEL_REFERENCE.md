# Mobile Analytics + Mixpanel Integration — Reference Document

> Scope: instrumenting **Size Matters** (Expo SDK 53 / RN 0.79, managed workflow, EAS dev client; RevenueCat subscriptions, entitlement `premium`; core flow **pick → detect → resize → export/share**) with comprehensive **Mixpanel** analytics. Current as of June 2026. Every load-bearing claim is cited inline. Claims are tagged **[DOC]** (confirmed from a vendor's own docs) or **[BP]** (synthesized best practice).

---

## Table of contents
1. [Industry-standard mobile analytics frameworks](#1-industry-standard-mobile-analytics-frameworks)
2. [Event taxonomy & naming best practices](#2-event-taxonomy--naming-best-practices)
3. [Mixpanel core concepts (API, identity, residency, GDPR/ATT)](#3-mixpanel-core-concepts)
4. [Mixpanel + Expo / React Native integration](#4-mixpanel--expo--react-native-integration)
5. [RevenueCat + Mixpanel](#5-revenuecat--mixpanel)
6. [Concrete recommended event list for Size Matters](#6-concrete-recommended-event-list-for-size-matters)
7. [Recommended analytics-service architecture (typed wrapper)](#7-recommended-analytics-service-architecture)

---

# 1. Industry-standard mobile analytics frameworks

## 1.1 AARRR / Pirate Metrics

Created by **Dave McClure** (500 Startups/500 Global), first presented **2007** in "Startup Metrics for Pirates." The five stages spell a pirate's growl. Motivation: stop chasing **vanity metrics**; focus the whole team on five numbers. ([Amplitude](https://amplitude.com/blog/pirate-metrics-framework); [Mixpanel](https://mixpanel.com/blog/aarrr-mixpanel-for-pirates/); [Inc.](https://www.inc.com/walter-chen/aarrr-dave-mcclure-s-pirate-metrics-and-the-only-five-numbers-that-matter.html)) **[DOC]**

| Stage | Measures | Example metrics |
|---|---|---|
| **Acquisition** | Entry points; which channels send *valuable* traffic | new installs, CAC, store conversion rate, CTR, CPI |
| **Activation** | How effectively a new user hits the **aha moment** | activation rate, time-to-activate |
| **Retention** | Whether users keep coming back (the "leaky bucket") | D1/D7/D30, churn, DAU/MAU, LTV |
| **Referral** | Viral / word-of-mouth growth | invites, shares, **K-factor** |
| **Revenue** | Engaged users converting to paying | MRR, ARPU, trial-to-paid, LTV |

**Ordering debate — AARRR vs RARRA.** When CAC is high, acquisition-first is the wrong priority — don't pour users into a leaky bucket. **RARRA** (Petit & Papp, ~2017) reorders the *same* five stages **Retention → Activation → Referral → Revenue → Acquisition**, putting retention first; built for mobile. ([Mind the Product](https://www.mindtheproduct.com/aarrr-vs-rarra-pirate-metrics-explained/)) Andrew Chen: retention is the engine of virality and the best single PMF signal. ([Andrew Chen — Retention is King](https://andrewchen.com/retention-is-king/); [more retention = more viral](https://andrewchen.com/more-retention-more-viral-growth/)) **[DOC]**

### AARRR mapped to Size Matters (photo app, core action = resize a fish)

- **Acquisition** — App Store impressions → product-page views → **installs** (organic search "fish/photo", ASA, TikTok/UGC). Judge channels by downstream *activation & retention*, not raw installs.
- **Activation — the aha moment = the first resized fish the user keeps.** For a photo editor the canonical activation event is **exporting/saving a finished image** ([Amplitude explicitly cites "exporting a finished image"](https://amplitude.com/blog/pirate-metrics-framework)). For Size Matters that is `Resize Completed` and especially `Photo Saved`/`Photo Shared`. Reaching it inside the **first session** materially lifts retention.
- **Retention** — new editing occasions: a new catch to enlarge, saved gallery, push ("got a new catch? make it bigger"). Photo editors are **episodic** (used when there's a photo), so weight **weekly/monthly active** and time-between-edits over raw daily retention. ([Andrew Chen — retention vs frequency by category](https://andrewchen.com/retention-versus-frequency-for-mobile-product-categories/))
- **Referral — the shared fish *is* the ad.** Loop: user resizes → shares to social (`Photo Shared`) → the export carries a **watermark / "Made with Size Matters" badge** (free tier; watermark already baked into exported pixels) → recipients see it → new install. **Referral and revenue are coupled** because removing the watermark is the paid hook.
- **Revenue** — paywall view → (trial, if added) → `Purchase Completed` (`$rc_annual` $29.99/yr or `$rc_custom_single_unlock` $0.99) → renewals. Free resizes = **1**, an aggressive funnel that pushes the paywall after the first aha.

**One-line model:** *impression → install → first kept resize (aha) → returns for the next catch → shares a watermarked fish that recruits a friend → hits the paywall after the 1 free resize → subscribes → revenue funds more acquisition.* Per RARRA, **nail Activation (first kept resize) and Retention before scaling paid UA.**

## 1.2 North Star Metric (NSM)

The single metric capturing the **core value delivered to customers**. Coined by **Sean Ellis**; explicitly **should not be revenue itself**. ([Mixpanel](https://mixpanel.com/blog/north-star-metric/)) Amplitude built the operational **North Star + Input Metrics** model: the NSM is the company-wide outcome; **3–5 input metrics** are the levers teams move daily that *produce* it. ([Amplitude — North Star + Inputs](https://amplitude.com/books/north-star/amplitudes-north-star-metric-and-inputs); [every product needs an NSM](https://amplitude.com/blog/product-north-star-metric)) Lenny: *"Your North Star Metric is your strategy."* ([Future/a16z](https://future.com/north-star-metrics/)) **[DOC]**

**Input-metric heuristic — Breadth / Depth / Frequency / Efficiency.** ([Amplitude](https://amplitude.com/blog/product-north-star-metric))

**Criteria for a good NSM** ([Amplitude — good vs bad](https://amplitude.com/blog/good-bad-north-star-metric); [Reforge](https://www.reforge.com/blog/north-star-metrics)): (1) represents realized **customer value** (tied to the aha), not company value; (2) is a **leading** indicator of revenue (revenue is lagging); (3) actionable by product/marketing; (4) simple, measurable, moves frequently. **Bad NSMs:** MRR/ARR, raw DAU, downloads, impressions, registered users (vanity/lagging). Reforge's decomposition: a good NSM has a **unit of value + a quality modifier + a frequency** (e.g. *weekly* *successful* *exports*).

**Famous NSMs** (Lenny's survey): Airbnb = nights booked; WhatsApp = messages sent; Spotify = time listening; Slack = paid teams. Pattern: **a count of the core value action over a time window**, not dollars. ([Future/a16z](https://future.com/north-star-metrics/))

### Recommended NSM for Size Matters: **Weekly Successful Resizes** (photos resized *and saved/shared* per 7-day window)
Reforge decomposition: unit = a resized fish; quality = "completed + kept (saved/shared)"; frequency = weekly. It expresses realized value (users only keep a resize they're happy with), leads renewal revenue, is actionable, simple, and moves weekly. Inputs:

| Dimension | Input metric | Team lever |
|---|---|---|
| Breadth | Weekly active resizers (≥1 kept resize) | activation, first-resize conversion |
| Depth | Resizes per active resizer | surfacing more value, premium |
| Frequency | Resize sessions per resizer / week | push, habit loops |
| Efficiency | Time-to-first-kept-resize | faster detect+resize, fewer failures |
| Quality | Resize-completion rate (started → saved) | reduce mid-flow drop-off, pipeline reliability |

## 1.3 HEART framework + aha moment

**HEART** (Google: Rodden, Hutchinson, Fu; **CHI 2010**) measures UX quality **at scale via behavioral data**. ([Google Research](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/); [Kerry Rodden](https://kerryrodden.com/heart/)) **[DOC]**

| Dimension | Definition | Example for Size Matters |
|---|---|---|
| **Happiness** | Attitudinal satisfaction (self-reported) | App Store rating, in-app CSAT, NPS |
| **Engagement** | Voluntary interaction depth/frequency | resizes/user/week, session length |
| **Adoption** | New users adopting product/feature | new installs, **free→premium upgrades** |
| **Retention** | Users returning / remaining active | N-day return, **subscription renewal rate** |
| **Task success** | Efficiently completing a task | **resize success rate**, time-to-resize, error rate |

**Goals → Signals → Metrics (GSM):** for each chosen HEART row, write a Goal (outcome), 2–3 Signals (observable behaviors), and time-bound Metrics (prefer ratios). HEART is **flexible — not every row applies.** For Size Matters the load-bearing rows are **Task success** (did the resize succeed?), **Adoption** (free→paid at the paywall), **Retention** (renewal/return), **Engagement** (resizes/period). ([The Fountain Institute — GSM](https://www.thefountaininstitute.com/blog/goals-signals-metrics)) **[DOC]**

**Aha moment / activation moment** — the point a new user **first experiences core value**. Sean Ellis: *"when the users really get the core value."* The **activation metric** = the early action most correlated with long-term retention; **activation rate** = % of new users who hit it. ([Amplitude — aha moment](https://amplitude.com/blog/aha-moment); [activation rate](https://amplitude.com/explore/digital-analytics/what-is-activation-rate)) Lenny's bar: activated users should retain **≥2×** non-activated. ([Lenny's](https://www.lennysnewsletter.com/p/how-to-determine-your-activation))

**How to find it:** brainstorm early actions → **correlate with retention via cohort analysis** to find the action+threshold+time-window where the retention curve inflects → **validate causally with A/B tests** (a good activation metric is *causal*, not just correlated) → avoid selection bias. ([Lenny's](https://www.lennysnewsletter.com/p/how-to-determine-your-activation); [Amplitude — time to value](https://amplitude.com/blog/time-to-value-drives-user-retention)) **[DOC]**

**Canonical examples (exact):**

| Company | Threshold | Source |
|---|---|---|
| Facebook | **7 friends in 10 days** | Chamath, via [Richard Price](https://richardprice.io/post/34652740246/growth-hacking-leading-indicators-of-engaged) |
| Slack | **2,000 messages sent** (team) → ~93% retain | [Amplitude](https://amplitude.com/blog/aha-moment) |
| Dropbox | **1 file in 1 folder on 1 device** | ChenLi Wang, via Richard Price |
| Twitter | **follow ~30 accounts** | Josh Elman, via [Mixpanel](https://mixpanel.com/blog/magic-numbers-are-an-illusion/) |
| **VSCO** (photo app) | editing **8 photos**, publishing **10**, collecting **16** | [Mixpanel](https://mixpanel.com/blog/magic-numbers-are-an-illusion/) |

**Caveat:** these "magic numbers" are **correlations, not proven causal levers** — Mixpanel: *"there really isn't anything inherently magical in a so-called magic number."* Treat any number you find as a **hypothesis to A/B test.** ([Mixpanel — magic numbers are an illusion](https://mixpanel.com/blog/magic-numbers-are-an-illusion/)) **For Size Matters, the activation hypothesis to test: "1 resize saved/shared in the first session."**

## 1.4 Standard lifecycle metrics — definitions, formulas, benchmarks

> Benchmark caveat: there is **no clean primary Photo & Video benchmark** for retention curves/sessions/ARPPU — **Utilities** is the standard proxy, with a huge spread (one-shot utilities retain far worse than recurring ones). Subscription benchmarks below are from **RevenueCat *State of Subscription Apps*** ([2024](https://www.revenuecat.com/state-of-subscription-apps-2024/) / [2025](https://www.revenuecat.com/state-of-subscription-apps-2025/) / [2026](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026/)), primary). Aggregators (UXCam, Adjust, Userpilot) are ranges.

| # | Metric | Definition / formula | Benchmark (year, source) |
|---|---|---|---|
| 1 | **Install / new install** | Counted on **first app open** after download (SDK fires on open, not store-tap). Store "units" count downloads and can differ. ([AppsFlyer](https://support.appsflyer.com/hc/en-us/articles/207447053-AppsFlyer-attribution-model)) | n/a (count) |
| 2 | **Activation rate** | `completed activation event ÷ new users × 100` | median ~**25%**, avg ~**34%** (2024, [Userpilot](https://userpilot.com/blog/user-activation-rate-benchmark-report-2024/)/[Lenny's](https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate)) |
| 3 | **Onboarding completion** | `finished onboarding ÷ started × 100` (≠ activation: flow finished vs value reached) | B2C w/ trial ~**30–50%** good (2024, Userpilot) |
| 4 | **Feature adoption** | `used feature ÷ active users × 100` ([Amplitude](https://amplitude.com/glossary/terms/adoption-rate)) | core ~**50%+**, secondary ~**20–40%** (convention) |
| 5 | **D1/D7/D30 retention** | `cohort active on day N ÷ cohort size day 0 × 100`; group by install day, weighted-avg across cohorts; "on-or-after" is Mixpanel default ([Mixpanel](https://docs.mixpanel.com/docs/reports/retention)) | all-cat medians ~**D1 25% / D7 8% / D30 4%** (2026, [UXCam](https://uxcam.com/blog/mobile-app-retention-benchmarks/)). **PMF gut-check: ≥7% D7 = top quartile** ([Amplitude 7% rule](https://amplitude.com/blog/7-percent-retention-rule)) |
| 6 | **Session count & length** | sessions/user; avg duration = total session time ÷ sessions (~30-min inactivity cut) | global avg session **18.6 min** (Q1'24, [Adjust](https://www.adjust.com/blog/app-sessions/)); **Utility ~1–3 min**. Sessions/user/day decay median **1.79 (D0) → 0.13 (D30)** |
| 7 | **Stickiness DAU/MAU** | `avg DAU ÷ MAU × 100` ([Sequoia](https://articles.sequoiacap.com/measuring-product-health)) | ~**20% good, 50%+ excellent** ([CleverTap](https://clevertap.com/blog/dau-vs-mau-app-stickiness-metrics/)). **Reality: an episodic paid photo tool will NOT hit 20% — weight weekly/monthly active instead** |
| 8 | **Churn (user vs revenue)** | user churn `lost subs ÷ subs at start`; gross revenue churn `churned MRR ÷ MRR start` (≥0); net revenue churn subtracts expansion (can go negative) ([Baremetrics](https://baremetrics.com/blog/gross-churn-vs-net-churn)) | monthly-plan Y1 retention ~**17%** (≈83% churn); **annual ~72% cancel within Y1** (2026 RevenueCat); 3-day trials: **55% cancel Day 0** |
| 9 | **Conversion-to-paid** | `new payers ÷ downloads × 100` (RevenueCat measures ~D35) | **hard paywall ~10–12% vs freemium ~2%** at D35 (2025–26 RevenueCat) — ~5× gap, **near-identical retention** |
| 10 | **Trial start & trial-to-paid** | start rate `trials ÷ installs`; conv `trials converted ÷ trials started` (~D35) | **82% of trial starts happen install-day**; long trials (17–32d) **~46%** vs short (<4d) **~26%** convert (RevenueCat 2025) |
| 11 | **LTV** | `ARPU ÷ churn` or `ARPU × lifespan` (lifespan = 1÷churn); margin-adjusted `(ARPU×margin)÷churn` ([Baremetrics](https://baremetrics.com/academy/saas-calculating-ltv)) | realized Y1 per payer: high-priced **~$55**, low-priced **~$8** (2025). **AI apps sustain ~41% LTV premium** but retain ~36% worse on monthly (2026) — relevant to an AI photo app |
| 12 | **ARPU / ARPPU** | ARPU = revenue ÷ all users; ARPPU = revenue ÷ paying users (ARPPU ≥ ARPU) | revenue/install **D60 ~$0.38 App Store vs $0.14 Play** (2025); **hard paywall RPI ~$3.09 vs freemium $0.38** (2026) |

---

# 2. Event taxonomy & naming best practices

## 2.1 Object-Action naming framework
Dominant cross-vendor convention: **Object + past-tense Action verb** — `Photo Exported`, `Paywall Viewed`, `Resize Completed`. ([Segment/Twilio](https://www.twilio.com/en-us/resource-center/naming-conventions-for-clean-data); [Amplitude](https://amplitude.com/blog/event-data-components); [Mixpanel — "(Object) (Verb)"](https://docs.mixpanel.com/docs/data-structure/events-and-properties); [Avo](https://www.avo.app/docs/data-design/best-practices/naming-conventions)) **[DOC]**

**Why consistency is the whole point:** platforms treat differently-cased strings as **different events**, silently splitting data. Segment: *"pick a single naming framework and stick with it… The only thing that really matters is that you keep it consistent."* **[DOC]**

## 2.2 Casing conventions
Vendors **disagree on which case** but **agree you must pick one**:

| Vendor | Events | Properties |
|---|---|---|
| Segment | Title Case | snake_case |
| Amplitude | Title Case | snake_case |
| **Mixpanel** | **snake_case** | **snake_case** ("more robust… especially if you export to a data warehouse") |

Both **Mixpanel and Amplitude are case-sensitive** — `sign_up_completed` ≠ `Sign_Up_Completed`. ([Mixpanel](https://docs.mixpanel.com/docs/data-structure/events-and-properties); [Amplitude](https://amplitude.com/docs/data/data-planning-playbook)) **[DOC]**

> **Recommendation for Size Matters:** since data goes to **Mixpanel**, the cleanest single convention is **Title Case `Object Action` events + snake_case properties** (most human-readable in Mixpanel's UI and the Segment/Amplitude standard) — OR all-snake_case if you value warehouse export. Either is fine; **the only unforgivable mistake is mixing them.** This doc uses **Title Case events + snake_case properties.**

## 2.3 Good EVENT vs good PROPERTY — never bake values into names
Model the **action** as the event; push every **detail/variation** into properties. **One** `Resize Completed` with `provider:'gemini'`, NOT `Resize Completed Gemini`. Mixpanel: don't make `Purchase (11-01-2019)` — make `Purchase` with a date *property*. Segment: dynamic event names mean *"you will never be able to make sense of your funnels [and] your bills … will get out of control."* ([Mixpanel](https://docs.mixpanel.com/docs/data-structure/events-and-properties); [Segment](https://www.twilio.com/en-us/resource-center/naming-conventions-for-clean-data)) **[DOC]**

Mental model (Mixpanel): *"events are like tables, properties are like columns"*; *"events tell you what happened, properties tell you how."*

## 2.4 Events vs Event Props vs Super Props vs User Profile Props (Mixpanel's model)
All four verbatim from Mixpanel docs ([events-and-properties](https://docs.mixpanel.com/docs/data-structure/events-and-properties); [properties](https://docs.mixpanel.com/docs/data-structure/property-reference/properties); [concepts](https://docs.mixpanel.com/docs/data-structure/concepts)) **[DOC]**:

| Type | Lives on | Lifetime | Set via | Size Matters examples |
|---|---|---|---|---|
| **Event** | one event | immutable, timestamped | `track('Resize Completed', {...})` | the action itself |
| **Event property** | a single event | point-in-time (value *when it fired*) | `track('X', { provider:'gemini' })` | `provider`, `factor`, `species`, `screen` |
| **Super property** | **every** event after registration | device-persisted until `reset()` | `registerSuperProperties({...})` | `app_version`, `is_subscriber`, `signup_source`, `experiment_variant` |
| **User/profile property** | the **user profile** (joined on distinct_id) | current state, overwritten | `getPeople().set({...})` | `$email`, `plan_tier`, `lifetime_resizes`, `signup_date` |
| **Reserved `$`** | events or profiles | — | mostly auto | event: `$insert_id`, `$os`; profile: `$email`, `$name` |

**The decisive distinction (Mixpanel):** an event/super property tells you whether a user was paid **at the moment of each action, over time**; a profile property tells you only their **current** state. → **point-in-time facts = event/super; current state = profile.** Amplitude & Avo corroborate (event prop = value at event time; user prop = latest value). **[DOC]**

## 2.5 How many events is right? Over-tracking & governance
**No magic number** — every vendor refuses one and prescribes a **top-down method**: KPIs → user actions that move them → those become events. Costs of over-tracking are named explicitly: Mixpanel — *"tracking everything… can lead to unnecessary development effort and unused data… Only track events that tie directly to KPIs."* A Mixpanel blog: *"50+ events are already too many."* Segment's **"value transfer" test:** track actions that transfer value to/from the user (handing over email; receiving an exported photo). Amplitude: *"start with a handful of key events… ignore everything else for the time being."* ([Mixpanel tracking plan](https://docs.mixpanel.com/docs/tracking-best-practices/tracking-plan); [Segment](https://segment.com/academy/collecting-data/how-to-create-a-tracking-plan/); [Amplitude](https://amplitude.com/blog/create-tracking-plan)) **[DOC]**

**Tracking plan = single source of truth** (a spreadsheet or JSON-in-Git). Canonical columns confirmed across ≥2 vendors — **use this spec format**:

> **Event name · Description · Trigger (when it fires) · Source (client/server) · Property name · Data type · Allowed values (enum/regex) · Required/optional · Owner · Status · Destinations · PII flag**

Governance = ownership + approval workflow + enforcement (Amplitude Govern, Mixpanel Lexicon/Data Standards, Segment Protocols, Avo). Document **PII flags** per event/property. ([Amplitude](https://amplitude.com/docs/data/data-planning-playbook); [Mixpanel Lexicon](https://docs.mixpanel.com/docs/data-governance/lexicon); [Avo plan](https://www.avo.app/docs/data-design/avo-tracking-plan/events)) **[DOC]**

## 2.6 Designing events for FUNNELS & drop-off
**Model each step of a flow as its own discrete event**, then build the funnel from them afterward — don't hard-code "step 1/2/3" calls. Mixpanel (July 2025): *"track a bunch of events and make funnels out of them later"* (also avoids duplicating code when an event is in multiple funnels). **[DOC]** ([Mixpanel — event-based funnels](https://mixpanel.com/blog/introducing-event-based-funnels/); [funnels quickstart](https://docs.mixpanel.com/docs/reports/funnels/funnels-quickstart))

**Use consistent property keys across every step** so one breakdown segments the whole funnel (e.g. `paywall_id`, `paywall_variant`, `placement`, `plan_id` on all paywall-funnel steps). Amplitude warns inconsistent keys (`Plan` vs `subscription_plan`) *"breaks dashboards and prevents segmentation."* Keep step-state in **event** properties, not user properties. Mixpanel applies a **2-second grace period** so near-simultaneous steps (e.g. `Purchase Started` → `Purchase Completed`) are interchangeable. **[DOC]**

**Size Matters paywall funnel** (one event per step, identical keys on all): `Paywall Viewed → Plan Selected → Purchase Started → Purchase Completed` (+ `Purchase Failed` branch).

---

# 3. Mixpanel core concepts

> **mixpanel-react-native** is a wrapper around Mixpanel's **native iOS/Android SDKs** (JS ~69%, Java ~16%, Swift ~10%, ObjC ~4%). Current v3.4.x line. ([GitHub](https://github.com/mixpanel/mixpanel-react-native)) **[DOC]**

## 3.1 Core API (exact RN method names)
From the [RN SDK docs](https://docs.mixpanel.com/docs/tracking-methods/sdks/react-native) + [JSDoc Mixpanel](https://mixpanel.github.io/mixpanel-react-native/Mixpanel.html) / [People](https://mixpanel.github.io/mixpanel-react-native/People.html). **[DOC]**

> **Important correction:** the token lives in the **constructor**, not `init()`. Modern API is constructor + instance init:
> `const mp = new Mixpanel(token, trackAutomaticEvents); await mp.init();`
> The static `Mixpanel.init(token, …)` and `alias()` are **deprecated.**

| Concept | RN method | Notes |
|---|---|---|
| Track | `mixpanel.track(eventName, properties?)` | properties optional |
| Identify | `mixpanel.identify(distinctId)` → Promise | ties anonymous → known |
| Alias (legacy) | `mixpanel.alias(alias, distinctId)` | **deprecated**; avoid under Simplified merge |
| Set people prop | `mixpanel.getPeople().set(prop, to)` / `.set({obj})` | profile property |
| Set-once | `mixpanel.getPeople().setOnce(prop, to)` | won't overwrite |
| Super props | `mixpanel.registerSuperProperties(props)` | on every event |
| Super props once | `mixpanel.registerSuperPropertiesOnce(props)` | only if unset |
| **Revenue** | `mixpanel.getPeople().trackCharge(amount, props?)` | **positive = purchase, negative = refund**; appends to `$transactions`; powers Revenue report |
| **Reset (logout)** | `mixpanel.reset()` | clears identity + super props, new anonymous `$device_id` |
| **Duration** | `mixpanel.timeEvent(eventName)` | call **before** the matching `track`; SDK injects `$duration` (seconds) |
| **Dedup** | `$insert_id` (property) | auto-set by SDK; set manually only via HTTP |
| Flush | `mixpanel.flush()` | force send |
| Distinct id | `mixpanel.getDistinctId()` → Promise | |

Other People methods: `increment`, `append`, `union`, `remove`, `unset`, `clearCharges`. **[DOC]**

`$insert_id` dedup rule: events with identical **(event, time, distinct_id, $insert_id)** are duplicates; only the latest survives. ([track-event ref](https://docs.mixpanel.com/reference/track-event)) **[DOC]**

## 3.2 Identity management — Simplified vs Original
([id-management](https://docs.mixpanel.com/docs/tracking-methods/id-management)) **[DOC]**

| | **Simplified** (default for orgs ≥ Apr 2024) | **Original** (legacy) |
|---|---|---|
| Mechanics | `$device_id` + `$user_id` props | `$identify`/`$merge`/`$create_alias` events |
| distinct_id | `$user_id` once known | auto-determined |
| Merge cap | unlimited devices → one user | **500 IDs** per cluster |
| `alias()` | **not needed** | mattered here |

**You cannot switch systems once a project has data.** New projects = Simplified. **[DOC]**

**Anonymous → known flow (Size Matters: anonymous users who later subscribe):**
1. **While anonymous, just `track()`** — the SDK already carries an anonymous `$device_id`.
2. **On signup/login, `mixpanel.identify(yourCanonicalUserId)`** — under Simplified this sets `$user_id` and **auto-merges** the pre-signup device history into the known user. Identity preserved.
3. **Do NOT use `alias()`** under Simplified (legacy/deprecated, unnecessary).
4. **On logout, `reset()`** so a shared device doesn't bleed one user's events into another.

→ **Rule: `identify()` = yes (on auth); `alias()` = no.** Use the **same canonical user id** you give RevenueCat (see §5).

## 3.3 Property taxonomy — what belongs where
See §2.4. Short version: **super property** = "context true of the user/session now, stamped on all events" (`is_subscriber`, `app_version`); **profile property** = "current-state of the person for cohorts/messaging" (`$email`, `plan_tier`); **event property** = "facts about this one action." Reserved `$` profile keys (`$email`, `$name`, `$phone`, `$avatar`, `$created`) unlock Mixpanel UI features — don't reuse `$` names for unrelated data. **[DOC]**

## 3.4 Data residency (US / EU / India)
([RN SDK docs](https://docs.mixpanel.com/docs/tracking-methods/sdks/react-native)) **[DOC]**

| Region | serverURL |
|---|---|
| US (default) | `https://api.mixpanel.com` |
| EU | `https://api-eu.mixpanel.com` |
| India | `https://api-in.mixpanel.com` |

Set via the instance init `init(optOutTrackingDefault, superProperties, serverURL, useGzipCompression)` → `await mp.init(false, {}, 'https://api-eu.mixpanel.com')`, or `mp.setServerURL(...)`. **Must match the region the project was created in** or data silently won't land. **[DOC]**

## 3.5 GDPR / opt-out + ATT (the important clarification)
**Opt-out methods:** `mixpanel.optOutTracking()` (stops & clears the queue), `mixpanel.optInTracking()`, and `optOutTrackingDefault` at init to **start opted-out** until consent (consent-gated apps: init opted-out → `optInTracking()` on consent). **[DOC]**

**ATT / IDFA — Mixpanel does NOT require the ATT prompt.** Mixpanel **does not use the IDFA**; it is **first-party product analytics**, which falls **outside** App Tracking Transparency's scope (ATT governs IDFA access + cross-app tracking for **advertising**). Mixpanel: *"user behavior data … collected by Mixpanel are not impacted by whether or not a user allows tracking via ATT."* ([Mixpanel — ATT impact](https://community.mixpanel.com/x/ask-ai/58rwywmk3ibr/impact-of-apples-app-tracking-transparency-on-mixp); [tips & tricks](https://docs.mixpanel.com/docs/quickstart/tips-and-tricks)) **[DOC]**

- ✅ You do **not** need the ATT prompt **for Mixpanel itself.**
- ⚠️ ATT/IDFA enters only if you also run **ad attribution** (an MMP, or IDFA-based Meta/TikTok install attribution) — a separate system from product analytics.
- ⚠️ You still owe an **App Privacy "nutrition label"** in App Store Connect for what Mixpanel collects (e.g. Product Interaction; Identifiers if you set `$email`) — that's **separate from ATT.** **[DOC/standard]**

---

# 4. Mixpanel + Expo / React Native integration

## 4.1 Native modules → requires EAS dev build, NOT Expo Go (confirmed)
`mixpanel-react-native` contains **native iOS/Android code** (Swift/Java/ObjC in the repo). Expo Go can only load its **fixed built-in** native modules, so any library with its own native code **requires a development build / custom dev client** via prebuild/EAS — **it will not run in Expo Go in native mode.** Your EAS dev-client setup is exactly right. ([GitHub](https://github.com/mixpanel/mixpanel-react-native); [Expo — custom native code](https://docs.expo.dev/workflow/customizing/)) **[DOC]**

There **is** a pure-JS fallback ("**JavaScript Mode**", `useNative=false`) that runs in Expo Go but is degraded (see §4.3).

## 4.2 Install + setup for Expo SDK 50+ on EAS

```bash
npx expo install mixpanel-react-native @react-native-async-storage/async-storage
```
- Since v3.2.0, AsyncStorage is a **peer dependency** (v1 or v2) — avoids conflicts on Expo 52+. **Expo SDK 53 ships AsyncStorage 2.x → compatible.** ([npm changelog](https://www.npmjs.com/package/mixpanel-react-native)) **[DOC]**
- **No Expo config plugin needed and none exists** (the request, [Issue #69](https://github.com/mixpanel/mixpanel-react-native/issues/69), is still open). It's a plain **autolinked** native module with no special Info.plist/Gradle entries. **[DOC]**
- Under Expo **Continuous Native Generation**, `npx expo prebuild` (run automatically inside EAS Build) autolinks it and **`pod install` runs as part of prebuild** — you do **NOT** add anything to `app.json` `plugins` and do **NOT** manually run `pod install` in a managed/CNG project. ([Expo — adopt prebuild](https://docs.expo.dev/guides/adopting-prebuild/)) **[DOC]**
- **Practical consequence:** after `npx expo install`, you must **rebuild the dev client** (`eas build --profile development`) — a new binary is required because you added native code; an OTA reload won't pick it up. **[DOC]**

**Init snippet (native mode):**
```js
// src/lib/analytics/mixpanel.ts
import { Mixpanel } from 'mixpanel-react-native';

const TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN!;
// trackAutomaticEvents=false is Mixpanel's recommended default (see §4.4)
export const mixpanel = new Mixpanel(TOKEN, false);

export async function initMixpanel() {
  await mixpanel.init();
  // EU residency: await mixpanel.init(false, {}, 'https://api-eu.mixpanel.com');
}
```
Call `initMixpanel()` once in your root `_layout` effect. **Add `EXPO_PUBLIC_MIXPANEL_TOKEN` to both `.env` and EAS env** (matches your existing `EXPO_PUBLIC_*` pattern; note these are bundled into the binary — a Mixpanel **project token** is write-only ingestion, safe to ship, unlike a secret API key).

## 4.3 Pure-JS / HTTP alternative & tradeoffs
Three flavors:

**(i) Official SDK JavaScript Mode** (`new Mixpanel(token, autoEvents, /*useNative*/ false)`) — runs **without native code → works in Expo Go**; queue persists via AsyncStorage. Caveats (Mixpanel docs): *legacy auto-events not supported, fewer default properties than native, **data does not auto-flush on background*** (you call `flush()` on `AppState` change), no session replay. **[DOC]**

**(ii) Roll-your-own HTTP** to `/track` + `/engage` (US `https://api.mixpanel.com`, EU `https://api-eu.mixpanel.com`, India `https://api-in.mixpanel.com`). Event shape: `{ event, properties: { token, distinct_id, time, $insert_id, ...props } }`; ≤2000 events/request, ≤1MB/event, ≤255 props; `/track` only accepts timestamps within **5 days** (older → `/import`). You own batching, retry, offline queue, dedup, flush. ([track-event ref](https://docs.mixpanel.com/reference/track-event)) **[DOC]**

**(iii) Community `@bothrs/expo-mixpanel-analytics`** — thin pure-JS HTTP client; Expo Go-compatible, no native dep; **but lightly maintained / older, no autotrack, no native props, manual flush** — verify last-publish before adopting. **[community — verify]**

| | Official native (EAS dev client) | Official JS Mode | Raw HTTP / `@bothrs` |
|---|---|---|---|
| Expo Go | ❌ (needs dev build) | ✅ | ✅ |
| Native default props ($os, $model…) | ✅ | ❌ | ❌ |
| Auto-flush on background | ✅ | ❌ (manual) | manual |
| Queue/offline/dedup handled | ✅ | mostly | you build it |
| Session replay | ✅ | ❌ | ❌ |

> **Recommendation for Size Matters:** you already ship an EAS dev client, so **use the official SDK in native mode.** Only reach for HTTP/JS-mode if you specifically need Expo Go parity.

## 4.4 Automatically-collected events & default properties
**`trackAutomaticEvents=true`** collects the **legacy** set — **First App Open, App Updated, App Crashed, App Session** (internally `$ae_*`). Mixpanel **explicitly discourages** it (*"rely on client-side state and can be unreliable"*); default is `false`, and in **JS Mode it's a no-op**. **Keep it `false`** and fire your own clean `App Opened` on `AppState` active. ([Swift SDK docs](https://docs.mixpanel.com/docs/tracking-methods/sdks/swift)) **[DOC]**

**Default properties auto-attached in native mode** (regardless of the toggle): `$device_id`, `$user_id` (once identified), `$insert_id`, `mp_lib`, `$lib_version`, `$os`, `$os_version`, `$manufacturer`, `$brand`, `$model`, `$screen_width/height`, `$app_version_string`, `$app_build_number`, plus server-derived `$city`/`$region`/`mp_country_code`. **JS Mode gives a reduced subset** — another reason to run native mode. ([default-properties](https://docs.mixpanel.com/docs/data-structure/property-reference/default-properties)) **[DOC]**

---

# 5. RevenueCat + Mixpanel

Two complementary mechanisms — use **both for different purposes**: RevenueCat's **server-side integration** owns money/lifecycle; the **client SDK** owns in-session behavior.

## 5.1 RevenueCat's native Mixpanel integration (server-side, webhook-driven)
RevenueCat pushes subscription/revenue events into Mixpanel **from its servers** by connecting directly to the app stores — capturing events **even when the app is closed** (renewals, trial conversions, cancellations). Setup: RC dashboard → Project Settings → Integrations → Mixpanel → add Mixpanel **project token**, pick **gross vs net** revenue reporting. Writes to Mixpanel **Track** (events) + **Engage** (profiles); revenue-bearing events carry the amount automatically. ([RevenueCat — Mixpanel integration](https://www.revenuecat.com/docs/integrations/third-party-integrations/mixpanel)) **[DOC]**

**Events it sends** (display → internal id): Initial Purchase (`rc_initial_purchase_event`), Trial Started (`rc_trial_started_event`), Trial Converted (`rc_trial_converted_event`), Trial Cancelled (`rc_trial_cancelled_event`), Renewal (`rc_renewal_event`), Cancellation (`rc_cancellation_event`), Uncancellation (`rc_uncancellation_event`), Non Subscription Purchase (`rc_non_subscription_purchase_event`), Subscription Paused, Expiration (`rc_expiration_event`), Billing Issues (`rc_billing_issue_event`), Product Change (`rc_product_change_event`), Web Purchase Redeemed; plus paywall events `paywall_impression`, `paywall_close`, `paywall_cancel`. **[DOC]**

## 5.2 The key requirement — unify identity
Without aligned identities, server-side revenue lands on a **different** Mixpanel user than your in-app events. Two documented ways ([RevenueCat — Mixpanel](https://www.revenuecat.com/docs/integrations/third-party-integrations/mixpanel)): **[DOC]**
- **Option 1 (align Mixpanel to RC):** `mixpanel.identify(myAppUserId)` using the **same id** you give RevenueCat as its App User ID. Simplest — **recommended.**
- **Option 2 (tell RC the Mixpanel id):** set the reserved attribute **`$mixpanelDistinctId`** (the helper is `setMixpanelDistinctID`). *"If set it will be used instead of the RevenueCat App User ID in the Mixpanel events."*

> **Exact names (verified):** reserved attribute **`$mixpanelDistinctId`** (ends lowercase `...Id`); helper method **`setMixpanelDistinctID`** (ends uppercase `...ID`) — they genuinely differ on the final letter; don't "correct" either. ([RevenueCat — customer attributes](https://www.revenuecat.com/docs/customers/customer-attributes)) **[DOC]**
>
> **React Native call:** the documented verbatim examples are Swift/Capacitor (`Purchases.shared.attribution.setMixpanelDistinctID(...)` / `setMixpanelDistinctID({ mixpanelDistinctID })`). In `react-native-purchases` the portable, always-available path is the reserved attribute:
> ```js
> import Purchases from 'react-native-purchases';
> const id = await mixpanel.getDistinctId();
> await Purchases.setAttributes({ '$mixpanelDistinctId': id }); // after Purchases.configure(...)
> // (newer SDKs also expose Purchases.setMixpanelDistinctID(id) — confirm in your installed version)
> ```
> **[BP — verify exact RN method in your installed version]**

**For Size Matters: use Option 1.** Pick one canonical user id, call `Purchases.logIn(id)` and `mixpanel.identify(id)` with the **same** value at login/configure.

## 5.3 Client-side revenue via `track_charge`
Mixpanel records revenue with `getPeople().trackCharge(amount, props?)` (negative = refund); appears in the Revenue report. **Prerequisite:** the user must be **identified first** (it writes to a profile). Typical pattern: in the RevenueCat purchase-completion callback, read `StoreProduct.price` and call `trackCharge`. ([Mixpanel — revenue analytics](https://docs.mixpanel.com/docs/features/revenue-analytics)) **[DOC]**

## 5.4 Server-side vs client-side — recommendation
**Server-side captures what the client cannot:** renewals, trial conversions, cancellations, billing issues, expirations, **refunds** (negative revenue) — all cross-platform, even while the app is closed. **Client-side wins on latency only** (server-side = "seconds to minutes"). ([RevenueCat — integrations](https://www.revenuecat.com/docs/integrations/integrations)) **[DOC]**

**Double-counting:** Mixpanel dedups only when **all four** (event, distinct_id, time, `$insert_id`) match — so a client `track_charge` and RevenueCat's `Initial Purchase` (different name + `$insert_id`) **will NOT collapse → double revenue** if you track the same purchase in both. RevenueCat webhooks are **at-least-once** (dedupe on RC event id). ([Mixpanel — dedup](https://docs.mixpanel.com/reference/event-deduplication); [RevenueCat — webhooks](https://www.revenuecat.com/docs/integrations/webhooks)) **[BP from the dedup rules]**

> **Best practice (attribute revenue once):**
> 1. **Make RevenueCat's server-side integration the single source of truth for REVENUE** (`trackCharge`/money in Mixpanel comes from RC, not the client).
> 2. **Do NOT also fire a client-side `track_charge` for the same transaction.** Split cleanly: **server = money/lifecycle; client = behavioral** (`Paywall Viewed`, `Plan Selected`, feature use).
> 3. For an instant in-session "purchased" signal in funnels, fire a client event **without** revenue (no `trackCharge`) and let RC own the dollars.
> 4. **Unify identity** (§5.2, Option 1). Make webhook handling **idempotent** on RC event id.

---

# 6. Concrete recommended event list for Size Matters

Grouped by AARRR. **Title Case events, snake_case properties.** **P0 = must-have** (instrument first), **P1 = nice-to-have** (add once P0 is clean). Properties listed are *event* properties unless noted. Keep these keys consistent across the funnel so one breakdown segments the whole thing.

### Super properties (register once, ride every event)
`app_version`, `build_number`, `platform` (auto via $os too), `is_subscriber` (bool, update on entitlement change), `entitlement` (`premium`/none), `plan` (`annual`/`single_unlock`/none), `free_resizes_remaining`, `signup_source`, `experiment_variant` (if A/B testing paywall). **[BP]**

### Profile (people) properties (current state, for cohorts/messaging)
`$email` (if collected), `$created` (first open), `plan_tier`, `subscription_status`, `lifetime_resizes`, `lifetime_shares`, `last_resize_at`, `total_revenue` (let RC integration own this). Use `getPeople().increment('lifetime_resizes', 1)` on each resize. **[BP]**

---

### ACQUISITION

| Event | Priority | Key properties |
|---|---|---|
| `App Installed` (first open) | **P0** | `install_referrer?`, `os`, `device_model` (auto) — fire once via setOnce guard |
| `App Opened` | **P0** | `is_first_open` (bool), `source` (cold/push/deeplink) — fire on `AppState` active; replaces legacy autotrack |
| `Deep Link Opened` | P1 | `url`, `campaign?` — if you add referral/share deep links |
| `Push Notification Opened` | P1 | `campaign`, `notification_type` |

### ACTIVATION (onboarding + the core resize flow — your aha funnel)

| Event | Priority | Key properties |
|---|---|---|
| `Onboarding Started` | **P0** | `onboarding_version` |
| `Onboarding Step Viewed` | **P0** | `step_index`, `step_name` — one event, step in a property (funnel-friendly) |
| `Onboarding Completed` | **P0** | `onboarding_version`, `duration_sec` (use `timeEvent`) |
| `Onboarding Skipped` | P1 | `step_index` (where they bailed) |
| `Photo Permission Requested` | P1 | — |
| `Photo Permission Result` | **P0** | `granted` (bool), `status` |
| `Photo Picked` | **P0** | `source` (camera/library), `has_fish_expected?` — **funnel step 1** of the core flow |
| `Detection Started` | P1 | `provider:'gemini'` — wrap with `timeEvent('Detection Completed')` |
| `Detection Completed` | **P0** | `has_fish` (bool), `confidence`, `species`, `provider:'gemini'`, `duration_sec`, `model_id` — **funnel step 2** |
| `Detection Failed` | **P0** | `error_type` (`config_error`/`network`/`timeout`/`no_fish`), `provider` — critical for your fail-open detection |
| `Resize Adjusted` | P1 | `factor` (0.5/0.75/1/2/3) — slider interaction; helps find the activation threshold |
| `Resize Started` | **P0** | `factor`, `species`, `provider` (`gemini`/`flux`), `model_id`, `is_subscriber`, `free_resizes_remaining` — **funnel step 3**; wrap with `timeEvent('Resize Completed')` |
| `Resize Completed` | **P0** (**aha candidate**) | `factor`, `species`, `provider`, `model_id`, `duration_sec`, `is_subscriber` — **funnel step 4 / the core value event** |
| `Resize Failed` | **P0** | `error_type` (`config_error`/`403`/`429`/`5xx`/`timeout`), `provider`, `model_id`, `retry_count` — maps directly to your hardened error types; watch this closely |
| `Photo Saved` | **P0** (**strong aha**) | `factor`, `species`, `provider`, `destination` (camera_roll), `has_watermark` (bool) — keeping the result = realized value |
| `Photo Shared` | **P0** (**aha + referral**) | `channel` (instagram/messages/…), `has_watermark`, `factor`, `species` — the viral surface |
| `Share Sheet Dismissed` | P1 | `channel?` |

### RETENTION (engagement / re-engagement)

| Event | Priority | Key properties |
|---|---|---|
| `Gallery Viewed` | **P0** | `saved_count` |
| `Gallery Item Opened` | P1 | `item_index`, `species` |
| `Gallery Item Deleted` | P1 | — |
| `Rate Prompt Shown` | **P0** | `trigger` (post_win_5s/profile_row), `sentiment_gate` (happy/sad) — you already gate happy/sad + 5s-after-win |
| `Rate Prompt Result` | **P0** | `action` (native_review/feedback/dismissed) — native `expo-store-review`; #1 growth lever per the audit |
| `Feedback Submitted` | P1 | `sentiment`, `reason` (delete_intent/…) |
| `Settings Opened` | P1 | — |

### REFERRAL

| Event | Priority | Key properties |
|---|---|---|
| `Photo Shared` | **P0** | *(counted under Activation; it's the referral driver — watermark = passive ad)* |
| `Invite Sent` | P1 | `channel` — only if you add an explicit invite/referral program |
| `Referral Install Attributed` | P1 | `referrer_id` — needs deep-link attribution |

### REVENUE (paywall + subscription)

| Event | Priority | Key properties |
|---|---|---|
| `Paywall Viewed` | **P0** | `placement` (after_free_resize/premium_tab/onboarding), `paywall_variant`, `trigger`, `free_resizes_remaining` — **funnel step 1** |
| `Paywall Dismissed` | **P0** | `placement`, `dwell_sec` (use `timeEvent`) — measures drop-off |
| `Plan Selected` | **P0** | `plan_id` (`$rc_annual`/`$rc_custom_single_unlock`), `price`, `currency`, `placement` — **funnel step 2** |
| `Purchase Started` | **P0** | `plan_id`, `price`, `currency`, `placement` — **funnel step 3** (fires at `Purchases.purchasePackage`) |
| `Purchase Completed` | **P0** (client signal, **no `trackCharge`**) | `plan_id`, `price`, `currency`, `is_trial`, `placement` — **funnel step 4**; let the **RC server integration own the revenue dollars** (avoid double-count) |
| `Purchase Failed` | **P0** | `plan_id`, `error_code`, `user_cancelled` (bool) — branch of the funnel |
| `Purchase Restored` | P1 | `entitlement`, `plan_id` |
| `Trial Started` | P1 | `plan_id` — **only if you add a trial**; note RC also sends this server-side (`rc_trial_started_event`) |
| `Single Unlock Used` | P1 | — consumed a `$rc_custom_single_unlock` |
| `Entitlement Changed` | **P0** | `entitlement` (`premium`/none), `source` (purchase/restore/expiry/launch_sync) — fire on launch entitlement re-sync; drives `is_subscriber` super prop + profile |

**Server-side (from RevenueCat integration, no client code):** `Initial Purchase`, `Renewal`, `Trial Converted`, `Cancellation`, `Billing Issues`, `Expiration`, refunds (negative revenue). These are your **revenue source of truth.**

### CROSS-CUTTING (errors / quality — HEART "Task success")

| Event | Priority | Key properties |
|---|---|---|
| `Error Shown` | P1 | `error_type`, `screen`, `recoverable` (bool) — user-facing error banners |
| `App Backgrounded` | P1 | — good place to `mixpanel.flush()` |

**Count:** ~22 P0 + ~16 P1 ≈ **38 events** — within the healthy range (recall Mixpanel's "50+ is too many"). Ship the **P0 set first**; it covers every AARRR stage and the two funnels (core resize flow + paywall) you most need to optimize.

### The two funnels to build day one
1. **Core value funnel:** `Photo Picked → Detection Completed → Resize Started → Resize Completed → Photo Saved/Shared` — find where users drop (likely detection failures or the 1-free-resize wall).
2. **Paywall funnel:** `Paywall Viewed → Plan Selected → Purchase Started → Purchase Completed` — measure step conversion by `placement` and `plan_id`.

---

# 7. Recommended analytics-service architecture

Centralize all tracking behind **one typed module** so events are never scattered as raw `mixpanel.track('...')` calls (which is how taxonomies rot). Pattern:

```ts
// src/lib/analytics/events.ts — the typed event catalog (single source of truth)
export type AnalyticsEvent =
  | { name: 'Photo Picked';        props: { source: 'camera' | 'library' } }
  | { name: 'Resize Started';      props: { factor: number; species?: string; provider: 'gemini' | 'flux'; model_id: string } }
  | { name: 'Resize Completed';    props: { factor: number; species?: string; provider: 'gemini' | 'flux'; model_id: string; duration_sec?: number } }
  | { name: 'Resize Failed';       props: { error_type: 'config_error' | '403' | '429' | '5xx' | 'timeout'; provider: string; retry_count: number } }
  | { name: 'Photo Shared';        props: { channel: string; has_watermark: boolean; factor: number; species?: string } }
  | { name: 'Paywall Viewed';      props: { placement: string; paywall_variant?: string; free_resizes_remaining: number } }
  | { name: 'Plan Selected';       props: { plan_id: '$rc_annual' | '$rc_custom_single_unlock'; price: number; currency: string; placement: string } }
  | { name: 'Purchase Completed';  props: { plan_id: string; price: number; currency: string; is_trial: boolean; placement: string } }
  // …one variant per event; the compiler now enforces correct props at every call site
  ;
```

```ts
// src/lib/analytics/index.ts — the service wrapper
import { Mixpanel } from 'mixpanel-react-native';
import type { AnalyticsEvent } from './events';

const TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;
const ENABLED = !!TOKEN && !__DEV__; // no-op in dev / when unconfigured

let mp: Mixpanel | null = null;

export async function initAnalytics() {
  if (!ENABLED) return;
  mp = new Mixpanel(TOKEN!, /*trackAutomaticEvents*/ false);
  await mp.init();
}

// Typed, centralized track — the ONLY way the app emits events
export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']) {
  if (!ENABLED || !mp) { if (__DEV__) console.log('[analytics]', name, props); return; }
  mp.track(name, props);
}

export function timeEvent(name: AnalyticsEvent['name']) { mp?.timeEvent(name); }

// Identity — call with the SAME id you give RevenueCat (§5.2 Option 1)
export async function identify(userId: string) {
  if (!mp) return;
  await mp.identify(userId);
}
export function setProfile(props: Record<string, unknown>) { mp?.getPeople().set(props); }
export function registerSuper(props: Record<string, unknown>) { mp?.registerSuperProperties(props); }
export function incrementProfile(prop: string, by = 1) { mp?.getPeople().increment(prop, by); }
export function reset() { mp?.reset(); } // on logout

export function flush() { mp?.flush(); } // call on App Backgrounded
```

**Design principles** (synthesized from §2.5 governance + standard RN practice) **[BP]:**
- **No raw `mixpanel.track` anywhere in screens** — only `track('Event Name', {...})` from this module. The typed catalog makes a typo or wrong prop a **compile error**, enforcing the taxonomy in CI (Amplitude: *"treat analytics like production code"*).
- **No-op / dev guard:** `ENABLED = !!TOKEN && !__DEV__` so dev builds log to console instead of polluting prod data; unconfigured builds are silent.
- **Centralize identity calls** so `identify`/`reset` always run alongside `Purchases.logIn`/`logOut` with the same id.
- **Register super properties** (`is_subscriber`, `plan`, `app_version`) at startup and on every `Entitlement Changed`, so every event is segmentable by subscription state.
- **Flush on background** (`AppState` → `flush()`), since you control native mode.
- Keep the **catalog file = your tracking plan**; mirror it in a spreadsheet with the columns from §2.5 for non-engineers.

---

## Source-quality notes
- **Confirmed verbatim from primary docs:** Mixpanel API/identity/residency/ATT/default-props; the constructor-not-init correction; object-action + casing + "no values in names"; the four property types; RevenueCat's exact event list, `$mixpanelDistinctId` attribute & `setMixpanelDistinctID` method (+ their casing difference); Mixpanel dedup keys; `trackCharge` semantics; Expo native-module/dev-build requirement.
- **Synthesized best practice (no single authoritative sentence):** "don't track the same purchase client- and server-side" (from Mixpanel dedup + RC at-least-once); the Size Matters event list & wrapper architecture; recommended event count.
- **Flagged to verify before shipping:** the exact `react-native-purchases` signature for `setMixpanelDistinctID` (documented examples are Swift/Capacitor — the reserved-attribute `Purchases.setAttributes({'$mixpanelDistinctId':id})` path is portable and safe); the community claim that `$mixpanelDistinctId` can't be modified once set; `@bothrs/expo-mixpanel-analytics` maintenance status.
