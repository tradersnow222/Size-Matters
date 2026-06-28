# Size Matters

A hilarious mobile app for fishing enthusiasts that lets you resize the fish in your catch photos using AI. Because size REALLY matters when bragging to your friends!

## Features

### Core Functionality
- **Upload & Resize**: Upload a selfie with your catch and use AI to resize the fish from 50% to 300% of its original size
- **AI Image Editing**: Uses Google Gemini ("Nano Banana" image model) to resize fish in photos with intelligent prompt engineering, with FLUX.1 Kontext Pro kept as a fallback
- **Smart Fish Detection**: Automatically validates uploaded photos contain a fish before processing, with friendly guidance if no fish is detected
- **Before/After Comparison**: Swipe left and right on the edited photo to compare before and after versions with a smooth slider
- **Size Slider**: Interactive slider with humorous taglines like "Humble Mode" (shrink) to "Bar Story Mode" (massive)
- **Smart Button States**: After resizing, button changes to "Upload New Catch" for a clear user flow
- **Save to Phone**: Save the edited photo directly to your device's camera roll

### Onboarding
- **Animated Splash Screen**: Fun 3-step intro with swimming fish animation, floating bubbles, and hilarious taglines
- **First-time Experience**: "That fish you caught? Yeah, it was pretty small..." → "But what if it was HUGE?" → "Size Matters - Make your fish legendary"
- **Cheeky Footer**: "No fish were harmed in the making of this app (Just their reputations)"

### Social & Viral
- **Share with Watermark**: Shared images include a funny message, app download link (sizematters.app/download), and referral code directly on the image
- **Viral Taglines**: Randomized share messages like "My fish is bigger than yours", "Caught this absolute UNIT", "Trust me bro, it was THIS big"
- **Referral System**: Unique referral codes (e.g., FISH7K3M) that give both users free resizes
- **Gallery**: Save and manage all your legendary catches

### Gamification
- **Achievements**: Unlock badges like "First Catch", "Big Talker", "Fish Whisperer", "Social Angler", and "Viral Fisher"
- **Stats Tracking**: Track total resizes, shares, average fish scale, and more
- **Fun Facts**: See personalized stats about your exaggeration habits

### Feedback & Reviews
- **Smart Review Prompts**: After successful resizes, users are asked if they're enjoying the app
- **Positive Experience Flow**: Happy users are prompted to leave an App Store review
- **Negative Experience Flow**: Unhappy users can submit internal feedback via a form (not directed to App Store)
- **Rate Limiting**: Review prompts limited to once every 7 days, stops after rating
- **Profile Section**: Dedicated "Feedback & Support" section in profile for rating and feedback anytime
- **iOS Quick Action**: "Deleting Size Matters?" quick action appears when long-pressing app icon on home screen - last chance to collect feedback before users delete the app (TestFlight/App Store builds only)

### Monetization (Watermark Paywall Model)
- **Free Tier**: 3 free resizes to try the app (all downloads watermarked)
- **Watermark as Paywall**: Free users can resize but ALL downloads have watermarks
- **Single Unlock**: $0.99 to unlock one photo (remove watermark for that image)
- **Weekly Pro**: $2.99/week for unlimited watermark-free downloads
- **Annual Pro**: $29.99/year for best value (save 80% vs weekly)
- **RevenueCat Integration**: Full payment processing via RevenueCat with Test Store, App Store, and Play Store support
- **Smart Upgrade Prompts**:
  - "Last free resize!" warning banner appears when only 1 free resize remains
  - Animated paywall modal appears when users tap resize with 0 free edits
  - "Tap to unlock unlimited resizes" text nudge when out of free resizes
  - All prompts direct users to the premium subscription page

### App Store Compliance
- **Privacy Policy**: Link in Profile tab
- **Terms of Service**: Link in Profile tab
- **Version Display**: Shows app version in Profile tab

## App Structure

```
src/
  app/
    (tabs)/
      _layout.tsx      # Tab navigation with 4 tabs
      index.tsx        # Home - Upload & resize fish photos
      gallery.tsx      # My Catches - View saved photos
      premium.tsx      # Go Pro - Subscription page
      profile.tsx      # Profile - Stats & achievements
    feedback.tsx       # Quick action feedback screen (deletion feedback)
  components/
    OnboardingSplash.tsx  # Animated onboarding splash screen
    FishTapGame.tsx       # Mini-game while processing
    ShareableImage.tsx    # Watermarked image component
    PaywallModal.tsx      # Purchase modal for unlocking photos
    FeedbackModal.tsx     # Smart feedback/review prompt modal
  lib/
    store.ts           # Zustand store for app state
    taglines.ts        # Humorous copy and taglines
    cn.ts              # Utility for className merging
    revenuecatClient.ts # RevenueCat SDK wrapper
```

## Tech Stack
- Expo SDK 53 with React Native
- NativeWind (TailwindCSS) for styling
- React Query for async state
- Zustand for local state
- Google Gemini "Nano Banana" (`gemini-3.1-flash-image`) for AI fish resizing, with FLUX.1 Kontext Pro (Black Forest Labs) as a fallback
- Google Gemini (`gemini-2.5-flash` vision) for fish detection + species ID
- expo-image-picker for photo selection
- expo-sharing for social sharing
- expo-media-library for saving to camera roll
- react-native-reanimated for animations

## Design System (Apple HIG Compliant)

The app follows Apple Human Interface Guidelines for:

### Typography
- Minimum 11pt text (iOS standard)
- Clear hierarchy: Display (34pt) → Large Title (28pt) → Title (17-22pt) → Body (17pt) → Caption (11-12pt)
- Proper line heights and letter spacing per HIG

### Touch Targets
- Minimum 44x44pt for all interactive elements
- 48pt for comfortable targets
- 56pt for primary CTAs

### Colors (WCAG AA Compliant)
- Primary: Cyan (#00D4FF) - high visibility on dark backgrounds
- Background: Deep navy (#0B1623) - premium feel
- Semantic: Red for shrink, Green for enlarge, Gold for premium
- All text meets 4.5:1 contrast ratio minimum

### Design Tokens
Located at `src/lib/design.ts` - centralized colors, typography, spacing, and animation configs

## Environment Variables Required
Set in `.env` (gitignored) for local dev, and as EAS environment variables for builds:
- `EXPO_PUBLIC_GEMINI_API_KEY` - Google Gemini key (fish detection + primary resize). The image model is paid-tier, so the key's Google project must have billing enabled.
- `EXPO_PUBLIC_FLUX_API_KEY` - Flux API key (Black Forest Labs) for the fallback resize engine
- (optional) `EXPO_PUBLIC_PROXY_URL` / `EXPO_PUBLIC_PROXY_SECRET` - route detection + resize through the Cloudflare Worker proxy (in `/proxy`) so the AI keys stay server-side instead of shipping in the binary
- `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` / `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` / `EXPO_PUBLIC_REVENUECAT_TEST_KEY` - RevenueCat SDK keys

## Humorous Taglines
The app is packed with fishing humor:
- "Because Size Matters... in Fishing"
- "Turn Minnows into Monsters"
- "The One That Got Away? Not Anymore."
- Slider modes: "Humble Mode", "White Lie Territory", "Trophy Time", "ABSOLUTE UNIT"
