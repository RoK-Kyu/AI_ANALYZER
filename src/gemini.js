// Gemini API client (Google AI Studio key). Runs from the browser with fetch.

const API = 'https://generativelanguage.googleapis.com/v1beta';

// Preferred models, best first. The app checks which ones your key can use,
// and falls back to the next one if a model is busy or out of free quota.
const PREFERRED = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

let modelCache = null;

async function call(path, key, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, ...(init.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((data.error && data.error.message) || 'Gemini returned error ' + r.status);
    err.status = r.status;
    throw err;
  }
  return data;
}

// Ask Gemini which models this key can use, then order them by preference.
export async function pickModels(key, preferred) {
  if (modelCache) return modelCache;
  const wanted = [...new Set([preferred, ...PREFERRED].filter(Boolean))];
  try {
    const data = await call('/models?pageSize=200', key);
    const available = new Set((data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')));
    const ordered = wanted.filter(m => available.has(m));
    if (!ordered.length) {
      // None of our favourites exist anymore: take any Flash model the key offers.
      ordered.push(...[...available].filter(m => /flash/.test(m) && !/(image|tts|live|audio|transcribe|omni)/.test(m)).sort().reverse());
    }
    modelCache = ordered.length ? ordered : wanted;
  } catch (e) {
    if (e.status === 400 || e.status === 401 || e.status === 403) throw friendly(e);
    modelCache = wanted;
  }
  return modelCache;
}

function friendly(e) {
  const m = e.message || '';
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return new Error('That Gemini API key is not valid. Check it in Google AI Studio.');
  if (/referer|referrer/i.test(m)) return new Error('This API key is restricted to other websites. Add this site to the key\'s allowed websites in Google Cloud.');
  if (e.status === 429) return new Error('Gemini\'s free quota is used up for now. Wait a minute (or until tomorrow) and try again.');
  return e;
}

export function buildPrompt(text, length, language) {
  const len = {
    short: '2 to 3 sentences, and 3 key points',
    medium: 'one paragraph of 4 to 6 sentences, and 4 to 6 key points',
    long: 'two or three paragraphs, and 6 to 8 key points',
  }[length];
  const lang = language === 'same' ? 'the same language as the text' : 'English';
  const MAX = 120000;
  const body = text.length > MAX ? text.slice(0, MAX) + '\n[...text truncated...]' : text;
  return `You are the summarization engine of a text-analysis app. Read the document between the <doc> tags and reply with ONLY a JSON object with these keys:
"summary": an abstractive summary of ${len} (paragraphs separated by \\n\\n), written in ${lang};
"key_points": array of short strings (the key points), in ${lang};
"language": the language the document is written in;
"tone": 1 to 3 words describing the tone;
"sentiment": one of "positive","neutral","negative","mixed";
"topics": array of 3 to 6 short topic labels.
Do not add facts that are not in the document.
<doc>
${body}
</doc>`;
}

export async function summarize({ key, preferredModel, text, length, language, onModel }) {
  const models = await pickModels(key, preferredModel);
  let lastErr;
  for (const model of models) {
    try {
      onModel && onModel(model);
      const data = await call(`/models/${encodeURIComponent(model)}:generateContent`, key, {
        method: 'POST',
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(text, length, language) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      });
      const cand = (data.candidates || [])[0];
      if (!cand) throw new Error((data.promptFeedback && data.promptFeedback.blockReason) ? 'Gemini blocked this text (' + data.promptFeedback.blockReason + ').' : 'Gemini sent an empty reply.');
      const out = (cand.content && cand.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Gemini\'s reply could not be read.');
      const j = JSON.parse(m[0]);
      j.model = model;
      return j;
    } catch (e) {
      lastErr = e;
      // Busy, out of quota or model missing: try the next model. Anything else: stop.
      if (!(e.status === 429 || e.status === 404 || e.status === 503 || e.status === 500)) throw friendly(e);
    }
  }
  throw friendly(lastErr || new Error('No Gemini model was available.'));
}
