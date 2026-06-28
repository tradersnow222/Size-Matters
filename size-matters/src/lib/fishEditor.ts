import * as FileSystem from 'expo-file-system';
import { Image } from 'react-native';

interface FishEditResult {
  success: boolean;
  editedImageUri?: string;
  error?: string;
  /** 'config_error' = keys missing/invalid in this build (a setup problem, not a photo problem). */
  errorType?: 'no_fish' | 'api_error' | 'config_error' | 'unknown';
}

interface FishDetectionResult {
  hasFish: boolean;
  confidence: 'high' | 'medium' | 'low';
  suggestion?: string;
  /** The detected fish species/type, e.g. "largemouth bass". Used to anchor the resize prompt
   *  so the resize step cannot swap the fish for a different species. */
  species?: string;
}

interface FluxPollResponse {
  id: string;
  status: 'Pending' | 'Ready' | 'Error' | 'Content Moderated' | 'Request Moderated';
  result?: {
    sample: string; // URL to the generated image
  };
}

/**
 * RESIZE ARCHITECTURE
 * -------------------
 * The fish resize is done by an instruction image-editing model. We use Google's
 * "Nano Banana" (Gemini image model) as the PRIMARY engine because it actually
 * applies large size changes — FLUX.1 Kontext is preservation-biased and barely
 * grows the fish at 2x/3x (it substitutes appearance edits for geometric ones).
 *
 * The exact-factor guarantee is intentionally NOT relied upon (no instruction model
 * can hit an exact 3.00x). Instead the prompt:
 *   1. uses bold size language anchored to an in-frame reference (the person's torso/
 *      forearm) — models can compare to a visible ruler even though they can't measure
 *      a multiplier;
 *   2. lets ONLY the hands/arms re-pose to hold the resized fish (removing the old
 *      "keep everything identical" contradiction that capped the change);
 *   3. keeps the face, clothing, and background fixed for believability.
 *
 * FLUX is kept as a live fallback behind RESIZE_PROVIDER for instant rollback.
 */
const RESIZE_PROVIDER: 'gemini' | 'flux' = 'gemini';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY; // detection + resize (primary)
const FLUX_API_KEY = process.env.EXPO_PUBLIC_FLUX_API_KEY; // resize (fallback)

/**
 * Optional backend proxy (Cloudflare Worker — see ../../proxy). When EXPO_PUBLIC_PROXY_URL is set,
 * detection + resize go THROUGH it and the AI keys live only on the server (not in the app binary).
 * Empty = direct-to-Google (keys required client-side, the current default).
 */
const PROXY_URL = process.env.EXPO_PUBLIC_PROXY_URL?.replace(/\/+$/, '');
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;

function proxyHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (PROXY_SECRET) h['x-app-secret'] = PROXY_SECRET;
  return h;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/**
 * "Nano Banana" image model. `gemini-3.1-flash-image` is GA (production-safe) and gave
 * clearly more dramatic, believable resizes than `gemini-2.5-flash-image` in head-to-head
 * testing on real catch photos — 2.5 grows the fish only modestly at 3x and crops tighter.
 * Alternatives: `gemini-2.5-flash-image` (more conservative) or `gemini-3-pro-image`
 * ("Nano Banana Pro", highest quality at higher cost/latency).
 * NOTE: the image models are PAID-tier only — the key's Google project needs billing enabled.
 */
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

/** Text+vision model for fish detection + species ID (cheap, fast, available on free tier too). */
const GEMINI_TEXT_MODEL = 'gemini-2.5-flash';

// FLUX.1 Kontext Pro - fallback resize engine.
const FLUX_API_URL = 'https://api.bfl.ai/v1/flux-kontext-pro';

/**
 * Hard request ceilings. Without these a stalled connection (dropped signal, hung
 * server) leaves the UI's loading game running forever with no way out. The resize
 * p50 is ~10–14s and the tail ~30s, so 60s is comfortably past any real success.
 */
