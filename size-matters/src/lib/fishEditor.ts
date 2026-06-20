import * as FileSystem from 'expo-file-system';

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

const FLUX_API_KEY = process.env.EXPO_PUBLIC_FLUX_API_KEY;
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
// Using FLUX.1 Kontext Pro - specifically designed for local object editing
const FLUX_API_URL = 'https://api.bfl.ai/v1/flux-kontext-pro';

/**
 * True only for a key that could plausibly be real. Catches the #1 build/migration
 * failure: shipping with a missing key or an `sk-proj-xxxx` / `bfl_xxxx` placeholder
 * from .env.example. (An otherwise-real-looking but revoked key is still caught at
 * runtime via the 401/403 handling below.)
 */
function isUsableKey(key: string | undefined): key is string {
  if (!key) return false;
  const k = key.trim();
  if (k.length < 20) return false; // real OpenAI / BFL keys are well over 20 chars
  if (/x{4,}/i.test(k)) return false; // "xxxxxxxx" placeholder
  return true;
}

/**
 * Validates if an image contains a fish before attempting resize
 * Uses OpenAI for detection since we're moving away from Gemini
 */
export async function detectFishInImage(imageUri: string): Promise<FishDetectionResult> {
  try {
    if (!isUsableKey(OPENAI_API_KEY)) {
      console.warn(
        '[FishEditor] EXPO_PUBLIC_OPENAI_API_KEY is missing or a placeholder in this build — ' +
        'fish detection and species tagging are disabled (resize will fall back to a generic prompt). ' +
        'Set a real key as an EAS environment variable (and in .env for local dev).'
      );
      // Non-blocking: let the user proceed to resize.
      return { hasFish: true, confidence: 'low' };
    }

    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Use OpenAI (vision) for fish detection
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Analyze this image. Is there a fish clearly visible that someone is holding or displaying (like a fishing catch photo)?

Also identify the fish species/type as specifically as you can (e.g. "largemouth bass", "rainbow trout", "bluegill"). If you cannot tell the exact species, give the closest general type (e.g. "bass", "trout", "panfish"). If there is no fish, use an empty string for species.

Reply in this exact JSON format only, no other text:
{"hasFish": true/false, "confidence": "high/medium/low", "species": "fish species or empty string", "description": "brief description of what you see"}

Examples:
- Person holding a bass = {"hasFish": true, "confidence": "high", "species": "largemouth bass", "description": "person holding a largemouth bass"}
- Fish in a bucket = {"hasFish": true, "confidence": "high", "species": "fish", "description": "fish in a bucket"}
- Person with no fish = {"hasFish": false, "confidence": "high", "species": "", "description": "person without any fish"}
- Aquarium with fish = {"hasFish": false, "confidence": "medium", "species": "", "description": "aquarium - not a catch photo"}`
            },
            {
              type: 'input_image',
              image_url: `data:image/jpeg;base64,${base64}`
            }
          ]
        }]
      }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn(
          `[FishEditor] OpenAI detection auth failed (HTTP ${response.status}) — the key is invalid, ` +
          'revoked, or not included in this build. Detection skipped.'
        );
      } else {
        console.log('[FishEditor] Detection API error (HTTP ' + response.status + ')');
      }
      // If detection fails, allow the resize to proceed (fail gracefully)
      return { hasFish: true, confidence: 'low' };
    }

    const data = await response.json();
    const text = data.output?.[0]?.content?.[0]?.text || data.choices?.[0]?.message?.content || '';

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
 * Generate the editing prompt for Flux Kontext based on scale.
 *
 * Every prompt is built from three fixed parts, in this order:
 *   1. SIZE        — a single, precise geometric instruction (change length AND width).
 *   2. IDENTITY    — lock the fish's species/appearance so ONLY its size changes. This is
 *                    what prevents the model from swapping the catch for a different species.
 *   3. SCENE       — keep the person and surroundings untouched (plus a bounded grip note
 *                    when shrinking, so the hands don't end up holding empty air).
 *
 * `species` is the detected fish type (e.g. "largemouth bass"). When available it is named
 * throughout the prompt as an extra anchor; otherwise we fall back to the generic word "fish".
 */
function generateFluxPrompt(scale: number, species?: string): string {
  const isShrinking = scale < 1;
  const percentageChange = Math.abs(Math.round((1 - scale) * 100));

  // What we call the fish in the prompt — the specific species if we know it.
  const cleanSpecies = species?.trim();
  const fishName = cleanSpecies && cleanSpecies.length > 0 ? cleanSpecies : 'fish';

  // 1. SIZE — one precise instruction per scale band. Length + width keeps proportions intact.
  let sizeInstruction: string;
  if (isShrinking) {
    if (scale <= 0.5) {
      sizeInstruction = `Make the ${fishName} 50% smaller: reduce it to exactly half its current length and half its current width.`;
    } else if (scale <= 0.75) {
      sizeInstruction = `Make the ${fishName} 25% smaller: reduce its current length and width by about one quarter.`;
    } else {
      sizeInstruction = `Make the ${fishName} ${percentageChange}% smaller: a subtle, even reduction in its length and width.`;
    }
  } else {
    if (scale >= 3.0) {
      sizeInstruction = `Make the ${fishName} 3 times larger: triple its current length and width (a 300% size increase).`;
    } else if (scale >= 2.0) {
      sizeInstruction = `Make the ${fishName} 2 times larger: double its current length and width.`;
    } else if (scale >= 1.5) {
      sizeInstruction = `Make the ${fishName} 1.5 times larger: increase its current length and width by 50%.`;
    } else {
      const increasePercent = Math.round((scale - 1) * 100);
      sizeInstruction = `Make the ${fishName} ${increasePercent}% larger: a modest, even increase in its length and width.`;
    }
  }

  // 2. IDENTITY — the most important clause. Resizing must not regenerate the fish.
  const identityLock =
    `CRITICAL: it must remain the exact same ${fishName} — do NOT change the species, type, or kind of fish. ` +
    `Keep its exact colors, markings, spots, stripes, scales, fin shapes, tail, head, and mouth identical, ` +
    `and keep the same body proportions. The fish's appearance and identity stay completely unchanged; ` +
    `the ONLY thing that changes is its overall size.`;

  // 3. SCENE — everything that is not the fish stays exactly as photographed.
  const sceneLock =
    `Keep the person, their face, expression, pose, arms, hands, clothing, the background, water, and lighting exactly the same.`;

  // When shrinking, allow ONLY the grip to adapt so hands aren't left clutching empty air.
  const gripNote = isShrinking
    ? ` You may subtly adjust only the fingers and grip so the hands still hold the smaller ${fishName} naturally; do not change anything else about the person.`
    : '';

  return `${sizeInstruction} ${identityLock} ${sceneLock}${gripNote}`;
}

/**
 * Poll Flux API for result
 */
async function pollFluxResult(pollingUrl: string, maxAttempts: number = 60): Promise<FluxPollResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(pollingUrl, {
      method: 'GET',
      headers: {
        // Resize already validated the key before polling begins.
        'x-key': FLUX_API_KEY ?? '',
      },
    });

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
 * Download image from URL and save to local cache
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
 * Use Flux API to resize the fish in the image
 */
export async function resizeFishWithFlux(
  imageUri: string,
  scale: number,
  species?: string
): Promise<FishEditResult> {
  try {
    // If scale is 1, return original
    if (scale === 1) {
      return { success: true, editedImageUri: imageUri };
    }

    // Fail fast with a precise reason if this build has no usable resize key.
    // (Otherwise BFL returns 403 "Not authenticated", which is indistinguishable
    // from a genuine image-processing failure in the UI.)
    if (!isUsableKey(FLUX_API_KEY)) {
      console.warn(
        '[FishEditor] EXPO_PUBLIC_FLUX_API_KEY is missing or a placeholder in this build — ' +
        'the resize API cannot be reached. Set it as an EAS environment variable (and in .env for local dev).'
      );
      return {
        success: false,
        error: 'Resize isn\'t configured in this build (missing FLUX API key).',
        errorType: 'config_error',
      };
    }

    // Read image as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Generate prompt based on scale (and species, when detected)
    const prompt = generateFluxPrompt(scale, species);

    // Make initial request to Flux Kontext API
    const response = await fetch(FLUX_API_URL, {
      method: 'POST',
      headers: {
        'x-key': FLUX_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        input_image: `data:image/jpeg;base64,${base64}`,
        safety_tolerance: 6, // Most permissive for fishing photos
        output_format: 'png',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[FishEditor] Flux API Error:', response.status, errorText);

      if (response.status === 401 || response.status === 403) {
        // BFL returns 403 "Not authenticated" for a missing/empty key and 422
        // "Invalid API key format" for a malformed one — both are setup problems.
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
 * Main entry point for fish resizing - now uses Flux
 */
export async function resizeFish(imageUri: string, scale: number, species?: string): Promise<FishEditResult> {
  return resizeFishWithFlux(imageUri, scale, species);
}
