// Local text analysis: runs instantly in the browser, no AI needed.

const STOP = new Set(("a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could did do does doing don't down during each few for from further had has have having he her here hers herself him himself his how i if in into is isn't it it's its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that that's the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also may might must shall us one two many much even well like get got however within without upon via per etc i'm you're we're they're i've we've ve ll re s t d").split(/\s+/));

export const tokens = t => (t.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).map(w => w.replace(/’/g, "'"));

export const sentencesOf = t => (t.replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)/g) || [])
  .map(s => s.trim()).filter(s => /[\p{L}\p{N}]/u.test(s));

function syllables(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

export const isContent = w => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w);

export function analyze(text) {
  const words = tokens(text), sents = sentencesOf(text);
  const paras = text.split(/\n\s*\n/).filter(p => p.trim()).length;
  const freq = new Map();
  words.filter(isContent).forEach(w => freq.set(w, (freq.get(w) || 0) + 1));
  const ranked = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const bi = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    if (isContent(a) && isContent(b)) { const k = a + ' ' + b; bi.set(k, (bi.get(k) || 0) + 1); }
  }
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const W = words.length || 1, S = sents.length || 1;
  return {
    words: words.length,
    unique: new Set(words).size,
    chars: text.length,
    charsNoSp: text.replace(/\s/g, '').length,
    sents: sents.length,
    paras,
    avgWord: words.length ? words.join('').length / words.length : 0,
    avgSent: sents.length ? words.length / sents.length : 0,
    readMin: words.length / 230,
    speakMin: words.length / 140,
    diversity: words.length ? new Set(words).size / words.length : 0,
    top: ranked.slice(0, 10),
    cloud: ranked.slice(0, 24),
    bigrams: [...bi].filter(x => x[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 8),
    fre: 206.835 - 1.015 * (W / S) - 84.6 * (syl / W),
    fk: 0.39 * (W / S) + 11.8 * (syl / W) - 15.59,
    longest: [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 4),
    sentList: sents,
    freq,
  };
}

// Luhn-style extractive summary: picks the highest-scoring original sentences.
export function extractive(a, n) {
  const s = a.sentList;
  if (s.length <= n) return s;
  const max = Math.max(1, ...a.freq.values());
  return s.map((x, i) => {
    const t = tokens(x).filter(isContent);
    const sc = t.reduce((m, w) => m + (a.freq.get(w) || 0) / max, 0) / Math.sqrt(Math.max(t.length, 1)) + (i === 0 ? 0.3 : 0);
    return { i, x, sc };
  }).sort((p, q) => q.sc - p.sc).slice(0, n).sort((p, q) => p.i - q.i).map(o => o.x);
}

export const mins = m => m < 1 ? Math.max(1, Math.round(m * 60)) + ' sec' : Math.round(m) + ' min';

export const readLabel = f => f >= 90 ? 'Very easy' : f >= 80 ? 'Easy' : f >= 70 ? 'Fairly easy' : f >= 60 ? 'Standard' : f >= 50 ? 'Fairly difficult' : f >= 30 ? 'Difficult' : 'Very difficult';