const RESIZE_TIMEOUT_MS = 60000;
const DETECT_TIMEOUT_MS = 20000;

/**
 * fetch() with a hard timeout via AbortController. RN-safe (does not rely on the
 * newer AbortSignal.timeout static, which isn't guaranteed on Hermes). On timeout
 * the promise rejects with an AbortError, which callers translate into a friendly
 * "timed out" message.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetchWithTimeout that retries a couple of times on transient failures (rate
 * limits + gateway errors) with a short backoff. A single 429/503 on a paid
 * image model is common under burst; without a retry that becomes one visible
 * failure for a paying user. Timeouts/aborts are NOT retried (they already cost
 * the full ceiling), and non-retryable statuses return immediately.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  retries: number = 1,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    const retryable =
      response.status === 429 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;
    if (response.ok || !retryable || attempt >= retries) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
  }
}

/**
 * True only for a key that could plausibly be real. Catches the #1 build/migration
 * failure: shipping with a missing key or an `sk-proj-xxxx` / `bfl_xxxx` placeholder
 * from .env.example. (An otherwise-real-looking but revoked key is still caught at
 * runtime via the 401/403 handling below.)
 */
function isUsableKey(key: string | undefined): key is string {
  if (!key) return false;
  const k = key.trim();
  if (k.length < 20) return false; // real Gemini / BFL keys are well over 20 chars
  if (/x{4,}/i.test(k)) return false; // "xxxxxxxx" placeholder
  return true;
}

/**
 * Validates if an image contains a fish before attempting resize.
 * Uses Gemini (vision) for detection + species tagging — same key/provider as the resize,
 * with a JSON response schema so the output parses cleanly.
 */
