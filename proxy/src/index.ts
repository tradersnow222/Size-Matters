/// <reference types="@cloudflare/workers-types" />

/**
 * Size Matters — backend proxy (Cloudflare Worker)
 * -------------------------------------------------
 * Holds the AI keys server-side so they are NOT shipped in the app binary, and centralizes
 * the resize prompt + model choice so they can be tuned WITHOUT an app release. The app calls
 * POST /detect and POST /resize here instead of calling Google directly.
 *
 * Deploy: see ../README.md. Secrets (wrangler secret put): GEMINI_API_KEY, and optionally
 * APP_SHARED_SECRET. Optional KV namespace `RATE_LIMIT` enables a per-IP daily cap.
 */

export interface Env {
  GEMINI_API_KEY: string;
  RESIZE_MODEL?: string;
  DETECT_MODEL?: string;
  MAX_RESIZE_ATTEMPTS?: string;
  DAILY_FREE_LIMIT?: string;
  APP_SHARED_SECRET?: string;
  RATE_LIMIT?: KVNamespace;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_RESIZE_MODEL = 'gemini-3.1-flash-image';
const DEFAULT_DETECT_MODEL = 'gemini-2.5-flash';

/**
 * Anatomy guardrail (kept in sync with the client `fishEditor.ts`): every resize is verified
 * for an extra/phantom hand and regenerated (best-of-N) if it fails, so the server never
 * returns a 3-handed image. Set VERIFY_RESIZE=false to disable. Override the cap with the
 * MAX_RESIZE_ATTEMPTS env var if you want fewer paid retries.
 */
const VERIFY_RESIZE = true;
const DEFAULT_MAX_RESIZE_ATTEMPTS = 3;
const RETRY_REINFORCE =
  'CRITICAL: a previous attempt incorrectly added an extra hand. The person has a fixed number of hands — do NOT add any third, duplicate, floating or disembodied hand, arm or finger. Reproduce exactly the hands shown in the original photo and nothing more.';

const SAFETY = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
].map((category) => ({ category, threshold: 'BLOCK_NONE' }));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Server-authoritative resize prompt (kept identical to the client's fallback copy).
 * Edit it HERE to tune resize behavior live — no app release needed.
 */
function generateResizePrompt(scale: number, species?: string): string {
  const isShrinking = scale < 1;
  const cleanSpecies = species?.trim();
  const fishName = cleanSpecies && cleanSpecies.length > 0 ? cleanSpecies : 'fish';

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

  const identityLock = `Keep it the exact same ${fishName}: the same species with the same colors, markings, spots, scales, fins, tail and head, and the same body proportions. Only its overall size changes — do not swap it for a different kind of fish.`;
  // GRIP: keep the EXISTING hands; "re-posing arms" / "bring in a second hand" is what makes
  // the model hallucinate a third hand. The fish simply grows past the current grip instead.
  const gripNote = isShrinking
    ? `Keep the person's existing hands exactly where they are, with the same number of hands, arms and fingers as in the original photo. Only the fingers already touching the ${fishName} may close in slightly so the now-smaller ${fishName} still sits naturally in the same grip, leaving no empty gap where the bigger fish used to be. Do not add, remove, duplicate or relocate any hand or arm.`
    : `Keep the person's existing hands and arms exactly as they are in the original photo — the same number of hands, in the same places. Do NOT add a second or third hand and do NOT introduce any new arm: simply let the enlarged ${fishName} extend beyond the current grip, the way a real big fish sticks out well past the hand holding it. Only the fingers already in contact with the ${fishName} may adjust to wrap around its larger body.`;
  // ANATOMY GUARDRAIL — the hard rule that prevents the "extra hand" artifact.
  const anatomyLock = `The person must stay anatomically identical to the original: exactly the same arms, hands and fingers, in the same number and the same positions. Never generate an extra, third, duplicated, floating or disembodied hand, arm or finger anywhere in the image.`;
  const sceneLock = `Keep the person's face, expression, hair, hat and clothing the same, and keep the background, water, sky and lighting exactly the same. The only thing that changes is the fish's size — and, at most, how the fingers already holding it wrap around it.`;
  const realism = `Match the lighting, shadows, color and grain so the result looks like a completely real, un-edited photograph.`;

  return `${sizeInstruction} ${identityLock} ${gripNote} ${anatomyLock} ${sceneLock} ${realism}`;
}

/** Per-IP daily cap. No-op unless a RATE_LIMIT KV namespace is bound. */
async function underRateLimit(req: Request, env: Env): Promise<boolean> {
  if (!env.RATE_LIMIT) return true;
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${ip}:${day}`;
  const limit = parseInt(env.DAILY_FREE_LIMIT || '50', 10);
  const current = parseInt((await env.RATE_LIMIT.get(key)) || '0', 10);
  if (current >= limit) return false;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

async function handleDetect(req: Request, env: Env): Promise<Response> {
  const { imageBase64 } = (await req.json()) as { imageBase64?: string };
  if (!imageBase64) return json({ error: 'missing imageBase64' }, 400);

  const instruction =
    'Analyze this image as if screening a fishing catch photo. Is there a real fish clearly visible that ' +
    'someone is holding or displaying? Also identify the fish species/type as specifically as you can ' +
    '(e.g. "largemouth bass", "rainbow trout", "bluegill"); if you cannot tell exactly, give the closest ' +
    'general type. If there is no fish, use an empty string for species. An aquarium, a drawing, or a photo ' +
    'with no held fish is NOT a catch photo. Set "description" to a brief note of what you see.';

  const body = {
    contents: [{ role: 'user', parts: [{ text: instruction }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] }],
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
    safetySettings: SAFETY,
  };

  const model = env.DETECT_MODEL || DEFAULT_DETECT_MODEL;
  const r = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  // Detection is non-blocking for the app: on any failure, let the resize proceed.
  if (!r.ok) return json({ hasFish: true, confidence: 'low' });

  const data: any = await r.json();
  const text: string = (data.candidates?.[0]?.content?.parts || []).find((p: any) => typeof p?.text === 'string')?.text || '';
  try {
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : {};
    return json({
      hasFish: parsed.hasFish === true,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium',
      species: typeof parsed.species === 'string' && parsed.species.trim() ? parsed.species.trim() : undefined,
      suggestion: parsed.hasFish === false ? parsed.description : undefined,
    });
  } catch {
    return json({ hasFish: true, confidence: 'low' });
  }
}

/** One Nano Banana resize call. Returns the inline image or an HTTP error status. */
async function geminiResizeOnce(
  env: Env, imageBase64: string, prompt: string, aspectRatio?: string,
): Promise<{ ok: true; imgData: string; mime: string } | { ok: false; status: number; detail: string }> {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
    },
    safetySettings: SAFETY,
  };
  const model = env.RESIZE_MODEL || DEFAULT_RESIZE_MODEL;
  const r = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, status: r.status, detail: (await r.text()).slice(0, 300) };

  const data: any = await r.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const part = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
  const imgData = part?.inlineData?.data ?? part?.inline_data?.data;
  if (!imgData) {
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'no_image';
    return { ok: false, status: 502, detail: String(reason) };
  }
  return { ok: true, imgData, mime: part?.inlineData?.mimeType ?? 'image/png' };
}

/**
 * Extra/phantom-hand check. Compares ORIGINAL vs EDITED with the cheap vision model.
 * Fails OPEN (clean) on any error so a verifier hiccup never blocks a good resize.
 */
async function verifyResizeClean(
  env: Env, originalBase64: string, editedBase64: string, editedMime: string,
): Promise<{ clean: boolean; score: number; note: string }> {
  try {
    const instruction =
      'You are a strict quality checker for an app that enlarges the fish in a fishing photo. The FIRST image is ' +
      'the ORIGINAL; the SECOND is the EDITED version. In the edited image the fish may be a different size, but the ' +
      'PERSON must be anatomically identical. Inspect the hands, arms and fingers closely — the most common AI ' +
      'failure is adding a THIRD hand or a duplicated/floating/disembodied hand. Report: handCount = human hands ' +
      'visible in the EDITED image; extraOrPhantomHand = true if there is a third hand or any duplicated, floating or ' +
      'disembodied hand/arm that does not belong to the one person; deformed = true if any hand/finger/limb is ' +
      'malformed, merged, or has the wrong number of fingers; realistic = true if it still looks like a real photo. ' +
      'Judge only what you can see.';
    const body = {
      contents: [{ role: 'user', parts: [
        { text: instruction },
        { inlineData: { mimeType: 'image/jpeg', data: originalBase64 } },
        { inlineData: { mimeType: editedMime, data: editedBase64 } },
      ] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            handCount: { type: 'INTEGER' },
            extraOrPhantomHand: { type: 'BOOLEAN' },
            deformed: { type: 'BOOLEAN' },
            realistic: { type: 'BOOLEAN' },
            note: { type: 'STRING' },
          },
          required: ['handCount', 'extraOrPhantomHand', 'deformed', 'realistic', 'note'],
        },
      },
      safetySettings: SAFETY,
    };
    const model = env.DETECT_MODEL || DEFAULT_DETECT_MODEL;
    const r = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { clean: true, score: 0, note: `verify http ${r.status}` };
    const data: any = await r.json();
    const text: string = (data.candidates?.[0]?.content?.parts || []).find((p: any) => typeof p?.text === 'string')?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { clean: true, score: 0, note: 'verify unparsed' };
    const v = JSON.parse(m[0]);
    const handCount = typeof v.handCount === 'number' ? v.handCount : 2;
    const extra = v.extraOrPhantomHand === true;
    const deformed = v.deformed === true;
    const realistic = v.realistic !== false;
    const clean = !extra && !deformed && handCount <= 2;
    const score = (extra ? 4 : 0) + (handCount > 2 ? 3 : 0) + (deformed ? 2 : 0) + (realistic ? 0 : 1);
    return { clean, score, note: typeof v.note === 'string' ? v.note : '' };
  } catch (e) {
    return { clean: true, score: 0, note: 'verify error' };
  }
}

async function handleResize(req: Request, env: Env): Promise<Response> {
  const { imageBase64, scale, species, aspectRatio } = (await req.json()) as {
    imageBase64?: string; scale?: number; species?: string; aspectRatio?: string;
  };
  if (!imageBase64 || typeof scale !== 'number') return json({ error: 'missing imageBase64 or scale' }, 400);
  if (scale === 1) return json({ imageBase64, mimeType: 'image/jpeg' });

  const basePrompt = generateResizePrompt(scale, species);
  const maxAttempts = VERIFY_RESIZE
    ? Math.max(1, parseInt(env.MAX_RESIZE_ATTEMPTS || String(DEFAULT_MAX_RESIZE_ATTEMPTS), 10) || DEFAULT_MAX_RESIZE_ATTEMPTS)
    : 1;

  let best: { imgData: string; mime: string; score: number } | null = null;
  let lastErr: { status: number; detail: string } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prompt = attempt === 0 ? basePrompt : `${basePrompt} ${RETRY_REINFORCE}`;
    const once = await geminiResizeOnce(env, imageBase64, prompt, aspectRatio);
    if (!once.ok) {
      lastErr = { status: once.status, detail: once.detail };
      if (best) break;
      // Auth/quota errors won't improve on retry; surface immediately.
      if (once.status === 400 || once.status === 401 || once.status === 403) break;
      continue;
    }
    if (!VERIFY_RESIZE) { best = { imgData: once.imgData, mime: once.mime, score: 0 }; break; }

    const verdict = await verifyResizeClean(env, imageBase64, once.imgData, once.mime);
    if (verdict.clean) { best = { imgData: once.imgData, mime: once.mime, score: verdict.score }; break; }
    if (!best || verdict.score < best.score) best = { imgData: once.imgData, mime: once.mime, score: verdict.score };
  }

  if (!best) {
    const status = lastErr?.status ?? 502;
    return json({ error: 'resize_failed', status, detail: lastErr?.detail ?? 'no image' }, status === 429 ? 429 : 502);
  }
  return json({ imageBase64: best.imgData, mimeType: best.mime });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    // Lightweight gate (an extractable shared secret raises the bar; App Attest is the real upgrade).
    if (env.APP_SHARED_SECRET && req.headers.get('x-app-secret') !== env.APP_SHARED_SECRET) {
      return json({ error: 'unauthorized' }, 401);
    }
    if (!(await underRateLimit(req, env))) return json({ error: 'rate_limited' }, 429);

    const url = new URL(req.url);
    try {
      if (url.pathname === '/detect') return await handleDetect(req, env);
      if (url.pathname === '/resize') return await handleResize(req, env);
    } catch (e) {
      return json({ error: 'bad_request', detail: String(e) }, 400);
    }
    return json({ error: 'not_found' }, 404);
  },
};
