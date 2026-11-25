// Local text analysis: runs instantly in the browser, no AI needed.

const STOP = new Set(("a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could did do does doing don't down during each few for from further had has have having he her here hers herself him himself his how i if in into is isn't it it's its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that that's the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also may might must shall us one two many much even well like get got however within without upon via per etc i'm you're we're they're i've we've ve ll re s t d").split(/\s+/));

const TOKEN_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
export const tokens = t => (t.toLowerCase().match(TOKEN_RE) || []).map(w => w.replace(/’/g, "'"));

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

// ---------- Light stemmer ----------
// Cuts common English endings so different forms of a word are counted together:
//   -sses -> -ss (classes stays "class" via -es rule), -ies -> -y (studies -> study),
//   -xes/-zes/-ches/-shes/-sses -> drop "es" (boxes -> box), other -s -> drop "s" (students -> student),
//   -ing -> drop (reading -> read, running -> run), -ed -> drop (asked -> ask, studied -> study).
// Words ending in -ss, -us or -is (class, status, analysis) keep their "s".
// After cutting -ing/-ed, if the text also contains the stem + "e" (changing + change), they are joined.
const hasVowel = s => /[aeiouy]/.test(s);
const undouble = s => /([b-df-hj-km-np-tv-z])\1$/.test(s) && !/(ll|ss|zz)$/.test(s) ? s.slice(0, -1) : s;

function stripEnding(w) {
  if (w.length <= 3 || /[\d'-]/.test(w)) return { s: w, cut: false };
  if (w.endsWith('ies') && w.length > 4) return { s: w.slice(0, -3) + 'y', cut: false };
  if (/(?:x|z|ch|sh|ss)es$/.test(w)) return { s: w.slice(0, -2), cut: false };
  if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return { s: w.slice(0, -1), cut: false };
  if (w.endsWith('ing') && w.length >= 6) {
    const s = undouble(w.slice(0, -3));
    if (s.length >= 3 && hasVowel(s)) return { s, cut: true };
  }
  if (w.endsWith('ed') && w.length >= 5) {
    let s = w.slice(0, -2);
    if (s.endsWith('i')) return { s: s.slice(0, -1) + 'y', cut: false };
    s = undouble(s);
    if (s.length >= 3 && hasVowel(s) && !s.endsWith('e')) return { s, cut: true };
  }
  return { s: w, cut: false };
}

// Builds a function that maps each content word to the label of its group:
// the group's most frequent original form (so "students" and "student" both show as "students"
// when that form is used most). Also returns the forms in each group, for the spotlight.
function buildStemmer(contentWords) {
  const counts = new Map();
  contentWords.forEach(w => counts.set(w, (counts.get(w) || 0) + 1));
  const raw = new Map();
  for (const w of counts.keys()) raw.set(w, stripEnding(w));
  const known = new Set([...counts.keys(), ...[...raw.values()].map(r => r.s)]);
  const canon = new Map();
  for (const [w, r] of raw) canon.set(w, r.cut && known.has(r.s + 'e') ? r.s + 'e' : r.s);
  const groups = new Map(); // canonical stem -> Map(original form -> count)
  for (const [w, c] of counts) {
    const k = canon.get(w);
    if (!groups.has(k)) groups.set(k, new Map());
    groups.get(k).set(w, c);
  }
  const label = new Map(), stemOf = new Map(), forms = new Map();
  for (const [k, g] of groups) {
    const rep = [...g].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length || x[0].localeCompare(y[0]))[0][0];
    forms.set(rep, g);
    for (const w of g.keys()) { label.set(w, rep); stemOf.set(w, k); }
  }
  return { norm: w => label.get(w) || w, stemOf: w => stemOf.get(w) || w, forms };
}

export function analyze(text, opts = {}) {
  const words = tokens(text), sents = sentencesOf(text);
  const paras = text.split(/\n\s*\n/).filter(p => p.trim()).length;
  const content = words.filter(isContent);
  let norm = w => w, stemOf = w => w, forms = new Map();
  if (opts.stem) ({ norm, stemOf, forms } = buildStemmer(content));
  else content.forEach(w => { if (!forms.has(w)) forms.set(w, new Map([[w, 0]])); forms.get(w).set(w, forms.get(w).get(w) + 1); });

  const freq = new Map();
  content.forEach(w => { const n = norm(w); freq.set(n, (freq.get(n) || 0) + 1); });
  const ranked = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
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
    fre: 206.835 - 1.015 * (W / S) - 84.6 * (syl / W),
    fk: 0.39 * (W / S) + 11.8 * (syl / W) - 15.59,
    longest: [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 4),
    sentList: sents,
    freq,
    stem: !!opts.stem,
    norm,     // content word -> the label it is counted under (itself when stemming is off)
    stemOf,   // content word -> its stem (for showing "students -> student")
    forms,    // label -> Map(original form -> count)
  };
}

