import * as FileSystem from 'expo-file-system';

interface FishEditResult {
  success: boolean;
  editedImageUri?: string;
  error?: string;
  errorType?: 'no_fish' | 'api_error' | 'unknown';
}

interface FishDetectionResult {
  hasFish: boolean;
  confidence: 'high' | 'medium' | 'low';
  suggestion?: string;
}

interface FluxPollResponse {
  id: string;
  status: 'Pending' | 'Ready' | 'Error' | 'Content Moderated' | 'Request Moderated';
  result?: {
    sample: string; // URL to the generated image
  };
}

const FLUX_API_KEY = process.env.EXPO_PUBLIC_VIBECODE_FLUX_API_KEY!;
// Using FLUX.1 Kontext Pro - specifically designed for local object editing
const FLUX_API_URL = 'https://api.bfl.ai/v1/flux-kontext-pro';

/**
 * Validates if an image contains a fish before attempting resize
 * Uses OpenAI for detection since we're moving away from Gemini
 */
export async function detectFishInImage(imageUri: string): Promise<FishDetectionResult> {
  try {
    console.log('[FishEditor] Detecting fish in image...');

    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Use OpenAI for fish detection
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Analyze this image. Is there a fish clearly visible that someone is holding or displaying (like a fishing catch photo)?

Reply in this exact JSON format only, no other text:
{"hasFish": true/false, "confidence": "high/medium/low", "description": "brief description of what you see"}

Examples:
- Person holding a bass = {"hasFish": true, "confidence": "high", "description": "person holding a largemouth bass"}
- Fish in a bucket = {"hasFish": true, "confidence": "high", "description": "fish in a bucket"}
- Person with no fish = {"hasFish": false, "confidence": "high", "description": "person without any fish"}
- Aquarium with fish = {"hasFish": false, "confidence": "medium", "description": "aquarium - not a catch photo"}`
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
      console.log('[FishEditor] Detection API error');
      // If detection fails, allow the resize to proceed (fail gracefully)
      return { hasFish: true, confidence: 'low' };
    }

    const data = await response.json();
    const text = data.output?.[0]?.content?.[0]?.text || data.choices?.[0]?.message?.content || '';

    console.log('[FishEditor] Detection response:', text);

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const result: FishDetectionResult = {
          hasFish: parsed.hasFish === true,
          confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
        };

        if (!result.hasFish && parsed.description) {
          result.suggestion = parsed.description;
        }

        console.log('[FishEditor] Detection result:', result);
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
 * Generate the optimal prompt for Flux Kontext based on scale
 * Kontext works best with direct, specific editing instructions
 * Uses precise percentage-based language for accurate resizing
 */
function generateFluxPrompt(scale: number): string {
  const isShrinking = scale < 1;

  // Calculate the percentage change for clear instructions
  const percentageChange = Math.abs(Math.round((1 - scale) * 100));

  if (isShrinking) {
    if (scale <= 0.5) {
      // 50% scale = reduce to half the original size
      // Allow hands to adjust naturally to hold the smaller fish
      return `Resize the fish to be exactly half its current size - reduce it by 50%. The fish should be noticeably smaller but still clearly visible and proportional. Adjust the person's hands and arms naturally to hold the smaller fish correctly - they should grip the smaller fish realistically, not hold empty air. Keep the person's face, body, clothing, background, water, and lighting unchanged.`;
    } else if (scale <= 0.75) {
      // 75% scale = reduce by 25%
      return `Make the fish about 25% smaller than it currently is. Reduce the fish size modestly - it should look slightly smaller but still a respectable catch. Adjust the hands slightly if needed to naturally hold the smaller fish. Keep the person's face, body, background, and all other elements exactly the same.`;
    } else {
      // Anything between 0.75 and 1.0
      return `Make the fish slightly smaller - reduce it by about ${percentageChange}%. A subtle size reduction. Keep everything else exactly the same - the person, background, lighting, and composition.`;
    }
  } else {
    if (scale >= 3.0) {
      // 3x = 300% of original size (a truly massive fish)
      return `DRAMATICALLY enlarge the fish to be 3 times its current size - it should become a MASSIVE trophy fish that looks almost comically huge. Triple the fish's length and width. This is a 300% scale increase - the fish needs to be enormously bigger, like a record-breaking catch. Make it impressively, unmistakably larger. Keep the person, their pose, hands, arms, background, and lighting exactly the same. Only enlarge the fish to triple its original dimensions.`;
    } else if (scale >= 2.0) {
      // 2x = 100% increase (double)
      return `Double the size of the fish - make it 2 times larger than it currently is. It should look like an impressive trophy catch, twice as big. Keep the person, their pose, hands, background exactly the same.`;
    } else if (scale >= 1.5) {
      // 1.5x = 50% increase
      return `Increase the fish size by 50% - make it 1.5 times larger. A noticeably bigger catch. Keep the person, their pose, hands, background, and all other elements exactly the same.`;
    } else {
      // Between 1.0 and 1.5
      const increasePercent = Math.round((scale - 1) * 100);
      return `Make the fish ${increasePercent}% larger than it currently is. A modest size increase. Keep everything else exactly the same - the person, background, lighting, and composition.`;
    }
  }
}

