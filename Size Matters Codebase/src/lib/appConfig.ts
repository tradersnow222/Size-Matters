import { Platform, Linking } from 'react-native';
import * as MailComposer from 'expo-mail-composer';

/**
 * App-wide configuration and external delivery helpers.
 */

// Support inbox used for all feedback channels.
export const SUPPORT_EMAIL = 'info@sizematters.app';

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
