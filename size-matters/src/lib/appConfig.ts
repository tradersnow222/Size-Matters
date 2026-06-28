import { Platform, Linking } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as StoreReview from 'expo-store-review';

/**
 * App-wide configuration and external delivery helpers.
 */

// Support inbox used for all feedback channels.
export const SUPPORT_EMAIL = 'info@sizematters.app';

/**
 * Legal pages. Apple requires a working Privacy Policy URL (and an EULA/Terms
 * link on the subscription screen). Defined once here so the paywall, the
 * Premium tab, and the Profile screen all point at the same place.
 * ⚠️ These must resolve to live pages before submitting — verify the domain is
 * actually serving them (it has been parked).
 */
export const PRIVACY_URL = 'https://sizematters.app/privacy';
export const TERMS_URL = 'https://sizematters.app/terms';

/**
 * The numeric App Store ID for Size Matters.
 * Live listing: https://apps.apple.com/us/app/size-matters-fish-enlarger/id6757819997
 */
export const APP_STORE_ID = '6757819997';

/**
 * Returns the "write a review" deep link, or null when the App Store ID has
 * not been configured yet (so callers can avoid opening a dead URL).
 */
export function getAppStoreReviewUrl(): string | null {
  if (!APP_STORE_ID) return null;
  if (Platform.OS === 'ios') {
    return `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
  }
  return null;
}

/**
 * Ask the user to rate the app. Prefers Apple's NATIVE in-app review sheet
 * (StoreReview.requestReview) — required by App Store guideline 1.1.7; a custom
 * dialog that deep-links straight to the write-review page is not allowed and
 * is throttled to nothing. Falls back to opening the App Store write-review
 * page only when the native API is unavailable (older OS, etc).
 */
export async function requestAppReview(): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      return;
    }
  } catch (error) {
    console.log('Native review prompt unavailable, falling back:', error);
  }

  const reviewUrl = getAppStoreReviewUrl();
  if (reviewUrl) {
    try {
      await Linking.openURL(reviewUrl);
    } catch (error) {
      console.log('Could not open App Store review page:', error);
    }
  }
}

/**
 * Sends user feedback to the support inbox. Prefers the native mail composer
 * (lets the user review before sending) and falls back to a mailto: deep link
 * when the composer is unavailable. Resolves once the channel has been opened
 * (or has failed gracefully) — feedback is never silently dropped.
 */
export async function sendFeedbackEmail(subject: string, body: string): Promise<void> {
  try {
    const isAvailable = await MailComposer.isAvailableAsync();
    if (isAvailable) {
      await MailComposer.composeAsync({
        recipients: [SUPPORT_EMAIL],
        subject,
        body,
      });
      return;
    }
  } catch (error) {
    console.log('Mail composer unavailable, falling back to mailto:', error);
  }

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(mailto);
  } catch (error) {
    console.log('Could not open mail client:', error);
  }
}
