export const SHARE_MESSAGES = [
  "My fish is bigger than yours",
  "Caught this absolute UNIT",
  "The one that didn't get away",
  "Size definitely matters",
  "No cap, just fish",
  "Trust me bro, it was THIS big",
  "Proof that size matters",
  "Making fishermen jealous since 2025",
  "Legend has it, this fish was even bigger",
  "Official fish size verification",
];

export const APP_DOWNLOAD_LINK = "sizematters.app/download";

export function getRandomShareMessage(): string {
  return SHARE_MESSAGES[Math.floor(Math.random() * SHARE_MESSAGES.length)];
}