// The words of one sentence or text, as the analysis counts them.
export const countedWords = (a, s) => tokens(s).filter(isContent).map(a.norm);

// Luhn-style extractive summary: picks the highest-scoring original sentences.
export function extractive(a, n) {
  const s = a.sentList;
  if (s.length <= n) return s;
  const max = Math.max(1, ...a.freq.values());
  return s.map((x, i) => {
    const t = countedWords(a, x);
    const sc = t.reduce((m, w) => m + (a.freq.get(w) || 0) / max, 0) / Math.sqrt(Math.max(t.length, 1)) + (i === 0 ? 0.3 : 0);
    return { i, x, sc };
  }).sort((p, q) => q.sc - p.sc).slice(0, n).sort((p, q) => p.i - q.i).map(o => o.x);
}

export const mins = m => m < 1 ? Math.max(1, Math.round(m * 60)) + ' sec' : Math.round(m) + ' min';

export const readLabel = f => f >= 90 ? 'Very easy' : f >= 80 ? 'Easy' : f >= 70 ? 'Fairly easy' : f >= 60 ? 'Standard' : f >= 50 ? 'Fairly difficult' : f >= 30 ? 'Difficult' : 'Very difficult';

// Splits a sentence into plain text and the words counted as `label`, for highlighting.
export function markWord(a, sentence, label) {
  const out = [];
  let last = 0, m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(sentence))) {
    const w = m[0].toLowerCase().replace(/’/g, "'");
    if (isContent(w) && a.norm(w) === label) {
      if (m.index > last) out.push({ t: sentence.slice(last, m.index) });
      out.push({ t: m[0], hit: true });
      last = m.index + m[0].length;
    }
  }
  if (last < sentence.length) out.push({ t: sentence.slice(last) });
  return out;
}

// ---------- Bag of words, TF, IDF and TF-IDF ----------
// With one document, each SENTENCE is treated as a mini-document, so IDF and
// TF-IDF can be computed without needing several files.
//
//   TF(w)     = count of w in the text / total words in the text
//   DF(w)     = number of sentences that contain w
//   IDF(w)    = log10( N / DF(w) ), N = number of sentences
//   TF-IDF(w) = TF(w) * IDF(w)

export function bagOfWords(text, a) {
  const all = tokens(text);
  const total = all.length;
  const content = all.filter(isContent);
  const sentTokens = a.sentList.map(s => countedWords(a, s));
  const N = sentTokens.length;

  const df = new Map();
  sentTokens.forEach(ts => new Set(ts).forEach(w => df.set(w, (df.get(w) || 0) + 1)));

  const rows = [...a.freq].map(([w, c]) => {
    const d = df.get(w) || 1;
    const tf = total ? c / total : 0;
    const idf = N > 0 ? Math.log10(N / d) : 0;
    return { w, c, tf, df: d, idf, tfidf: tf * idf };
  });
  const rowOf = new Map(rows.map(r => [r.w, r]));
  const byTf = [...rows].sort((x, y) => y.c - x.c || x.w.localeCompare(y.w)).slice(0, 10);
  const byTfidf = [...rows].sort((x, y) => y.tfidf - x.tfidf || y.c - x.c || x.w.localeCompare(y.w)).slice(0, 10);

  // Document-term matrix: sentences x the most frequent words
  const cols = byTf.slice(0, 7).map(r => r.w);
  const matrix = sentTokens.slice(0, 500).map((ts, i) => ({ // capped so huge PDFs stay fast
    i, s: a.sentList[i], counts: cols.map(w => ts.filter(t => t === w).length),
  }));

  return {
    total, vocab: new Set(all).size, contentCount: content.length, removed: total - content.length,
    tokens: all.map(t => { const keep = isContent(t); return { t, keep, n: keep ? a.norm(t) : null, stem: keep && a.stem ? a.stemOf(t) : null }; }),
    N, byTf, byTfidf, rowOf, sentTokens, cols, matrix,
  };
}
