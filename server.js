/* Éclaircie — serveur + API REST. Aucune dépendance : Node 22+ suffit.
   Lancement : node --env-file-if-exists=.env server.js
   (mettez ANTHROPIC_API_KEY=... dans le fichier .env pour activer le filtrage par IA) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TOPICS, SUBTOPICS, SOURCES, SENSITIVE, heuristicClassify, filterArticles } = require('./public/shared.js');
const DEMO = require('./public/demo-data.js');

const PORT = process.env.PORT || 3000;
// Moteur IA : Gemini (GEMINI_API_KEY) ou Claude (ANTHROPIC_API_KEY). AI_PROVIDER force le choix si les deux sont définies.
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const AI_PROVIDER = process.env.AI_PROVIDER || (GEMINI_KEY ? 'gemini' : ANTHROPIC_KEY ? 'claude' : null);
const AI_KEY = AI_PROVIDER === 'gemini' ? GEMINI_KEY : AI_PROVIDER === 'claude' ? ANTHROPIC_KEY : null;
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-5-5';
let AI_LABEL = AI_PROVIDER === 'gemini' ? 'Gemini' : 'Claude · ' + AI_MODEL;
const CACHE_MS = 10 * 60e3;

const MAX_EXTRA_FEEDS = 10;

// ---------- RSS / Atom ----------
const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = s => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (xml, re) => { const m = xml.match(re); return m ? decode(m[1]) : ''; };

function parseFeed(xml, feed) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return items.slice(0, 25).map(it => {
    const link = strip(tag(it, 'link')) || attr(it, /<link[^>]*href="([^"]+)"/i);
    const desc = tag(it, 'description') || tag(it, 'summary') || tag(it, 'content');
    const image = attr(it, /<media:content[^>]*url="([^"]+)"/i) || attr(it, /<media:thumbnail[^>]*url="([^"]+)"/i)
      || attr(it, /<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || attr(decode(desc), /<img[^>]*src="([^"]+)"/i);
    const date = strip(tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || tag(it, 'dc:date'));
    return {
      id: crypto.createHash('sha1').update(link || strip(tag(it, 'title'))).digest('base64url').slice(0, 16),
      title: strip(tag(it, 'title')),
      summary: strip(desc).slice(0, 400),
      url: link, image, source: feed.name, sourceId: feed.id, topicHint: feed.hint,
      date: new Date(date || Date.now()).toISOString(),
    };
  }).filter(a => a.title);
}

let lastUpdate = 0;
const feedCache = new Map(); // url -> { at, items, title }
const aiCache = new Map(); // id -> classification

// Flux perso : uniquement http(s) public (pas d'accès au réseau local du serveur).
function safeFeedUrl(raw) {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1' || h === '0.0.0.0'
      || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^f[cd]/.test(h)) return null;
    return u.href;
  } catch { return null; }
}

async function fetchFeed(f) {
  const c = feedCache.get(f.url);
  if (c && Date.now() - c.at < CACHE_MS * 0.9) return c; // 0,9 : le rafraîchissement périodique relit bien le flux
  const r = await fetch(f.url, { headers: { 'User-Agent': 'EclaircieBot/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(f.name + ' ' + r.status);
  const xml = (await r.text()).slice(0, 3e6);
  const title = strip(tag(xml, 'title')).slice(0, 60);
  const entry = { at: Date.now(), title, items: parseFeed(xml, { ...f, name: f.name || title || new URL(f.url).hostname }) };
  feedCache.set(f.url, entry);
  return entry;
}

// Les flux du catalogue sont lus au démarrage puis rafraîchis en fond toutes les 10 min :
// une requête n'attend jamais le réseau, sauf la toute première avant la fin du préchargement.
let baseArticles = null, refreshing = null, backgroundRunning = false;
function refreshBase() {
  return refreshing ||= (async () => {
    const results = await Promise.allSettled(SOURCES.map(fetchFeed));
    const seen = new Set();
    let articles = results.flatMap(r => r.status === 'fulfilled' ? r.value.items : [])
      .filter(a => !seen.has(a.id) && seen.add(a.id));
    results.filter(r => r.status === 'rejected').forEach(r => console.warn('[flux]', r.reason.message));
    if (!articles.length) articles = baseArticles?.length ? baseArticles : DEMO.slice(); // hors ligne : on garde le dernier état
    articles.forEach(decorate);
    baseArticles = articles;
    lastUpdate = Date.now();
    // L'enrichissement (pages, IA) est lent : il tourne en arrière-plan et profite aux requêtes suivantes.
    if (!backgroundRunning) {
      backgroundRunning = true;
      enrichFromPages(articles).then(() => classifyWithAI(articles))
        .catch(e => console.warn('[arrière-plan]', e.message))
        .finally(() => { backgroundRunning = false; });
    }
  })().finally(() => { refreshing = null; });
}

async function fetchAll(extraUrls = []) {
  if (!baseArticles) await refreshBase();
  else if (Date.now() - lastUpdate > CACHE_MS) refreshBase(); // en fond : on répond avec l'état actuel
  baseArticles.forEach(decorate); // applique les derniers résultats IA / images
  const extras = extraUrls.map(safeFeedUrl).filter(Boolean).slice(0, MAX_EXTRA_FEEDS)
    .map(url => ({ id: 'custom:' + url, url, name: '' }));
  if (!extras.length) return baseArticles;
  const results = await Promise.allSettled(extras.map(fetchFeed));
  const seen = new Set(baseArticles.map(a => a.id));
  const own = results.flatMap(r => r.status === 'fulfilled' ? r.value.items : []).filter(a => !seen.has(a.id) && seen.add(a.id));
  own.forEach(decorate);
  return [...baseArticles, ...own];
}

// Applique ce qu'on sait déjà sur l'article : résumé/image de la page, verdict IA (sinon mots-clés), signalements.
function decorate(a) {
  const page = pageCache.get(a.id);
  if (page) {
    if ((a.summary || '').length < 40 && page.desc) a.summary = page.desc;
    if (!a.image && page.image) a.image = page.image;
  }
  a.ai = { ...(aiCache.get(a.id) || heuristicClassify(a)) };
  const reported = overrides.get(a.id); // corrections signalées par les lecteurs
  if (reported) a.ai = { ...a.ai, sensitive: [...new Set([...a.ai.sensitive, ...reported])], reported: true };
}

// Beaucoup de flux n'ont pas d'image, certains pas de résumé (ex. Le Parisien). On lit les balises
// og:image / og:description de la page, comme le fait un aperçu de lien.
const pageCache = new Map(); // id -> { desc, image }
const metaTag = (html, names) => attr(html, new RegExp(`<meta[^>]+(?:property|name)=["'](?:${names})["'][^>]+content=["']([^"']*)["']`, 'i'))
  || attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["'](?:${names})["']`, 'i'));
async function enrichFromPages(articles) {
  const todo = articles.filter(a => ((a.summary || '').length < 40 || !a.image) && a.url && !pageCache.has(a.id) && safeFeedUrl(a.url)).slice(0, 120);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async a => {
      try {
        const r = await fetch(a.url, { headers: { 'User-Agent': 'EclaircieBot/1.0' }, signal: AbortSignal.timeout(6000) });
        const html = r.ok ? (await r.text()).slice(0, 400000) : '';
        let image = metaTag(html, 'og:image|og:image:url|twitter:image|twitter:image:src');
        try { image = image ? new URL(image, a.url).href : ''; } catch { image = ''; }
        pageCache.set(a.id, { desc: strip(metaTag(html, 'og:description|description')).slice(0, 400), image: /^https?:/.test(image) ? image : '' });
      } catch { pageCache.set(a.id, { desc: '', image: '' }); }
    }));
  }
  articles.forEach(decorate);
}

// ---------- Signalements ----------
const FEEDBACK_FILE = path.join(__dirname, 'data', 'feedback.json');
const overrides = new Map(); // id -> [catégories sensibles]
try { for (const f of JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8'))) overrides.set(f.id, [...new Set([...(overrides.get(f.id) || []), f.category])]); } catch { /* pas encore de signalement */ }
function saveFeedback(entry) {
  let all = [];
  try { all = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf8')); } catch { }
  all.push(entry);
  fs.mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(all.slice(-5000), null, 1));
}

