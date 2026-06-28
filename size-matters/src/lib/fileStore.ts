import * as FileSystem from 'expo-file-system';

/**
 * Persistent home for saved catch images.
 *
 * The AI resize writes its output to `FileSystem.cacheDirectory`, and the image
 * picker / manipulator also hand back cache/temp URIs. iOS reclaims the cache
 * directory under storage pressure and on app updates — so persisting those raw
 * URIs into the gallery means "My Catches" silently rots into blank tiles.
 * Copying the bytes into `documentDirectory` (which is backed up and survives
 * updates) before we persist the URI fixes that.
 */
const GALLERY_DIR = `${FileSystem.documentDirectory}gallery/`;

let ensureDirPromise: Promise<void> | null = null;

async function ensureGalleryDir(): Promise<void> {
  if (!ensureDirPromise) {
    ensureDirPromise = (async () => {
      const info = await FileSystem.getInfoAsync(GALLERY_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(GALLERY_DIR, { intermediates: true });
      }
    })().catch((e) => {
      // Reset so a later call can retry rather than caching the failure forever.
      ensureDirPromise = null;
      throw e;
    });
  }
  return ensureDirPromise;
}

/**
 * Copy an image out of the OS cache/temp into the app's persistent document
 * directory and return the new `file://` URI. If the source is already in the
 * document directory it's returned unchanged. On any failure it falls back to
 * the original URI — a possibly-temporary image beats a missing one.
 */
export async function persistImage(
  uri: string | null | undefined,
  prefix: string = 'img',
): Promise<string | null> {
  if (!uri) return uri ?? null;
  // Already persistent (or a remote/asset URI we shouldn't copy) → leave as-is.
  if (FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)) {
    return uri;
  }
  try {
    await ensureGalleryDir();
    const extMatch = uri.match(/\.(png|jpe?g|webp|heic)(?:\?|$)/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const unique = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
    const dest = `${GALLERY_DIR}${prefix}_${unique}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    console.log('[fileStore] persistImage failed, using original uri:', e);
    return uri;
  }
}
