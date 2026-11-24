// Gemini API client (Google AI Studio key). Runs from the browser with fetch.

const API = 'https://generativelanguage.googleapis.com/v1beta';

// Preferred models, best first. The app checks which ones your key can use,
// and falls back to the next one if a model is busy, out of free quota or retired.
// Gemini 2.x models are left out on purpose: Google has closed them to new keys.
const PREFERRED = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

const modelCache = new Map(); // one list per API key

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, key, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, ...(init.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((data.error && data.error.message) || 'Gemini returned error ' + r.status);
    err.status = r.status;
    err.details = (data.error && data.error.details) || [];
    throw err;
  }
  return data;
}

// How long Gemini asks us to wait after a 429, in seconds (0 if it doesn't say).
function retryDelay(e) {
  const info = (e.details || []).find(d => String(d['@type'] || '').endsWith('RetryInfo'));
  const m = info && String(info.retryDelay || '').match(/([\d.]+)s/);
  return m ? Math.ceil(parseFloat(m[1])) : 0;
}

const isQuota = e => e && e.status === 429;
// Errors that mean "this key can't be used at all, try the next key".
const isKeyProblem = e => e && (e.status === 401 || e.status === 403 ||
  /API key not valid|API_KEY_INVALID|API key expired|referer|referrer|PERMISSION_DENIED/i.test(e.message || ''));
// Errors that mean "this model can't be used, try another one".
const isModelProblem = e => e && (e.status === 404 || e.status === 500 || e.status === 503 ||
  /no longer available|not found|not supported|deprecated|is not available|unsupported model/i.test(e.message || ''));

// Ask Gemini which models this key can use, then order them by preference.
export async function pickModels(key, preferred) {
  if (modelCache.has(key)) return modelCache.get(key);
  const wanted = [...new Set([preferred, ...PREFERRED].filter(Boolean))];
  let list = wanted;
  try {
    const data = await call('/models?pageSize=200', key);
    const available = new Set((data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')));
    const ordered = wanted.filter(m => available.has(m));
    if (!ordered.length) {
      // None of our favourites exist anymore: take the newest Flash models the key offers.
      ordered.push(...[...available]
        .filter(m => /^gemini-[3-9].*flash/.test(m) && !/(image|tts|live|audio|transcribe|omni|preview)/.test(m))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })));
    }
    if (ordered.length) list = ordered;
  } catch (e) {
    if (isKeyProblem(e) || e.status === 400) throw e;
  }
  modelCache.set(key, list);
  return list;
}

function friendly(e, usingBuiltInKey) {
  const m = e.message || '';
  if (/API key not valid|API_KEY_INVALID|API key expired/i.test(m)) return new Error(usingBuiltInKey ? 'The site\'s Gemini key isn\'t working (it may be invalid or expired).' : 'That Gemini API key is not valid. Check it in Google AI Studio.');
  if (/referer|referrer/i.test(m)) return new Error('The Gemini key is blocked for this website. Add this site to the key\'s allowed websites in Google Cloud.');
  if (isQuota(e)) return new Error(usingBuiltInKey
    ? 'Gemini is a bit busy right now. Please wait a minute and try again.'
    : 'The free quota for your Gemini key is used up right now. Wait a minute (or until tomorrow) and try again.');
  if (isModelProblem(e)) return new Error(usingBuiltInKey
    ? 'Gemini isn\'t available right now. Please try again in a little while.'
    : 'None of the Gemini models TextLens uses are available for your key right now. Try again later.');
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

// Remembers which key + model combinations recently ran out of quota, so the
// next click skips them instead of waiting on them again. key|model -> time (ms) when usable again
const cooling = new Map();

async function generate(key, model, prompt) {
  const data = await call(`/models/${encodeURIComponent(model)}:generateContent`, key, {
    method: 'POST',
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    }),
  });
  const cand = (data.candidates || [])[0];
  if (!cand) throw new Error((data.promptFeedback && data.promptFeedback.blockReason) ? 'Gemini blocked this text (' + data.promptFeedback.blockReason + ').' : 'Gemini sent an empty reply.');
  const out = (cand.content && cand.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Gemini\'s reply could not be read.');
  return JSON.parse(m[0]);
}

// keys: one or more API keys, best first. For every model (best first) it tries
// each key in turn, so a backup key is used as soon as the main one runs out.
export async function summarize({ keys, usingBuiltInKey, preferredModel, text, length, language, onModel, onWait }) {
  keys = [...new Set((keys || []).filter(Boolean))];
  if (!keys.length) throw new Error('No Gemini API key is set.');
  const prompt = buildPrompt(text, length, language);
  let keyErr = null, quotaErr = null, lastErr = null;

  const plans = [];
  for (let i = 0; i < keys.length; i++) {
    try { plans.push({ key: keys[i], n: i + 1, models: await pickModels(keys[i], preferredModel), dead: false }); }
    catch (e) { keyErr = e; }
  }
  if (!plans.length) throw friendly(keyErr, usingBuiltInKey);

  const wanted = [...new Set([preferredModel, ...PREFERRED].filter(Boolean))];
  const rank = m => { const i = wanted.indexOf(m); return i < 0 ? 99 : i; };
  const order = [...new Set(plans.flatMap(p => p.models))].sort((a, b) => rank(a) - rank(b));

  for (let round = 0; round < 2; round++) {
    let soonest = Infinity, coolingSkipped = false;
    for (const model of order) {
      for (const p of plans) {
        if (p.dead || !p.models.includes(model)) continue;
        const ck = p.key + '|' + model, until = cooling.get(ck) || 0;
        if (until > Date.now()) { coolingSkipped = true; soonest = Math.min(soonest, Math.ceil((until - Date.now()) / 1000)); continue; }
        try {
          onModel && onModel(model, p.n, keys.length);
          const j = await generate(p.key, model, prompt);
          j.model = model;
          j.keyNumber = p.n;
          j.keyCount = keys.length;
          return j;
        } catch (e) {
          if (isQuota(e)) {
            quotaErr = e;
            const wait = retryDelay(e) || 60;
            cooling.set(ck, Date.now() + wait * 1000);
            soonest = Math.min(soonest, wait);
            continue; // same model on the next key, then the next model
          }
          if (isKeyProblem(e)) { keyErr = e; p.dead = true; continue; } // this key is unusable: skip it
          if (isModelProblem(e)) { lastErr = e; p.models = p.models.filter(x => x !== model); continue; }
          throw friendly(e, usingBuiltInKey); // e.g. Gemini blocked the text: no point retrying
        }
      }
    }
    if (coolingSkipped && !quotaErr) quotaErr = Object.assign(new Error('busy'), { status: 429 });
    // Every key is busy, but only for a few seconds: wait once and try again.
    if (round === 0 && quotaErr && soonest <= 20) {
      onWait && onWait(soonest);
      await sleep(soonest * 1000 + 300);
      continue;
    }
    break;
  }
  // Report the most useful reason: running out of quota beats "model unavailable".
  throw friendly(quotaErr || lastErr || keyErr || new Error('No Gemini model was available.'), usingBuiltInKey);
}