// ---------- Classification IA (Gemini ou Claude) ----------
async function classifyWithAI(articles) {
  if (!AI_KEY) return;
  if (Date.now() < aiPausedUntil) return;
  // Priorité aux articles que les mots-clés laissent passer (c'est là que l'IA évite les ratés), puis aux plus récents.
  const todo = articles.filter(a => !aiCache.has(a.id))
    .sort((x, y) => (x.ai.sensitive.length > 0) - (y.ai.sensitive.length > 0) || new Date(y.date) - new Date(x.date));
  const size = AI_PROVIDER === 'gemini' ? 40 : 20; // gros lots = moins de requêtes (quota gratuit Gemini très limité)
  for (let i = 0; i < todo.length; i += size) {
    if (Date.now() < aiPausedUntil) break;
    const batch = todo.slice(i, i + size);
    const prompt = `Tu classes des articles d'actualité pour une app qui protège des lecteurs sensibles des contenus anxiogènes.
Pour chaque article, renvoie : topic (un parmi ${TOPICS.map(t => t.id).join(', ')}), sensitive (liste, parmi ${SENSITIVE.map(s => `${s.id} = ${s.label}`).join(' ; ')} — vide si aucun), tone (de -1 très négatif à 1 très positif).

Règles importantes :
- Juge ce dont l'article PARLE, pas sa rubrique. Un article de sport, culture ou économie qui évoque une attaque, un décès, un attentat, une guerre ou un drame doit recevoir la catégorie sensible correspondante (ex. « matchs reportés après une attaque » → violence).
- Les signaux indirects comptent : hommage, minute de silence, marche blanche, « exprime sa solidarité », cellule psychologique, victimes → un drame a eu lieu.
- En cas de doute, ajoute la catégorie : les lecteurs préfèrent manquer un article que tomber sur un contenu qui les blesse.
- Le ton reflète l'événement de fond (un hommage après un drame est négatif).
Réponds UNIQUEMENT avec un tableau JSON : [{"i":0,"topic":"...","sensitive":[],"tone":0.4}, ...]

${batch.map((a, j) => `${j}. ${a.title} — ${a.summary.slice(0, 200)}`).join('\n')}`;
    try {
      const text = await (AI_PROVIDER === 'gemini' ? askGemini(prompt) : askClaude(prompt));
      const json = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
      for (const c of json) {
        const a = batch[c.i];
        if (a) aiCache.set(a.id, { topic: c.topic, sensitive: (c.sensitive || []).filter(s => SENSITIVE.some(x => x.id === s)), tone: +c.tone || 0, by: 'IA', engine: AI_LABEL });
      }
      batch.forEach(decorate);
    } catch (e) {
      console.warn('[IA] classification échouée, repli sur les mots-clés :', e.message);
      if (/clé (API )?invalide|crédit épuisé/.test(e.message)) break; // inutile d'insister sur les autres lots
    }
  }
}

