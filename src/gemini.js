// Gemini API client (Google AI Studio key). Runs from the browser with fetch.

const API = 'https://generativelanguage.googleapis.com/v1beta';

// Preferred models, best first. The app checks which ones your key can use,
// and falls back to the next one if a model is busy, out of free quota or retired.
// Gemini 2.x models are left out on purpose: Google has closed them to new keys.
const PREFERRED = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

const modelCache = new Map(); // one list per API key

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every request gets a time limit, so a slow or silent server can't freeze the app.
async function call(path, key, init = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r, data;
  try {
    r = await fetch(API + path, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key, ...(init.headers || {}) } });
    data = await r.json().catch(() => ({}));
  } catch (e) {
    const err = new Error(e.name === 'AbortError' ? `Gemini took longer than ${Math.round(timeoutMs / 1000)} seconds to answer.` : 'Could not reach Gemini (' + (e.message || 'network error') + ').');
    err.status = e.name === 'AbortError' ? 408 : 0;
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

// "Busy" errors: out of quota, or Google's servers overloaded. Waiting usually fixes them.
const isQuota = e => e && (e.status === 429 || e.status === 500 || e.status === 503 || e.status === 408 || e.status === 0 ||
  /overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|try again later/i.test(e.message || ''));
// Errors that mean "this key can't be used at all, try the next key".
const isKeyProblem = e => e && (e.status === 401 || e.status === 403 ||
  /API key not valid|API_KEY_INVALID|API key expired|referer|referrer|PERMISSION_DENIED/i.test(e.message || ''));
// Errors that mean "this model can't be used, try another one".
const isModelProblem = e => e && (e.status === 404 ||
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
  if (e.slow || e.status === 408) return new Error('Gemini is very slow right now and didn\'t answer in time. Please try again in a few minutes. (The Quick pick tab still has a summary.)');
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

const noThinkingSetting = new Set(); // models that rejected the thinking setting
const GENERATE_TIMEOUT = 45000;
// The whole summary (every key and model together) gets at most this long,
// so a slow day at Google never leaves the app "reading" for minutes.
const TOTAL_BUDGET = 90000;

async function generate(key, model, prompt, timeoutMs = GENERATE_TIMEOUT) {
  const config = { responseMimeType: 'application/json', temperature: 0.4 };
  // Summaries don't need deep reasoning: asking Gemini to think less makes it answer much faster.
  if (!noThinkingSetting.has(model)) config.thinkingConfig = { thinkingLevel: 'low' };
  let data;
  try {
    data = await call(`/models/${encodeURIComponent(model)}:generateContent`, key, {
      method: 'POST',
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: config }),
    }, timeoutMs);
  } catch (e) {
    if (e.status === 400 && /thinking/i.test(e.message || '') && config.thinkingConfig) {
      noThinkingSetting.add(model); // this model doesn't accept it: ask again without it
      return generate(key, model, prompt, timeoutMs);
    }
    throw e;
  }
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
  const deadline = Date.now() + TOTAL_BUDGET;
  const left = () => deadline - Date.now();
  const slowErr = () => Object.assign(new Error('Gemini is very slow right now. Please try again in a few minutes.'), { status: 408, slow: true });
  let keyErr = null, quotaErr = null, lastErr = null;
  const attempts = []; // what Google said each time, shown under "Technical details"
  const note = (n, model, e) => attempts.push(`Key ${n} · ${model || 'model list'} · ${e.status ? 'HTTP ' + e.status : 'error'}: ${String(e.message || '').slice(0, 240)}`);
  const fail = e => { const f = friendly(e, usingBuiltInKey); f.attempts = attempts; return f; };

  const plans = [];
  for (let i = 0; i < keys.length; i++) {
    try { plans.push({ key: keys[i], n: i + 1, models: await pickModels(keys[i], preferredModel), dead: false }); }
    catch (e) { keyErr = e; note(i + 1, null, e); }
  }
  if (!plans.length) throw fail(keyErr);

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
        if (left() < 8000) throw fail(slowErr()); // out of time: stop instead of trying more
        try {
          onModel && onModel(model, p.n, keys.length);
          const j = await generate(p.key, model, prompt, Math.min(GENERATE_TIMEOUT, left()));
          j.model = model;
          j.keyNumber = p.n;
          j.keyCount = keys.length;
          return j;
        } catch (e) {
          note(p.n, model, e);
          if (isKeyProblem(e)) { keyErr = e; p.dead = true; continue; } // this key is unusable: skip it
          if (e.status === 408) {
            // A timeout means this model is slow for everyone: skip it on the other keys too.
            quotaErr = e;
            for (const q of plans) cooling.set(q.key + '|' + model, Date.now() + 60000);
            continue;
          }
          if (isQuota(e)) {
            quotaErr = e;
            const wait = retryDelay(e) || (e.status === 429 ? 60 : e.status === 408 ? 30 : 8);
            cooling.set(ck, Date.now() + wait * 1000);
            soonest = Math.min(soonest, wait);
            continue; // same model on the next key, then the next model
          }
          if (isModelProblem(e)) { lastErr = e; p.models = p.models.filter(x => x !== model); continue; }
          throw fail(e); // e.g. Gemini blocked the text: no point retrying
        }
      }
    }
    if (coolingSkipped && !quotaErr) quotaErr = Object.assign(new Error('busy'), { status: 429 });
    // Every key is busy, but only for a few seconds: wait once and try again.
    if (round === 0 && quotaErr && soonest <= 20 && left() > soonest * 1000 + 15000) {
      onWait && onWait(soonest);
      await sleep(soonest * 1000 + 300);
      continue;
    }
    break;
  }
  // Report the most useful reason: running out of quota beats "model unavailable".
  throw fail(quotaErr || lastErr || keyErr || new Error('No Gemini model was available.'));
}