export async function detectFishInImage(imageUri: string): Promise<FishDetectionResult> {
  try {
    // Proxy path: send only the photo; the Worker holds the key and does the detection.
    if (PROXY_URL) {
      try {
        const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
        const r = await fetch(`${PROXY_URL}/detect`, {
          method: 'POST',
          headers: proxyHeaders(),
          body: JSON.stringify({ imageBase64: base64 }),
        });
        if (r.ok) {
          const d = await r.json();
          const result: FishDetectionResult = {
            hasFish: d.hasFish === true,
            confidence: ['high', 'medium', 'low'].includes(d.confidence) ? d.confidence : 'medium',
          };
          if (typeof d.species === 'string' && d.species.trim().length > 0) result.species = d.species.trim();
          if (!result.hasFish && d.suggestion) result.suggestion = d.suggestion;
          return result;
        }
        console.log('[FishEditor] Proxy detect failed (HTTP ' + r.status + ')');
      } catch (e) {
        console.log('[FishEditor] Proxy detect error:', e);
      }
      // Non-blocking: let the user proceed to resize.
      return { hasFish: true, confidence: 'low' };
    }

    if (!isUsableKey(GEMINI_API_KEY)) {
      console.warn(
        '[FishEditor] EXPO_PUBLIC_GEMINI_API_KEY is missing or a placeholder in this build — ' +
        'fish detection and species tagging are disabled (resize will fall back to a generic prompt). ' +
        'Set a real key as an EAS environment variable (and in .env for local dev).'
      );
      // Non-blocking: let the user proceed to resize.
      return { hasFish: true, confidence: 'low' };
    }

    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const instruction =
      'Analyze this image as if screening a fishing catch photo. Is there a real fish clearly visible that ' +
      'someone is holding or displaying? Also identify the fish species/type as specifically as you can ' +
      '(e.g. "largemouth bass", "rainbow trout", "bluegill"); if you cannot tell exactly, give the closest ' +
      'general type (e.g. "bass", "trout", "panfish"). If there is no fish, use an empty string for species. ' +
      'An aquarium, a drawing, or a photo with no held fish is NOT a catch photo. ' +
      'Set "description" to a brief note of what you see.';

    // Gemini (vision) for fish detection — JSON schema guarantees a parseable response.
    const response = await fetchWithTimeout(`${GEMINI_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: instruction },
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              hasFish: { type: 'BOOLEAN' },
              confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
              species: { type: 'STRING' },
              description: { type: 'STRING' },
            },
            required: ['hasFish', 'confidence', 'species', 'description'],
          },
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    }, DETECT_TIMEOUT_MS);

    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        console.warn(
          `[FishEditor] Gemini detection auth failed (HTTP ${response.status}) — the key is invalid, ` +
          'restricted, or not included in this build. Detection skipped.'
        );
      } else {
        console.log('[FishEditor] Detection API error (HTTP ' + response.status + ')');
      }
      // If detection fails, allow the resize to proceed (fail gracefully)
      return { hasFish: true, confidence: 'low' };
    }

    const data = await response.json();
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text: string = parts.find((p) => typeof p?.text === 'string')?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const result: FishDetectionResult = {
          hasFish: parsed.hasFish === true,
          confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
        };

        if (typeof parsed.species === 'string' && parsed.species.trim().length > 0) {
          result.species = parsed.species.trim();
        }

        if (!result.hasFish && parsed.description) {
          result.suggestion = parsed.description;
        }

        return result;
      } catch (parseError) {
        console.log('[FishEditor] Failed to parse detection response');
      }
    }

    // Default to allowing if parsing fails
    return { hasFish: true, confidence: 'low' };
  } catch (error) {
    console.log('[FishEditor] Detection error:', error);
    // Fail gracefully - allow resize attempt
    return { hasFish: true, confidence: 'low' };
  }
}

/**
 * Build the editing prompt (model-agnostic — used by both the Gemini and FLUX paths).
 *
 * Every prompt is built from five parts, in order:
 *   1. SIZE     — a bold size instruction anchored to an in-frame reference (torso/forearm).
 *   2. IDENTITY — lock the fish's species/appearance so ONLY its size changes.
 *   3. GRIP     — the key fix: let ONLY the hands/arms re-pose so the hold stays believable.
 *   4. SCENE    — keep the face, clothing, background and lighting exactly as photographed.
 *   5. REALISM  — match light/shadow/grain so it reads as an un-edited photo.
 *
 * `species` is the detected fish type (e.g. "largemouth bass"); when known it's named
 * throughout as an extra anchor, otherwise we fall back to the generic word "fish".
 */
function generateResizePrompt(scale: number, species?: string): string {
  const isShrinking = scale < 1;
  const cleanSpecies = species?.trim();
  const fishName = cleanSpecies && cleanSpecies.length > 0 ? cleanSpecies : 'fish';

  // 1. SIZE — bold and anchored to the person's body. Models can't measure "3x", but
  //    they CAN compare to a visible ruler (the angler's torso/forearm) in the frame.
  let sizeInstruction: string;
  if (isShrinking) {
    if (scale <= 0.5) {
      sizeInstruction = `Make the ${fishName} the person is holding about half its current size — shrink it to a small, modest ${fishName}, roughly half as long and half as tall, clearly just a little fish.`;
    } else if (scale <= 0.75) {
      sizeInstruction = `Make the ${fishName} the person is holding about 25% smaller — noticeably smaller, reduced to roughly three-quarters of its current length and height, but still a believable catch.`;
    } else {
      const pct = Math.abs(Math.round((1 - scale) * 100));
      sizeInstruction = `Make the ${fishName} the person is holding about ${pct}% smaller — a subtle, even reduction in its length and height.`;
    }
  } else {
    if (scale >= 3) {
      sizeInstruction = `Make the ${fishName} the person is holding dramatically larger — about three times its current size, a huge trophy ${fishName} roughly as long as the person's torso (from waist to shoulders) and clearly heavy.`;
    } else if (scale >= 2) {
      sizeInstruction = `Make the ${fishName} the person is holding about twice as large — a much bigger, impressive ${fishName}, clearly heavier and roughly as long as the person's forearm and then some.`;
    } else if (scale >= 1.5) {
      sizeInstruction = `Make the ${fishName} the person is holding about one and a half times larger — a noticeably bigger, solid catch.`;
    } else {
      const pct = Math.round((scale - 1) * 100);
      sizeInstruction = `Make the ${fishName} the person is holding about ${pct}% larger — a modest but clearly visible increase in its length and height.`;
    }
  }

  // 2. IDENTITY — only the size changes; it stays the same fish.
  const identityLock =
    `Keep it the exact same ${fishName}: the same species with the same colors, markings, spots, scales, fins, tail and head, and the same body proportions. Only its overall size changes — do not swap it for a different kind of fish.`;

  // 3. GRIP — the key fix. Allow ONLY the hands/arms to adapt to the new fish size.
  const gripNote = isShrinking
    ? `Naturally adjust the person's hands and fingers to hold the now-smaller ${fishName} convincingly — for example pinching it by the lip or cupping it in one hand — with no empty gap or oversized grip where the bigger fish used to be.`
    : `Naturally re-pose the person's hands and arms to realistically hold the now much larger, heavier ${fishName}, bringing in a second hand to support its weight if needed, so the grip looks natural and the fish does not appear to float.`;

  // 4. SCENE — everything that is NOT the fish or the grip stays as photographed.
  const sceneLock =
    `Keep the person's face, expression, hair, hat and clothing the same, and keep the background, water, sky and lighting exactly the same. The only things that change are the fish's size and the hands and arms holding it.`;

  // 5. REALISM
  const realism =
    `Match the lighting, shadows, color and grain so the result looks like a completely real, un-edited photograph.`;

  return `${sizeInstruction} ${identityLock} ${gripNote} ${sceneLock} ${realism}`;
}