async function askClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // Effort "low" : une classification n'a pas besoin de longue réflexion (plus rapide, moins cher).
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 4000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json();
  if (!r.ok) {
    const hint = r.status === 401 ? ' → clé API invalide : vérifiez ANTHROPIC_API_KEY dans .env'
      : r.status === 400 && /credit|billing/i.test(data.error?.message || '') ? ' → crédit épuisé : ajoutez du crédit dans la console Anthropic' : '';
    throw new Error(`${r.status} ${data.error?.message || ''}${hint}`);
  }
  if (data.stop_reason === 'refusal') throw new Error('requête refusée par le modèle');
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

// ---------- Gemini (Google) ----------
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
let geminiModel = process.env.GEMINI_MODEL || null;
let aiPausedUntil = 0; // quota journalier épuisé → on se repose sur les mots-clés jusqu'à cette date
// Sans GEMINI_MODEL, on choisit le modèle stable le plus récent, en préférant "Flash-Lite" : plus rapide,
// largement suffisant pour classer des titres, et avec un quota gratuit bien plus généreux que "Flash".
async function pickGeminiModel() {
  if (geminiModel) return geminiModel;
  try {
    const r = await fetch(`${GEMINI_API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': GEMINI_KEY }, signal: AbortSignal.timeout(10000) });
    const data = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${data.error?.message || ''}`);
    const version = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const flash = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
      .filter(n => /^gemini-[\d.]+-flash(-lite)?$/.test(n))
      .sort((a, b) => (b.endsWith('-lite') - a.endsWith('-lite')) || version(b) - version(a));
    geminiModel = flash[0] || 'gemini-2.5-flash-lite';
  } catch (e) {
    console.warn('[IA] liste des modèles Gemini indisponible :', e.message);
    geminiModel = 'gemini-2.5-flash';
  }
  AI_LABEL = 'Gemini · ' + geminiModel;
  console.log('[IA] modèle Gemini utilisé :', geminiModel);
  return geminiModel;
}
async function askGemini(prompt, attempt = 0) {
  const model = await pickGeminiModel();
  const r = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    signal: AbortSignal.timeout(120000),
  });
  const data = await r.json();
  if (r.status === 429) {
    // Délai conseillé par Google : quelques secondes (limite par minute) ou plusieurs heures (quota du jour épuisé).
    const info = (data.error?.details || []).find(d => d.retryDelay);
    const msg = data.error?.message || '';
    const m = msg.match(/retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i);
    const waitMs = info ? parseFloat(info.retryDelay) * 1000 : m ? ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + parseFloat(m[3])) * 1000 : 30000;
    if (waitMs <= 90000 && attempt < 2) { await new Promise(res => setTimeout(res, waitMs + 1000)); return askGemini(prompt, attempt + 1); }
    aiPausedUntil = Date.now() + Math.max(waitMs, 15 * 60e3);
    throw new Error(`quota Gemini épuisé → IA en pause jusqu'à ${new Date(aiPausedUntil).toLocaleTimeString('fr-FR')}, filtre par mots-clés en attendant (ou ajoutez la facturation sur https://aistudio.google.com)`);
  }
  if (!r.ok) {
    const hint = r.status === 400 && /API key/i.test(data.error?.message || '') || r.status === 403 ? ' → clé invalide : vérifiez GEMINI_API_KEY dans .env' : '';
    throw new Error(`${r.status} ${data.error?.message || ''}${hint}`);
  }
  const cand = (data.candidates || [])[0];
  if (!cand) throw new Error('réponse vide (' + (data.promptFeedback?.blockReason || 'raison inconnue') + ')');
  return (cand.content?.parts || []).map(p => p.text || '').join('');
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const list = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);