/**
 * Poll Flux API for result
 */
async function pollFluxResult(pollingUrl: string, maxAttempts: number = 60): Promise<FluxPollResponse> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[FishEditor] Polling attempt ${attempt + 1}/${maxAttempts}...`);

    const response = await fetch(pollingUrl, {
      method: 'GET',
      headers: {
        'x-key': FLUX_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[FishEditor] Poll error:', errorText);
      throw new Error(`Polling failed: ${response.status}`);
    }

    const data: FluxPollResponse = await response.json();
    console.log('[FishEditor] Poll status:', data.status);

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
  scale: number
): Promise<FishEditResult> {
  try {
    console.log('[FishEditor] Starting Flux fish resize');
    console.log('[FishEditor] Scale:', scale);

    // If scale is 1, return original
    if (scale === 1) {
      return { success: true, editedImageUri: imageUri };
    }

    // Read image as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Generate prompt based on scale
    const prompt = generateFluxPrompt(scale);
    console.log('[FishEditor] Flux prompt:', prompt);

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

    console.log('[FishEditor] Flux response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[FishEditor] Flux API Error:', errorText);

      if (response.status === 402) {
        return { success: false, error: 'Insufficient Flux API credits', errorType: 'api_error' };
      }

      return { success: false, error: `Flux API error: ${response.status}`, errorType: 'api_error' };
    }

    const data = await response.json();
    console.log('[FishEditor] Flux initial response:', JSON.stringify(data));

    if (!data.polling_url && !data.id) {
      console.log('[FishEditor] No polling URL in response');
      return { success: false, error: 'Invalid response from Flux API', errorType: 'api_error' };
    }

    // Poll for result
    const pollingUrl = data.polling_url || `https://api.bfl.ai/v1/get_result?id=${data.id}`;
    console.log('[FishEditor] Polling URL:', pollingUrl);

    const result = await pollFluxResult(pollingUrl);

    if (!result.result?.sample) {
      return { success: false, error: 'No image in Flux result', errorType: 'api_error' };
    }

    // Download the result image
    console.log('[FishEditor] Downloading result image...');
    const localUri = await downloadImage(result.result.sample);

    console.log('[FishEditor] Success! Image saved to:', localUri);
    return { success: true, editedImageUri: localUri };

  } catch (error) {
    console.log('[FishEditor] Error:', error);
    return { success: false, error: String(error), errorType: 'api_error' };
  }
}

/**
 * Main entry point for fish resizing - now uses Flux
 */
export async function resizeFish(imageUri: string, scale: number): Promise<FishEditResult> {
  return resizeFishWithFlux(imageUri, scale);
}