/** Gemini image generation supports a fixed set of aspect ratios. */
const SUPPORTED_ASPECT_RATIOS: { label: string; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '2:3', value: 2 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '4:5', value: 4 / 5 },
  { label: '5:4', value: 5 / 4 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
];

/**
 * Measure the source image and return the nearest supported aspect ratio label, so the
 * resized result keeps the original framing (otherwise Nano Banana can default to square,
 * which would mismatch the before/after comparison view). Falls back to "3:4" (the typical
 * portrait catch photo) if the dimensions can't be read.
 */
async function getImageAspectRatioLabel(uri: string): Promise<string> {
  try {
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
    });
    if (!width || !height) return '3:4';
    const ratio = width / height;
    let best = SUPPORTED_ASPECT_RATIOS[0];
    let bestDiff = Infinity;
    for (const ar of SUPPORTED_ASPECT_RATIOS) {
      const diff = Math.abs(ar.value - ratio);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = ar;
      }
    }
    return best.label;
  } catch {
    return '3:4';
  }
}

/**
 * PRIMARY resize: Google "Nano Banana" (Gemini image model). Single synchronous call —
 * no polling. Returns a local file URI to the edited PNG.
 */
async function resizeFishWithGemini(
  imageUri: string,
  scale: number,
  species?: string
): Promise<FishEditResult> {
  // Fail fast with a precise reason if this build has no usable Gemini key.
  if (!isUsableKey(GEMINI_API_KEY)) {
    console.warn(
      '[FishEditor] EXPO_PUBLIC_GEMINI_API_KEY is missing or a placeholder in this build — ' +
      'the resize API cannot be reached. Set it as an EAS environment variable (and in .env for local dev).'
    );
    return {
      success: false,
      error: "Resize isn't configured in this build (missing Gemini API key).",
      errorType: 'config_error',
    };
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const prompt = generateResizePrompt(scale, species);
    const aspectRatio = await getImageAspectRatioLabel(imageUri);

    const response = await fetchWithRetry(`${GEMINI_API_BASE}/models/${GEMINI_IMAGE_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio },
        },
        // Fishing photos contain people; keep the model from false-flagging them.
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    }, RESIZE_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[FishEditor] Gemini API error:', response.status, errorText);

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        // Bad/!restricted/missing key, or a malformed request — all setup problems.
        return {
          success: false,
          error: `Resize API rejected the request (HTTP ${response.status}). The Gemini API key is invalid, restricted, or not included in this build.`,
          errorType: 'config_error',
        };
      }

      if (response.status === 429) {
        return { success: false, error: 'Resize is busy right now (rate limited). Try again in a moment.', errorType: 'api_error' };
      }

      return { success: false, error: `Gemini API error: ${response.status}`, errorType: 'api_error' };
    }

    const data = await response.json();

    // Find the inline image part (tolerate camelCase or snake_case from the API).
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
    const imgData: string | undefined = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;

    if (!imgData) {
      // No image — usually a safety block or a text-only refusal.
      const blockReason =
        data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? null;
      console.log('[FishEditor] Gemini returned no image. reason:', blockReason);
      return {
        success: false,
        error: blockReason ? `Resize was blocked by the model (${blockReason}).` : 'No image returned from the resize API.',
        errorType: 'api_error',
      };
    }

    const mime: string = imagePart?.inlineData?.mimeType ?? imagePart?.inline_data?.mime_type ?? 'image/png';
    const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
    const outputUri = `${FileSystem.cacheDirectory}fish_resized_${Date.now()}.${ext}`;

    await FileSystem.writeAsStringAsync(outputUri, imgData, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return { success: true, editedImageUri: outputUri };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    console.log('[FishEditor] Gemini resize error:', error);
    return {
      success: false,
      error: timedOut ? 'The resize timed out. Check your connection and try again.' : String(error),
      errorType: 'api_error',
    };
  }
}

/**
 * Poll Flux API for result (fallback path).
 */
async function pollFluxResult(pollingUrl: string, maxAttempts: number = 60): Promise<FluxPollResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetchWithTimeout(pollingUrl, {
      method: 'GET',
      headers: {
        // Resize already validated the key before polling begins.
        'x-key': FLUX_API_KEY ?? '',
      },
    }, 10000);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[FishEditor] Poll error:', errorText);
      throw new Error(`Polling failed: ${response.status}`);
    }

    const data: FluxPollResponse = await response.json();

    if (data.status === 'Ready' && data.result?.sample) {
      return data;
    }

    if (data.status === 'Error') {
      throw new Error('Flux processing failed');
    }

    if (data.status === 'Content Moderated' || data.status === 'Request Moderated') {
      throw new Error('Content was moderated by Flux');
    }

    // Wait 1 second before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Polling timed out');
}

/**
 * Download image from URL and save to local cache (fallback path).
 */
async function downloadImage(url: string): Promise<string> {
  const filename = `fish_edited_${Date.now()}.png`;
  const outputUri = FileSystem.cacheDirectory + filename;

  const downloadResult = await FileSystem.downloadAsync(url, outputUri);

  if (downloadResult.status !== 200) {
    throw new Error(`Failed to download image: ${downloadResult.status}`);
  }

  return outputUri;
}

/**
 * FALLBACK resize: FLUX.1 Kontext Pro. Kept live behind RESIZE_PROVIDER for instant
 * rollback. NOTE: Kontext is preservation-biased and under-applies large size changes —
 * expect the fish to grow far less than with the Gemini path.
 */
async function resizeFishWithFlux(
  imageUri: string,
  scale: number,
  species?: string
): Promise<FishEditResult> {
  try {
    // Fail fast with a precise reason if this build has no usable resize key.
    if (!isUsableKey(FLUX_API_KEY)) {
      console.warn(
        '[FishEditor] EXPO_PUBLIC_FLUX_API_KEY is missing or a placeholder in this build — ' +
        'the resize API cannot be reached. Set it as an EAS environment variable (and in .env for local dev).'
      );
      return {
        success: false,
        error: "Resize isn't configured in this build (missing FLUX API key).",
        errorType: 'config_error',
      };
    }

    // Read image as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Generate prompt based on scale (and species, when detected)
    const prompt = generateResizePrompt(scale, species);

    // Make initial request to Flux Kontext API
    const response = await fetchWithTimeout(FLUX_API_URL, {
      method: 'POST',
      headers: {
        'x-key': FLUX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        input_image: `data:image/jpeg;base64,${base64}`,
        // BFL caps safety_tolerance at 2 when an output image is requested (6 is
        // rejected with HTTP 422). 2 is the most permissive value this accepts.
        safety_tolerance: 2,
        output_format: 'png',
      }),
    }, RESIZE_TIMEOUT_MS);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[FishEditor] Flux API Error:', response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: `Resize API rejected the credentials (HTTP ${response.status}). The FLUX API key is invalid, revoked, or not included in this build.`,
          errorType: 'config_error',
        };
      }

      if (response.status === 402) {
        return { success: false, error: 'Insufficient Flux API credits', errorType: 'api_error' };
      }

      return { success: false, error: `Flux API error: ${response.status}`, errorType: 'api_error' };
    }

    const data = await response.json();

    if (!data.polling_url && !data.id) {
      return { success: false, error: 'Invalid response from Flux API', errorType: 'api_error' };
    }

    // Poll for result
    const pollingUrl = data.polling_url || `https://api.bfl.ai/v1/get_result?id=${data.id}`;

    const result = await pollFluxResult(pollingUrl);

    if (!result.result?.sample) {
      return { success: false, error: 'No image in Flux result', errorType: 'api_error' };
    }

    // Download the result image
    const localUri = await downloadImage(result.result.sample);

    return { success: true, editedImageUri: localUri };

  } catch (error) {
    console.log('[FishEditor] Error:', error);
    return { success: false, error: String(error), errorType: 'api_error' };
  }
}

/**
 * Resize via the backend proxy (keys stay server-side). Used when EXPO_PUBLIC_PROXY_URL is set.
 * The Worker builds the prompt + calls Gemini and returns the edited image as base64.
 */
async function resizeViaProxy(imageUri: string, scale: number, species?: string): Promise<FishEditResult> {
  try {
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const aspectRatio = await getImageAspectRatioLabel(imageUri);
    const r = await fetch(`${PROXY_URL}/resize`, {
      method: 'POST',
      headers: proxyHeaders(),
      body: JSON.stringify({ imageBase64: base64, scale, species, aspectRatio }),
    });
    if (!r.ok) {
      if (r.status === 429) return { success: false, error: 'Resize is busy right now. Try again in a moment.', errorType: 'api_error' };
      if (r.status === 401) return { success: false, error: 'Resize service rejected the app (bad or missing app secret).', errorType: 'config_error' };
      return { success: false, error: `Resize service error: ${r.status}`, errorType: 'api_error' };
    }
    const d = await r.json();
    if (!d.imageBase64) return { success: false, error: 'No image returned from the resize service.', errorType: 'api_error' };
    const ext = typeof d.mimeType === 'string' && d.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const outputUri = `${FileSystem.cacheDirectory}fish_resized_${Date.now()}.${ext}`;
    await FileSystem.writeAsStringAsync(outputUri, d.imageBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { success: true, editedImageUri: outputUri };
  } catch (error) {
    console.log('[FishEditor] Proxy resize error:', error);
    return { success: false, error: String(error), errorType: 'api_error' };
  }
}

/**
 * Main entry point for fish resizing. Dispatches to the proxy (if configured) or the provider.
 * Signature is unchanged so the UI doesn't need to know which engine runs.
 */
export async function resizeFish(imageUri: string, scale: number, species?: string): Promise<FishEditResult> {
  // No-op at original size.
  if (scale === 1) {
    return { success: true, editedImageUri: imageUri };
  }

  // Prefer the backend proxy when configured (keys stay server-side).
  if (PROXY_URL) {
    return resizeViaProxy(imageUri, scale, species);
  }

  if (RESIZE_PROVIDER === 'flux') {
    return resizeFishWithFlux(imageUri, scale, species);
  }
  return resizeFishWithGemini(imageUri, scale, species);
}