function send(res, code, body, type = 'application/json; charset=utf-8') {
  // no-cache : le navigateur revérifie à chaque fois, donc une mise à jour de l'app est visible immédiatement.
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2));
}

async function readBody(req) {
  let s = ''; for await (const c of req) { s += c; if (s.length > 1e5) break; }
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

const routes = {
  'GET /api/health': () => ({
    ok: true, ai: Boolean(AI_KEY), provider: AI_KEY ? AI_PROVIDER : null, engine: AI_KEY ? AI_LABEL : null,
    aiPausedUntil: aiPausedUntil > Date.now() ? new Date(aiPausedUntil).toISOString() : null,
    classifiedByAI: aiCache.size, pagesRead: pageCache.size, cachedFeeds: feedCache.size,
  }),
  'GET /api/topics': () => ({
    topics: TOPICS.map(({ kw, ...t }) => ({ ...t, subtopics: (SUBTOPICS[t.id] || []).map(([id, label]) => ({ id, label })) })),
    sensitive: SENSITIVE.map(({ kw, ...s }) => s),
  }),
  // count = articles lus au dernier passage (0 = source indisponible, ex. site qui bloque les lecteurs RSS)
  'GET /api/sources': async () => {
    if (!feedCache.size) await fetchAll();
    return { sources: SOURCES.map(({ url, ...s }) => ({ ...s, count: feedCache.get(url)?.items.length || 0 })) };
  },
  // /api/sources/test?url=https://exemple.fr/feed  → vérifie qu'un flux RSS perso est lisible
  'GET /api/sources/test': async q => {
    const url = safeFeedUrl(q.get('url'));
    if (!url) return [400, { ok: false, error: 'Adresse invalide (http ou https public uniquement)' }];
    try {
      const f = await fetchFeed({ id: 'custom:' + url, url, name: '' });
      return f.items.length ? { ok: true, url, name: f.title || new URL(url).hostname, count: f.items.length } : [422, { ok: false, error: 'Aucun article trouvé : est-ce bien un flux RSS ?' }];
    } catch (e) { return [502, { ok: false, error: 'Flux injoignable' }]; }
  },
  // /api/news?topics=science&subtopics=foot,ia&interests=PSG&sources=lemonde,numerama&extra=<rss>,<rss>&block=war&tone=30&limit=30
  'GET /api/news': async q => {
    const all = await fetchAll(list(q.get('extra')));
    if (q.get('raw')) return { articles: all, total: all.length };
    const prefs = {
      topics: list(q.get('topics')), subtopics: list(q.get('subtopics')), interests: list(q.get('interests')),
      sources: q.has('sources') ? list(q.get('sources')) : null,
      blocked: list(q.get('block')), keywords: list(q.get('keywords')), tone: q.has('tone') ? +q.get('tone') : 100,
    };
    let { visible, hidden, hiddenTotal } = filterArticles(all, prefs);
    if (q.get('only') === '1' && prefs.topics.length) visible = visible.filter(a => prefs.topics.includes(a.ai.topic));
    const limit = Math.min(+q.get('limit') || 50, 200);
    return { articles: visible.slice(0, limit), total: visible.length, hidden, hiddenTotal, updatedAt: new Date(lastUpdate).toISOString() };
  },
  // POST /api/feedback { "id": "...", "title": "...", "category": "violence" } → l'article est masqué pour tous ceux qui bloquent ce sujet
  'POST /api/feedback': async (q, body) => {
    const id = String(body.id || '').slice(0, 64), category = String(body.category || '');
    if (!id || !SENSITIVE.some(s => s.id === category)) return [400, { error: 'id et category (sujet bloquable) requis' }];
    overrides.set(id, [...new Set([...(overrides.get(id) || []), category])]);
    saveFeedback({ id, title: String(body.title || '').slice(0, 300), category, at: new Date().toISOString() });
    return { ok: true };
  },
  // POST /api/classify { "title": "...", "summary": "..." }
  'POST /api/classify': async (q, body) => {
    const a = { id: 'adhoc-' + Date.now(), title: String(body.title || ''), summary: String(body.summary || '') };
    if (!a.title) return [400, { error: 'title requis' }];
    await classifyWithAI([a]);
    return aiCache.get(a.id) || heuristicClassify(a);
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const route = routes[`${req.method} ${url.pathname}`];
  if (route) {
    try {
      const out = await route(url.searchParams, req.method === 'POST' ? await readBody(req) : null);
      return Array.isArray(out) ? send(res, out[0], out[1]) : send(res, 200, out);
    } catch (e) { console.error(e); return send(res, 500, { error: e.message }); }
  }
  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'route inconnue' });
  // Fichiers statiques (avec protection contre ../)
  const file = path.join(__dirname, 'public', path.normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) return send(res, 403, 'interdit', 'text/plain');
  fs.readFile(file, (err, data) => err
    ? send(res, 404, 'introuvable', 'text/plain')
    : send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream'));
}).on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`\n⚠️  Le port ${PORT} est déjà utilisé, sans doute par un serveur Éclaircie encore ouvert.
   → Fermez l'autre terminal (ou Ctrl+C dedans), ou arrêtez-le avec :
     Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT} -State Listen).OwningProcess
   → Ou lancez sur un autre port :  $env:PORT=3001; node --env-file-if-exists=.env server.js\n`);
  process.exit(1);
}).listen(PORT, () => {
  console.log(`Éclaircie → http://localhost:${PORT}  (IA : ${AI_KEY ? AI_LABEL : 'désactivée, filtre par mots-clés'})`);
  // Préchargement : les actus sont prêtes avant la première visite, puis rafraîchies régulièrement.
  const t0 = Date.now();
  refreshBase().then(() => console.log(`[flux] ${baseArticles.length} articles prêts en ${((Date.now() - t0) / 1000).toFixed(1)} s`));
  setInterval(() => refreshBase(), CACHE_MS).unref();
});
