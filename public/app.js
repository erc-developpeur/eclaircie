/* Éclaircie — application (SPA vanilla, routage par hash). Les préférences restent sur l'appareil. */
const { TOPICS, SUBTOPICS, SOURCES, SENSITIVE, filterArticles } = window.Eclaircie;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');

// ---------- Stockage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('ecl:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ecl:' + k, JSON.stringify(v)); } catch { /* navigation privée */ } },
};
const DEFAULT_PREFS = {
  name: '', age: '', motives: [], mood: '', topics: [], mutedTopics: [],
  subtopics: [], interests: [], sources: null, customFeeds: [], // sources null = toutes
  blocked: ['war', 'murder', 'sexual', 'terror'], tone: 40, keywords: [],
  moments: [], duration: '5', format: 'mix', region: 'France',
  notif: { enabled: false, freq: 'daily', time: '08:00', time2: '19:00', maxPerDay: 3, quietStart: '22:00', quietEnd: '07:00' },
  homepage: false, theme: 'auto',
};
let prefs = Object.assign({}, DEFAULT_PREFS, store.get('prefs', {}));
prefs.notif = Object.assign({}, DEFAULT_PREFS.notif, prefs.notif);
let saved = store.get('saved', []);
const savePrefs = () => { store.set('prefs', prefs); syncServiceWorker(); };
const topicOf = id => TOPICS.find(t => t.id === id) || { id, label: id, emoji: '📰' };
const sensOf = id => SENSITIVE.find(s => s.id === id) || { id, label: id, emoji: '•' };
applyTheme();

function applyTheme() {
  if (prefs.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = prefs.theme;
}

// ---------- Données ----------
// Stratégie « afficher d'abord, mettre à jour ensuite » : à l'ouverture on montre aussitôt les dernières
// actus gardées sur l'appareil, pendant que les nouvelles arrivent en fond.
let articles = [];
let source = 'demo';   // 'live' (serveur), 'cache' (mémoire de l'appareil), 'demo' (exemples)
let fetching = null;
const CACHE_MAX = 250;
function fetchLive() {
  return fetching ||= (async () => {
    const extra = prefs.customFeeds.map(f => f.url).join(',');
    const r = await fetch('/api/news?raw=1' + (extra ? '&extra=' + encodeURIComponent(extra) : ''), { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const fresh = (await r.json()).articles;
    if (!fresh?.length) throw new Error('vide');
    articles = fresh; source = 'live';
    // On garde une version allégée des plus récents pour la prochaine ouverture.
    store.set('articlesCache', {
      at: Date.now(),
      items: [...fresh].sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, CACHE_MAX)
        .map(({ id, title, summary, url, image, source, sourceId, date, ai }) => ({ id, title, summary: (summary || '').slice(0, 300), url, image, source, sourceId, date, ai })),
    });
    return fresh;
  })().finally(() => { fetching = null; });
}
async function loadArticles(force) {
  if (articles.length && !force) return articles;
  if (!articles.length) {
    const c = store.get('articlesCache', null);
    if (c?.items?.length) {
      articles = c.items; source = 'cache';
      if (!force) { refreshInBackground(); return articles; }
    }
  }
  try { await fetchLive(); }
  catch { if (!articles.length) { articles = window.DEMO_ARTICLES; source = 'demo'; } }
  return articles;
}
// Arrivée des actus fraîches : on redessine si l'utilisateur est en haut, sinon on propose (sans faire sauter la page).
function refreshInBackground() {
  const before = new Set(articles.map(a => a.id));
  const newest = Math.max(0, ...articles.map(a => +new Date(a.date)));
  fetchLive().then(() => {
    // « Nouveau » = paru après le plus récent qu'on avait déjà (pas simplement absent de la mémoire).
    const added = myFeed().visible.filter(a => !before.has(a.id) && +new Date(a.date) > newest).length;
    const label = `✨ ${added} ${added > 1 ? 'nouveaux articles' : 'nouvel article'}`;
    if (window.scrollY < 200) { redraw(); showTopbarMessage(false); if (added) toast(label); }
    // Plus bas dans la page : on ne redessine pas sous les yeux du lecteur, on propose.
    else if (added) toast(label, { label: 'Afficher', run: () => { redraw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
  }).catch(() => { /* on reste sur la version en mémoire */ });
}
function myFeed() {
  // Les articles signalés par l'utilisateur disparaissent tout de suite, quel que soit le verdict du filtre.
  const reported = store.get('reported', {});
  const nReported = articles.filter(a => reported[a.id]).length;
  const res = filterArticles(nReported ? articles.filter(a => !reported[a.id]) : articles, prefs);
  if (nReported) { res.hidden.reported = nReported; res.hiddenTotal += nReported; }
  const muted = new Set(prefs.mutedTopics);
  const before = res.visible.length;
  res.visible = res.visible.filter(a => !muted.has(a.ai.topic));
  if (before - res.visible.length) { res.hidden.muted = before - res.visible.length; res.hiddenTotal += res.hidden.muted; }
  return res;
}

// ---------- Utilitaires d'interface ----------
// Image de l'article. no-referrer : beaucoup de médias bloquent les images affichées depuis un autre site.
// Si elle ne charge pas, on la retire et le cadre affiche l'illustration du thème (voir .media dans app.css).
const imgHTML = (a, lazy) => a.image
  ? `<img src="${esc(a.image)}" alt="" ${lazy ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
const PALETTE = ['c1', 'c2', 'c3', 'c4'];
const GRADS = ['linear-gradient(135deg,#F7B9CE,#FFF4D6)', 'linear-gradient(135deg,#164BFF,#7C9BFF)', 'linear-gradient(135deg,#FFF4D6,#DCE4FF)', 'linear-gradient(135deg,#202020,#164BFF)', 'linear-gradient(135deg,#F7B9CE,#164BFF)'];
const gradFor = id => GRADS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % GRADS.length];
const BUBBLE_COLORS = ['#FFF4D6', '#F7B9CE', '#DCE4FF', '#FCE3EB', '#F3EDDF'];
function timeAgo(d) {
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
  if (action) $('button', t).onclick = () => { action.run(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}
function sheet(html) {
  const d = $('#sheet');
  d.innerHTML = `<div class="in">${html}<div class="row" style="margin-top:20px"><button class="btn btn-ghost" data-close style="flex:1">Fermer</button></div></div>`;
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  d.showModal();
  return d;
}
const ICONS = {
  save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  less: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

// ---------- Routage ----------
const routes = { onboarding: renderOnboarding, feed: renderFeed, favorites: renderFavorites, explore: renderExplore, saved: renderSaved, profile: renderProfile, article: renderArticle };
function router() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const onboarded = store.get('onboarded', false);
  const route = !onboarded ? 'onboarding' : (routes[name] ? name : 'feed');
  if (!onboarded && name !== 'onboarding') return void (location.hash = '#/onboarding');
  $('#nav').hidden = route === 'onboarding';
  $$('#nav [data-route]').forEach(a => a.dataset.route === route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  redraw = () => { };
  currentRoute = route;
  routes[route](arg ? decodeURIComponent(arg) : undefined);
  window.scrollTo(0, 0);
  updateTopbar();
  if (route !== 'onboarding') main.focus({ preventScroll: true });
}
window.addEventListener('hashchange', router);

// ---------- Bulle flottante : logo · phrase personnelle · actualiser ----------
let currentRoute = '';
const TOPBAR_ROUTES = new Set(['feed', 'favorites', 'explore', 'saved', 'profile']); // pas sur l'inscription ni le lecteur
const topbar = $('#topbar'), topbarMsg = $('#topbar-msg');
let topbarShown = false, topbarIdx = 0, topbarHover = false;

// Phrases propres à chaque personne : prénom, moment de la journée, sujets précis, thèmes, bouclier, habitudes.
function topbarMessages() {
  const h = new Date().getHours(), name = prefs.name ? ', ' + prefs.name : '';
  const msgs = [h < 5 ? `Bonne nuit${name} 🌙` : h < 12 ? `Bonjour${name} ☀️` : h < 18 ? `Bon après-midi${name} 🌤️` : `Bonsoir${name} 🌆`];
  if (!articles.length) return msgs;
  const res = myFeed(), fav = res.visible.filter(a => a.match.interests.length || a.match.subs.length);
  for (const k of prefs.interests.slice(0, 3)) {
    const n = res.visible.filter(a => a.match.interests.includes(k)).length;
    if (n) msgs.push(`⭐ ${n} article${n > 1 ? 's' : ''} sur ${k}`);
  }
  const good = res.visible.filter(a => a.ai.tone > 0.15).length;
  if (good) msgs.push(`🌤️ ${good} bonne${good > 1 ? 's' : ''} nouvelle${good > 1 ? 's' : ''}`);
  if (res.hiddenTotal) msgs.push(`🛡️ ${res.hiddenTotal} article${res.hiddenTotal > 1 ? 's' : ''} évité${res.hiddenTotal > 1 ? 's' : ''}`);
  const topTopic = prefs.topics.map(t => [t, res.visible.filter(a => a.ai.topic === t && Date.now() - new Date(a.date) < 6 * 3600e3).length]).sort((a, b) => b[1] - a[1])[0];
  if (topTopic && topTopic[1]) msgs.push(`${topicOf(topTopic[0]).emoji} Du nouveau en ${topicOf(topTopic[0]).label.toLowerCase()}`);
  if (!fav.length && prefs.subtopics.length) msgs.push('🔎 Rien de neuf sur vos précisions');
  const moment = h < 11 ? 'morning' : h < 14 ? 'noon' : h < 18 ? 'day' : 'evening';
  if (prefs.moments.includes(moment)) msgs.push({ morning: '☕ Votre café-actu du matin', noon: '🥪 La pause actu de midi', day: '☀️ Votre pause actu', evening: '🌙 Votre récap du soir' }[moment]);
  if (prefs.duration) msgs.push(`⏱️ Votre sélection de ${prefs.duration} min`);
  return msgs;
}
function showTopbarMessage(next) {
  const msgs = topbarMessages();
  topbarIdx = next ? (topbarIdx + 1) % msgs.length : Math.min(topbarIdx, msgs.length - 1);
  const text = msgs[topbarIdx];
  if (!next || matchMedia('(prefers-reduced-motion: reduce)').matches) { topbarMsg.textContent = text; return; }
  topbarMsg.classList.add('out');
  setTimeout(() => { topbarMsg.textContent = text; topbarMsg.classList.remove('out'); }, 300);
}
function updateTopbar() {
  const show = TOPBAR_ROUTES.has(currentRoute) && window.scrollY > 140;
  if (show === topbarShown) return;
  topbarShown = show;
  topbar.classList.toggle('show', show);
  topbar.inert = !show; // invisible = hors du parcours clavier et lecteur d'écran
  if (show) showTopbarMessage(false);
}
window.addEventListener('scroll', updateTopbar, { passive: true });
// Une nouvelle phrase toutes les 6 s, en pause au survol (le temps de lire).
setInterval(() => { if (topbarShown && !topbarHover && !document.hidden) showTopbarMessage(true); }, 6000);
topbar.addEventListener('pointerenter', () => { topbarHover = true; });
topbar.addEventListener('pointerleave', () => { topbarHover = false; });

// Actualisation partagée par le bouton de l'en-tête et celui de la bulle.
async function refreshNow(btn) {
  btn?.classList.add('spin'); if (btn) btn.disabled = true;
  await loadArticles(true);
  redraw(); showTopbarMessage(false);
  btn?.classList.remove('spin'); if (btn) btn.disabled = false;
  toast(source === 'live' ? 'Fil actualisé' : source === 'cache' ? 'Serveur injoignable : dernières actus gardées en mémoire' : 'Serveur injoignable : articles d\'exemple');
}
$('#topbar-refresh').onclick = e => refreshNow(e.currentTarget);

// =====================================================================
// INSCRIPTION — longue mais découpée : une question par écran, toujours passable.
// =====================================================================
const MOODS = [
  { id: 'overwhelmed', emo: '😮‍💨', label: 'Submergé·e', sub: 'J\'ai besoin de faire une pause', tone: 10, blocked: ['war', 'murder', 'sexual', 'violence', 'terror', 'disaster', 'death', 'disease', 'polemic', 'crisis'] },
  { id: 'anxious', emo: '😟', label: 'Parfois anxieux·se', sub: 'Certains sujets me pèsent', tone: 30, blocked: ['war', 'murder', 'sexual', 'violence', 'terror', 'disaster'] },
  { id: 'calm', emo: '🙂', label: 'Plutôt serein·e', sub: 'Je veux juste trier', tone: 55, blocked: ['murder', 'sexual'] },
  { id: 'curious', emo: '🤓', label: 'Curieux·se de tout', sub: 'Montrez-moi l\'essentiel', tone: 85, blocked: [] },
];
const STEPS = [
  { id: 'welcome', render: () => `
      <div class="welcome-art" aria-hidden="true">
        <span style="width:150px;height:150px;left:6%;top:30px;background:var(--cream)">🌱 Planète</span>
        <span style="width:110px;height:110px;left:46%;top:0;background:var(--pink);animation-delay:-2s">🔬 Science</span>
        <span style="width:120px;height:120px;right:4%;top:120px;background:var(--blue);color:#fff;animation-delay:-4s">🚀 Espace</span>
        <span style="width:90px;height:90px;left:38%;top:150px;background:#DCE4FF;animation-delay:-1s">🎬 Ciné</span>
      </div>
      <p class="eyebrow">Bienvenue sur Éclaircie</p>
      <h1>L'actualité qui vous ressemble, sans ce qui vous abîme.</h1>
      <p class="lead">Quelques questions (environ 3 minutes) pour comprendre ce qui vous intéresse et ce que vous préférez ne pas voir. Notre IA s'occupe ensuite de trier pour vous. Vous pourrez tout changer plus tard.</p>`,
    next: 'Commencer' },
  { id: 'name', title: 'Comment doit-on vous appeler ?', lead: 'Juste un prénom ou un pseudo, pour personnaliser votre accueil.',
    render: () => `<div class="field"><label for="f-name">Prénom ou pseudo</label><input id="f-name" class="input" autocomplete="given-name" maxlength="30" value="${esc(prefs.name)}" placeholder="ex. Camille"></div>`,
    collect: () => { prefs.name = $('#f-name').value.trim(); } },
  { id: 'age', title: 'Quelle est votre tranche d\'âge ?', lead: 'Cela nous aide à choisir le ton et les sujets proposés par défaut.',
    render: () => single('age', [['-18', 'Moins de 18 ans'], ['18-24', '18 – 24 ans'], ['25-34', '25 – 34 ans'], ['35-49', '35 – 49 ans'], ['50-64', '50 – 64 ans'], ['65+', '65 ans et plus']]) },
  { id: 'motives', title: 'Pourquoi lisez-vous l\'actualité ?', lead: 'Choisissez tout ce qui vous parle.',
    render: () => multi('motives', [['informed', '🧭', 'Rester informé·e'], ['learn', '📚', 'Apprendre'], ['inspire', '✨', 'M\'inspirer'], ['work', '💼', 'Pour mon travail'], ['talk', '💬', 'Avoir des sujets de conversation'], ['relax', '☕', 'Me détendre']]) },
  { id: 'mood', title: 'Comment vous sentez-vous face à l\'actualité en ce moment ?', lead: 'Il n\'y a pas de mauvaise réponse. On adapte votre bouclier en conséquence.',
    render: () => `<div class="options single" role="radiogroup" aria-label="Ressenti">${MOODS.map(m => `
      <button type="button" class="option" role="radio" aria-checked="${prefs.mood === m.id}" data-mood="${m.id}"><span class="emo" aria-hidden="true">${m.emo}</span><span>${m.label}<small>${m.sub}</small></span></button>`).join('')}</div>`,
    bind: el => $$('[data-mood]', el).forEach(b => b.onclick = () => {
      const m = MOODS.find(x => x.id === b.dataset.mood);
      prefs.mood = m.id; prefs.tone = m.tone; prefs.blocked = m.blocked.slice();
      $$('[data-mood]', el).forEach(x => x.setAttribute('aria-checked', x === b));
    }) },
  { id: 'topics', title: 'Choisissez vos thèmes', lead: 'Touchez au moins 3 bulles. Ils apparaîtront en priorité dans votre fil.',
    render: () => bubbles(),
    bind: el => bindBubbles(el, () => updateNext()),
    valid: () => prefs.topics.length >= 3, invalidMsg: () => `Encore ${3 - prefs.topics.length} thème${3 - prefs.topics.length > 1 ? 's' : ''}` },
  { id: 'details', title: 'Précisez vos centres d\'intérêt', lead: 'Affinez chaque thème et ajoutez des sujets très précis : ils passeront en tête de votre fil.',
    render: () => detailsControls(), bind: el => bindDetails(el) },
  { id: 'sources', title: 'Vos sources d\'information', lead: 'Choisissez les médias que vous voulez lire. Vous pouvez aussi ajouter n\'importe quel flux RSS.',
    render: () => sourcesControls(), bind: el => bindSources(el, updateNext),
    valid: () => enabledSources().length + prefs.customFeeds.length > 0, invalidMsg: () => 'Choisissez au moins une source' },
  { id: 'blocked', title: 'Qu\'est-ce que vous ne voulez plus voir ?', lead: 'Notre IA lit chaque article et masque ceux qui traitent de ces sujets. Pré-rempli selon votre ressenti.',
    render: () => `<div class="options">${SENSITIVE.map(s => `
      <button type="button" class="option block" aria-pressed="${prefs.blocked.includes(s.id)}" data-block="${s.id}"><span class="emo" aria-hidden="true">${s.emoji}</span><span>${s.label}</span></button>`).join('')}</div>`,
    bind: el => $$('[data-block]', el).forEach(b => b.onclick = () => toggleIn(prefs.blocked, b.dataset.block, b)) },
  { id: 'tone', title: 'Quel équilibre souhaitez-vous ?', lead: 'Au-delà des sujets bloqués, réglez le niveau global de « négativité » acceptée.',
    render: () => toneControl(), bind: el => bindTone(el) },
  { id: 'keywords', title: 'Des mots précis à éviter ?', lead: 'Une personnalité, une série que vous n\'avez pas encore vue (spoilers !), un sujet… Séparez par des virgules.',
    render: () => `<div class="field"><label for="f-kw">Mots ou expressions à masquer</label>
      <textarea id="f-kw" class="input" placeholder="ex. spoiler, élection américaine, crypto">${esc(prefs.keywords.join(', '))}</textarea>
      <p class="hint">Facultatif. Les articles qui contiennent ces mots ne s'afficheront pas.</p></div>
      <p class="label">Suggestions</p><div class="row">${['spoiler', 'crypto', 'people', 'faits divers', 'régime'].map(k => `<button type="button" class="chip" data-kw="${k}">+ ${k}</button>`).join('')}</div>`,
    bind: el => $$('[data-kw]', el).forEach(b => b.onclick = () => { const t = $('#f-kw'); t.value = (t.value.trim() ? t.value.replace(/[,\s]*$/, ', ') : '') + b.dataset.kw; b.disabled = true; }),
    collect: () => { prefs.keywords = $('#f-kw').value.split(',').map(s => s.trim()).filter(Boolean); } },
  { id: 'habits', title: 'Quand et combien de temps lisez-vous ?', lead: 'On prépare votre sélection au bon moment, à la bonne taille.',
    render: () => `<p class="label">Moments de lecture</p>${multi('moments', [['morning', '🌅', 'Le matin'], ['noon', '🥪', 'À midi'], ['day', '☀️', 'Pendant la journée'], ['evening', '🌙', 'Le soir'], ['weekend', '🛋️', 'Le week-end']])}
      <p class="label" style="margin-top:24px">Temps disponible</p>${single('duration', [['2', '2 min · l\'essentiel'], ['5', '5 min · un tour d\'horizon'], ['15', '15 min · je prends le temps']])}` },
  { id: 'format', title: 'Vos préférences de lecture', lead: 'Format des articles et actualité locale.',
    render: () => `<p class="label">Format préféré</p>${single('format', [['short', 'Brèves, droit au but'], ['long', 'Articles approfondis'], ['mix', 'Un mélange des deux']])}
      <div class="field" style="margin-top:24px"><label for="f-region">Votre région</label><select id="f-region" class="input">${['France', 'Belgique', 'Suisse', 'Québec', 'Afrique francophone', 'Autre'].map(r => `<option ${prefs.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`,
    collect: () => { prefs.region = $('#f-region').value; } },
  { id: 'notif', title: 'Recevoir une notification ?', lead: 'Seulement des bonnes nouvelles sur vos thèmes — jamais d\'alerte anxiogène. Vous choisissez le rythme.',
    render: () => notifControls(), bind: el => bindNotif(el) },
  { id: 'homepage', title: 'Faire d\'Éclaircie votre page d\'accueil ?', lead: 'À chaque ouverture du navigateur : l\'heure, une recherche et vos 6 meilleures nouvelles du moment, déjà filtrées.',
    render: () => `<div class="options single">
      <button type="button" class="option" role="radio" aria-checked="${prefs.homepage}" data-home="1"><span class="emo">🏠</span><span>Oui, je veux l'installer<small>On vous montre comment à la fin, en 30 secondes</small></span></button>
      <button type="button" class="option" role="radio" aria-checked="${!prefs.homepage}" data-home="0"><span class="emo">👌</span><span>Pas maintenant<small>Disponible à tout moment dans votre profil</small></span></button></div>
      <p class="hint" style="margin-top:16px"><a href="newtab.html" target="_blank" rel="noopener">Aperçu de la page d'accueil ↗</a></p>`,
    bind: el => $$('[data-home]', el).forEach(b => b.onclick = () => { prefs.homepage = b.dataset.home === '1'; $$('[data-home]', el).forEach(x => x.setAttribute('aria-checked', x === b)); }) },
  { id: 'recap', title: () => `C'est prêt${prefs.name ? ', ' + esc(prefs.name) : ''} ✨`, lead: 'Voici votre profil de lecture. Tout reste modifiable depuis l\'onglet Profil.',
    render: () => `<div class="section"><p class="label">Vos thèmes</p><div class="row">${prefs.topics.map(t => `<span class="tag">${topicOf(t).emoji} ${topicOf(t).label}</span>`).join('')}</div>
      ${prefs.subtopics.length || prefs.interests.length ? `<p class="label" style="margin-top:16px">Vos précisions</p><div class="row">${[...subLabels(prefs.subtopics), ...prefs.interests.map(i => '⭐ ' + i)].map(l => `<span class="tag">${esc(l)}</span>`).join('')}</div>` : ''}
      <p class="label" style="margin-top:16px">Sources</p><p class="muted" style="margin:0">${prefs.sources ? prefs.sources.length : SOURCES.length} média${(prefs.sources ? prefs.sources.length : SOURCES.length) > 1 ? 's' : ''}${prefs.customFeeds.length ? ` + ${prefs.customFeeds.length} flux perso` : ''}</p>
      <p class="label" style="margin-top:16px">Bloqués par l'IA</p><div class="row">${prefs.blocked.length ? prefs.blocked.map(b => `<span class="tag" style="background:var(--pink-soft)">${sensOf(b).emoji} ${sensOf(b).label}</span>`).join('') : '<span class="muted">Aucun sujet bloqué</span>'}</div>
      <p class="label" style="margin-top:16px">Équilibre</p><p class="muted" style="margin:0">${toneLabel(prefs.tone)}</p>
      ${prefs.keywords.length ? `<p class="label" style="margin-top:16px">Mots masqués</p><p class="muted" style="margin:0">${esc(prefs.keywords.join(', '))}</p>` : ''}
      <p class="label" style="margin-top:16px">Notifications</p><p class="muted" style="margin:0">${prefs.notif.enabled ? `Oui · ${{ daily: 'un résumé à ' + prefs.notif.time, twice: `à ${prefs.notif.time} et ${prefs.notif.time2}`, day: `jusqu'à ${prefs.notif.maxPerDay} entre ${prefs.notif.time} et ${prefs.notif.time2}`, live: `en temps réel, ${prefs.notif.maxPerDay} max par jour` }[prefs.notif.freq]}` : 'Désactivées'}</p></div>`,
    next: 'Découvrir mon fil' },
];
let stepIdx = 0;

function single(key, opts) {
  return `<div class="options single" role="radiogroup">${opts.map(([v, l]) => `<button type="button" class="option" role="radio" aria-checked="${prefs[key] === v}" data-single="${key}" data-v="${v}"><span>${l}</span></button>`).join('')}</div>`;
}
function multi(key, opts) {
  return `<div class="options">${opts.map(([v, e, l]) => `<button type="button" class="option" aria-pressed="${prefs[key].includes(v)}" data-multi="${key}" data-v="${v}"><span class="emo" aria-hidden="true">${e}</span><span>${l}</span></button>`).join('')}</div>`;
}
function bindGeneric(el) {
  $$('[data-single]', el).forEach(b => b.onclick = () => {
    prefs[b.dataset.single] = b.dataset.v;
    $$(`[data-single="${b.dataset.single}"]`, el).forEach(x => x.setAttribute('aria-checked', x === b));
  });
  $$('[data-multi]', el).forEach(b => b.onclick = () => toggleIn(prefs[b.dataset.multi], b.dataset.v, b));
}
function toggleIn(arr, v, btn) {
  const i = arr.indexOf(v);
  i < 0 ? arr.push(v) : arr.splice(i, 1);
  btn && btn.setAttribute('aria-pressed', i < 0);
}
function bubbles() {
  const sizes = ['lg', '', 'sm', '', 'lg', 'sm', ''];
  return `<div class="bubbles" role="group" aria-label="Thèmes">${TOPICS.map((t, i) => `
    <button type="button" class="bubble ${sizes[i % sizes.length]}" style="--c:${BUBBLE_COLORS[i % BUBBLE_COLORS.length]}" aria-pressed="${prefs.topics.includes(t.id)}" data-topic="${t.id}"><span><span class="emo" aria-hidden="true">${t.emoji}</span>${t.label}</span></button>`).join('')}</div>`;
}
function bindBubbles(el, after) {
  $$('[data-topic]', el).forEach(b => b.onclick = () => { toggleIn(prefs.topics, b.dataset.topic, b); after && after(); });
}
// ---------- Précisions (sous-thèmes + sujets précis) ----------
const subLabels = ids => Object.values(SUBTOPICS).flat().filter(([id]) => ids.includes(id)).map(([, l]) => l);
function detailsControls() {
  const groups = prefs.topics.filter(t => SUBTOPICS[t]);
  return `${groups.length ? groups.map(t => `<fieldset class="group"><legend>${topicOf(t).emoji} ${topicOf(t).label}</legend><div class="row">${SUBTOPICS[t].map(([id, l]) => `<button type="button" class="chip" aria-pressed="${prefs.subtopics.includes(id)}" data-sub="${id}">${l}</button>`).join('')}</div></fieldset>`).join('')
    : '<p class="hint">Suivez d\'abord des thèmes pour voir leurs précisions.</p>'}
    <div class="field" style="margin-top:24px"><label for="f-int">Des sujets très précis ?</label>
      <div class="row"><input id="f-int" class="input" placeholder="ex. PSG, SpaceX, Taylor Swift, Marseille" maxlength="40" style="flex:1;min-width:180px"><button type="button" class="btn btn-dark" id="int-add">Ajouter</button></div>
      <p class="hint">Équipes, personnes, marques, villes… Les articles qui en parlent passent en tête et sont signalés par ⭐.</p>
      <div class="row" id="int-list"></div></div>`;
}
function bindDetails(el, onChange) {
  $$('[data-sub]', el).forEach(b => b.onclick = () => { toggleIn(prefs.subtopics, b.dataset.sub, b); onChange && onChange(); });
  const list = $('#int-list', el), input = $('#f-int', el);
  const draw = () => {
    list.innerHTML = prefs.interests.map((k, i) => `<button type="button" class="chip" aria-pressed="true" data-int="${i}" aria-label="Retirer ${esc(k)}">⭐ ${esc(k)} ✕</button>`).join('');
    $$('[data-int]', list).forEach(b => b.onclick = () => { prefs.interests.splice(+b.dataset.int, 1); draw(); onChange && onChange(); });
  };
  const add = () => {
    const vals = input.value.split(',').map(s => s.trim()).filter(s => s.length > 1 && !prefs.interests.some(k => k.toLowerCase() === s.toLowerCase()));
    if (!vals.length) return;
    prefs.interests.push(...vals); input.value = ''; draw(); onChange && onChange();
  };
  $('#int-add', el).onclick = add;
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  draw();
}

// ---------- Sources ----------
const enabledSources = () => prefs.sources ?? SOURCES.map(s => s.id);
let sourceStatus = null;
const loadSourceStatus = () => sourceStatus || (sourceStatus = fetch('/api/sources').then(r => r.json()).then(d => Object.fromEntries(d.sources.map(s => [s.id, s.count]))).catch(() => ({})));
function sourcesControls() {
  const on = new Set(enabledSources());
  const cats = [...new Set(SOURCES.map(s => s.cat))];
  return `<div class="row" style="margin-bottom:16px"><button type="button" class="btn btn-ghost btn-sm" data-src-all="1">Tout sélectionner</button><button type="button" class="btn btn-ghost btn-sm" data-src-all="0">Tout désélectionner</button></div>
    ${cats.map(c => `<fieldset class="group"><legend>${c}</legend><div class="options src-grid">${SOURCES.filter(s => s.cat === c).map(s => `
      <button type="button" class="option" aria-pressed="${on.has(s.id)}" data-src="${s.id}"><span class="src-logo" aria-hidden="true">${esc(s.name.replace(/^(Le |La |L’|Les )/, '')[0])}</span><span>${esc(s.name)}<small class="src-status" data-status="${s.id}"></small></span></button>`).join('')}</div></fieldset>`).join('')}
    <fieldset class="group"><legend>Flux RSS personnalisés</legend>
      <div class="row"><label for="f-rss" class="sr">Adresse d'un flux RSS</label><input id="f-rss" class="input" type="url" inputmode="url" placeholder="https://exemple.fr/feed" style="flex:1;min-width:200px"><button type="button" class="btn btn-dark" id="rss-add">Ajouter</button></div>
      <p class="hint" id="rss-msg" role="status">Blog, média local, newsletter… La plupart des sites ont un flux RSS (souvent /feed ou /rss).</p>
      <div id="rss-list" style="display:grid;gap:8px;margin-top:8px"></div></fieldset>`;
}
function bindSources(el, onChange) {
  const sync = () => { const on = new Set(enabledSources()); $$('[data-src]', el).forEach(b => b.setAttribute('aria-pressed', on.has(b.dataset.src))); onChange && onChange(); };
  $$('[data-src]', el).forEach(b => b.onclick = () => {
    const on = enabledSources().slice();
    toggleIn(on, b.dataset.src);
    prefs.sources = on.length === SOURCES.length ? null : on;
    sync();
  });
  $$('[data-src-all]', el).forEach(b => b.onclick = () => { prefs.sources = b.dataset.srcAll === '1' ? null : []; sync(); });
  loadSourceStatus().then(st => $$('[data-status]', el).forEach(s => {
    const n = st[s.dataset.status];
    s.textContent = n == null ? '' : n ? `${n} articles en ce moment` : 'Indisponible pour le moment';
    s.classList.toggle('off', n === 0);
  }));
  const list = $('#rss-list', el), input = $('#f-rss', el), msg = $('#rss-msg', el);
  const draw = () => {
    list.innerHTML = prefs.customFeeds.map((f, i) => `<div class="option" style="min-height:52px"><span class="emo">📡</span><span style="flex:1;min-width:0">${esc(f.name)}<small style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.url)}</small></span><button type="button" class="icon-btn" data-rss-rm="${i}" aria-label="Retirer ${esc(f.name)}">${ICONS.x}</button></div>`).join('');
    $$('[data-rss-rm]', list).forEach(b => b.onclick = () => { prefs.customFeeds.splice(+b.dataset.rssRm, 1); draw(); articles = []; onChange && onChange(); });
  };
  $('#rss-add', el).onclick = async () => {
    const url = input.value.trim();
    if (!url) return;
    if (prefs.customFeeds.some(f => f.url === url)) { msg.textContent = 'Ce flux est déjà dans votre liste.'; return; }
    msg.textContent = 'Vérification du flux…';
    try {
      const r = await (await fetch('/api/sources/test?url=' + encodeURIComponent(url))).json();
      if (!r.ok) { msg.textContent = '⚠️ ' + r.error; return; }
      prefs.customFeeds.push({ url: r.url, name: r.name });
      input.value = ''; msg.textContent = `✓ « ${r.name} » ajouté (${r.count} articles).`;
      articles = []; draw(); onChange && onChange();
    } catch { msg.textContent = '⚠️ Serveur injoignable : lancez node server.js pour ajouter des flux.'; }
  };
  draw();
}

function toneLabel(v) {
  if (v < 20) return '🌤️ Uniquement des nouvelles positives et inspirantes';
  if (v < 45) return '🌥️ Surtout du positif, un peu de neutre';
  if (v < 75) return '⛅ Équilibré : positif et neutre, sans le plus anxiogène';
  return '☁️ Toute l\'actualité factuelle (hors sujets bloqués)';
}
function toneControl() {
  return `<label class="label" for="f-tone">Niveau de négativité accepté</label>
    <input id="f-tone" class="range" type="range" min="0" max="100" step="5" value="${prefs.tone}" aria-describedby="tone-preview">
    <div class="range-labels"><span>Que du positif</span><span>Tout voir</span></div>
    <div class="tone-preview" id="tone-preview">${toneLabel(prefs.tone)}</div>`;
}
function bindTone(el, onChange) {
  const r = $('#f-tone', el);
  r.oninput = () => { prefs.tone = +r.value; $('#tone-preview', el).textContent = toneLabel(prefs.tone); onChange && onChange(); };
}
function notifControls() {
  const n = prefs.notif;
  const unsupported = !('Notification' in window);
  return `<label class="switch"><span><b>Activer les notifications</b><br><span class="hint">${unsupported ? 'Non pris en charge par ce navigateur. Installez l\'app sur votre écran d\'accueil.' : 'Votre navigateur vous demandera l\'autorisation.'}</span></span><input type="checkbox" id="n-on" ${n.enabled ? 'checked' : ''} ${unsupported ? 'disabled' : ''}></label>
    <div id="n-more" ${n.enabled ? '' : 'hidden'}>
      <p class="label" style="margin-top:16px">Rythme</p>
      <div class="options single" role="radiogroup">${FREQS.map(([v, l, sub]) => `<button type="button" class="option" role="radio" aria-checked="${n.freq === v}" data-freq="${v}"><span>${l}<small>${sub}</small></span></button>`).join('')}</div>
      <div id="n-when">${notifWhen(n)}</div>
      <p class="label" style="margin-top:8px">Heures de silence</p>
      <p class="hint" style="margin-bottom:8px">Aucune notification pendant ce créneau, quel que soit le rythme.</p>
      <div class="row">
        <div class="field" style="flex:1;min-width:130px"><label for="n-qs">De</label><input type="time" id="n-qs" class="input" value="${n.quietStart}"></div>
        <div class="field" style="flex:1;min-width:130px"><label for="n-qe">Jusqu'à</label><input type="time" id="n-qe" class="input" value="${n.quietEnd}"></div>
      </div>
    </div>`;
}
const FREQS = [
  ['daily', 'Un résumé par jour', 'Les meilleures nouvelles, regroupées à l\'heure choisie'],
  ['twice', 'Matin et soir', 'Deux résumés, aux heures choisies'],
  ['day', 'Pendant la journée', 'Quelques nouvelles réparties sur votre créneau'],
  ['live', 'Dès qu\'une bonne nouvelle tombe', 'En temps réel, avec une limite par jour'],
];
// Les champs horaires dépendent du rythme choisi.
function notifWhen(n) {
  const time = (id, label, v) => `<div class="field" style="flex:1;min-width:130px"><label for="${id}">${label}</label><input type="time" id="${id}" class="input" value="${v}"></div>`;
  const max = `<p class="label">Maximum par jour</p><div class="row" role="radiogroup" aria-label="Maximum de notifications par jour" style="margin-bottom:20px">${[1, 3, 5].map(v => `<button type="button" class="chip" role="radio" aria-pressed="${n.maxPerDay === v}" aria-checked="${n.maxPerDay === v}" data-max="${v}">${v} notification${v > 1 ? 's' : ''}</button>`).join('')}</div>`;
  return `<div style="margin-top:16px">${{
    daily: `<div class="row">${time('n-time', 'Heure du résumé', n.time)}</div>`,
    twice: `<div class="row">${time('n-time', 'Résumé du matin', n.time)}${time('n-time2', 'Résumé du soir', n.time2)}</div>`,
    day: `<div class="row">${time('n-time', 'À partir de', n.time)}${time('n-time2', 'Jusqu\'à', n.time2)}</div>${max}`,
    live: max,
  }[n.freq]}</div>`;
}
function bindNotif(el, onChange) {
  const n = prefs.notif;
  const on = $('#n-on', el);
  if (on) on.onchange = async () => {
    if (on.checked) {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { on.checked = false; toast('Notifications refusées par le navigateur'); return; }
    }
    n.enabled = on.checked; $('#n-more', el).hidden = !n.enabled; onChange && onChange();
  };
  const bindWhen = () => {
    [['n-time', 'time'], ['n-time2', 'time2'], ['n-qs', 'quietStart'], ['n-qe', 'quietEnd']].forEach(([id, k]) => { const i = $('#' + id, el); if (i) i.onchange = () => { n[k] = i.value; onChange && onChange(); }; });
    $$('[data-max]', el).forEach(b => b.onclick = () => {
      n.maxPerDay = +b.dataset.max;
      $$('[data-max]', el).forEach(x => { x.setAttribute('aria-pressed', x === b); x.setAttribute('aria-checked', x === b); });
      onChange && onChange();
    });
  };
  $$('[data-freq]', el).forEach(b => b.onclick = () => {
    n.freq = b.dataset.freq;
    $$('[data-freq]', el).forEach(x => x.setAttribute('aria-checked', x === b));
    if (n.freq === 'day' && n.time2 < '12:00') n.time2 = '19:00';
    $('#n-when', el).innerHTML = notifWhen(n);
    bindWhen(); onChange && onChange();
  });
  bindWhen();
}

function renderOnboarding() {
  const s = STEPS[stepIdx];
  const title = typeof s.title === 'function' ? s.title() : s.title;
  main.innerHTML = `<div class="ob">
    <div class="ob-top">
      <button class="icon-btn" id="ob-back" aria-label="Question précédente" ${stepIdx ? '' : 'style="visibility:hidden"'}>${ICONS.back}</button>
      <div class="progress" role="progressbar" aria-label="Progression de l'inscription" aria-valuemin="1" aria-valuemax="${STEPS.length}" aria-valuenow="${stepIdx + 1}"><i style="width:${(stepIdx + 1) / STEPS.length * 100}%"></i></div>
      <span class="ob-step">${stepIdx + 1}/${STEPS.length}</span>
    </div>
    <section class="ob-body" aria-labelledby="ob-title">
      ${title ? `<h1 id="ob-title">${title}</h1><p class="lead">${s.lead}</p>` : ''}
      ${s.render()}
    </section>
    <div class="ob-foot">
      ${stepIdx && stepIdx < STEPS.length - 1 && s.id !== 'topics' ? '<button class="btn btn-ghost" id="ob-skip">Passer</button>' : ''}
      <button class="btn btn-primary" id="ob-next">${s.next || 'Continuer'}</button>
    </div></div>`;
  const body = $('.ob-body');
  if (!title) body.querySelector('h1').id = 'ob-title';
  bindGeneric(body);
  s.bind && s.bind(body);
  updateNext();
  $('#ob-next').onclick = () => go(1, true);
  $('#ob-back').onclick = () => go(-1, true);
  const skip = $('#ob-skip'); if (skip) skip.onclick = () => go(1, false);
  if (['name', 'keywords'].includes(s.id)) $('input, textarea', body).focus();
}
function updateNext() {
  const s = STEPS[stepIdx], btn = $('#ob-next');
  if (!btn || !s.valid) return;
  const ok = s.valid();
  btn.disabled = !ok;
  btn.textContent = ok ? (s.next || 'Continuer') : s.invalidMsg();
}
function go(dir, collect) {
  const s = STEPS[stepIdx];
  if (collect && s.collect) s.collect();
  store.set('prefs', prefs);
  if (dir > 0 && stepIdx === STEPS.length - 1) {
    store.set('onboarded', true);
    savePrefs();
    location.hash = prefs.homepage ? '#/profile' : '#/feed';
    if (prefs.homepage) setTimeout(() => $('#homepage')?.scrollIntoView({ behavior: 'smooth' }), 300);
    return;
  }
  stepIdx = Math.max(0, Math.min(STEPS.length - 1, stepIdx + dir));
  renderOnboarding();
}

// =====================================================================
// FIL D'ACTUALITÉ
// =====================================================================
// L'accueil a deux fils : vos favoris (ciblé) et l'essentiel (actualité générale, toujours filtrée par le bouclier).
let redraw = () => { };          // redessine la page courante après un changement de préférences
let generalFilter = 'all';
let favFilter = 'all';
const isFavorite = a => a.match.interests.length > 0 || a.match.subs.length > 0 || prefs.topics.includes(a.ai.topic);
const GENERAL_CATS = new Set(['Généraliste', 'International', 'Économie']);
const isGeneralSource = a => !a.sourceId || GENERAL_CATS.has(SOURCES.find(s => s.id === a.sourceId)?.cat);
const RAIL_SIZE = 8;

function splitFeed(res) {
  const favorites = res.visible.filter(isFavorite); // déjà triés : intérêts précis > précisions > thèmes
  const inRail = new Set(favorites.slice(0, RAIL_SIZE).map(a => a.id));
  const general = res.visible.filter(a => !inRail.has(a.id) && (isGeneralSource(a) || !isFavorite(a)))
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  return { favorites, general };
}
const demoBanner = () => source === 'demo' ? `<div class="demo-banner" role="alert"><span aria-hidden="true">📡</span>
  <span><b>Articles d'exemple</b> : le serveur ne répond pas, ce ne sont pas de vraies actualités.<br><span class="hint">Lancez <code>node --env-file-if-exists=.env server.js</code> dans le dossier du projet.</span></span>
  <button class="btn btn-dark btn-sm" data-retry>Réessayer</button></div>` : '';
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-retry]');
  if (!b) return;
  b.disabled = true; b.textContent = 'Connexion…';
  await loadArticles(true); redraw();
  if (source === 'live') toast('Connecté : vraies actualités chargées');
});
function shieldHTML(res) {
  return `${demoBanner()}<button class="shield" id="shield-btn"><span class="ic" aria-hidden="true">🛡️</span>
    <span>Votre bouclier a masqué <b>${res.hiddenTotal} article${res.hiddenTotal > 1 ? 's' : ''}</b> aujourd'hui</span><span class="chev" aria-hidden="true">›</span></button>`;
}
// Squelettes qui reprennent la forme d'une vraie carte (image, étiquettes, titre, texte, actions).
const skeletons = n => Array.from({ length: n }, (_, i) => `<div class="skel-card" aria-hidden="true" style="animation-delay:${i * 120}ms">
  <div class="skel skel-media"></div><div class="skel-body"><div class="skel skel-tag"></div><div class="skel skel-line w90"></div><div class="skel skel-line w70"></div><div class="skel skel-line w50 thin"></div></div></div>`).join('');
// Messages rassurants si le chargement dure (au lieu d'un écran figé).
function loadingMessages(sel) {
  const steps = [[1200, '🔎 On rassemble vos actualités…'], [4000, '🛡️ Le bouclier trie les articles pour vous…'], [9000, '⏳ Le serveur met plus de temps que d\'habitude…']];
  const timers = steps.map(([ms, text]) => setTimeout(() => { const el = $(sel); if (el) el.textContent = text; }, ms));
  return () => timers.forEach(clearTimeout);
}
const emptyHTML = (msg, cta) => `<div class="empty" style="grid-column:1/-1"><div class="big">🌱</div><p>${msg}</p>${cta || ''}</div>`;
const chipsHTML = (list, current) => list.map(([id, l]) => `<button class="chip" aria-pressed="${current === id}" data-f="${esc(id)}">${esc(l)}</button>`).join('');

async function renderFeed() {
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  main.innerHTML = `
    <header class="top"><span class="logo"><span class="brand-mark" aria-hidden="true"></span>Éclaircie</span>
      <button class="icon-btn" id="refresh" aria-label="Actualiser">${ICONS.refresh}</button></header>
    <div class="greet"><h1>${hello}${prefs.name ? ', ' + esc(prefs.name) : ''}</h1>
      <p>${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · votre éclaircie du jour</p></div>
    <div id="shield"><div class="skel-shield"></div><p class="load-msg" id="load-msg" role="status" aria-live="polite"></p></div>
    <section aria-labelledby="h-fav">
      <div class="sec-head"><h2 id="h-fav">⭐ Vos favoris</h2><a href="#/favorites" class="see-all">Voir tout →</a></div>
      <div class="rail" id="rail" aria-busy="true">${skeletons(3)}</div>
    </section>
    <section aria-labelledby="h-gen">
      <div class="sec-head"><div><h2 id="h-gen">📰 L'essentiel</h2><p class="hint">L'actualité générale, filtrée par votre bouclier</p></div></div>
      <div class="chips" role="toolbar" aria-label="Filtrer l'essentiel" id="chips"></div>
      <div class="feed" id="feed" aria-busy="true">${skeletons(2)}</div>
    </section>`;
  $('#refresh').onclick = e => refreshNow(e.currentTarget);
  redraw = drawFeed;
  const stopMsgs = loadingMessages('#load-msg');
  await loadArticles();
  stopMsgs();
  drawFeed();
}
function drawFeed() {
  const res = myFeed();
  const { favorites, general } = splitFeed(res);
  $('#shield').innerHTML = shieldHTML(res);
  $('#shield-btn').onclick = () => shieldSheet(res);

  const rail = $('#rail');
  rail.setAttribute('aria-busy', 'false');
  const top = favorites.slice(0, RAIL_SIZE);
  rail.innerHTML = top.length
    ? top.map((a, i) => cardHTML(a, i, false)).join('') + (favorites.length > RAIL_SIZE ? `<a class="rail-more" href="#/favorites"><b>+${favorites.length - RAIL_SIZE}</b><span>articles favoris</span></a>` : '')
    : emptyHTML('Aucun favori pour le moment.', '<a class="btn btn-ghost btn-sm" href="#/profile/details">Choisir mes favoris</a>');
  bindCards(rail, top);

  // Filtres de l'essentiel : bonnes nouvelles + les grandes rubriques présentes.
  const rubrics = ['monde', 'politique', 'business', 'science', 'planete', 'culture', 'sport'].filter(t => general.some(a => a.ai.topic === t));
  $('#chips').innerHTML = chipsHTML([['all', 'Tout'], ['good', '🌤️ Bonnes nouvelles'], ...rubrics.map(t => [t, `${topicOf(t).emoji} ${topicOf(t).label}`])], generalFilter);
  $$('#chips [data-f]').forEach(b => b.onclick = () => { generalFilter = b.dataset.f; drawFeed(); });
  let list = general;
  if (generalFilter === 'good') list = list.filter(a => a.ai.tone > 0.15);
  else if (generalFilter !== 'all') list = list.filter(a => a.ai.topic === generalFilter);
  const feed = $('#feed');
  feed.setAttribute('aria-busy', 'false');
  feed.innerHTML = list.length ? list.slice(0, 30).map((a, i) => cardHTML(a, i)).join('')
    : emptyHTML('Rien de neuf ici pour l\'instant.<br>Essayez une autre rubrique ou élargissez votre équilibre dans le profil.');
  bindCards(feed, list);
}

// =====================================================================
// FAVORIS — fil dédié au contenu ciblé
// =====================================================================
async function renderFavorites() {
  main.innerHTML = `<header class="top"><h1 style="font-size:32px">Mes favoris</h1>
      <a class="btn btn-ghost btn-sm" href="#/profile/details">Gérer</a></header>
    <p class="muted" id="fav-sub" style="margin:4px 0 12px"></p>
    <div class="chips" role="toolbar" aria-label="Filtrer mes favoris" id="fav-chips"></div>
    <div class="feed" id="fav-feed" aria-busy="true">${skeletons(3)}</div>`;
  redraw = drawFavorites;
  await loadArticles();
  drawFavorites();
}
function drawFavorites() {
  const { favorites } = splitFeed(myFeed());
  const chips = [['all', 'Tout'],
    ...prefs.interests.map(k => ['i:' + k, '⭐ ' + k]),
    ...Object.values(SUBTOPICS).flat().filter(([id]) => prefs.subtopics.includes(id)).map(([, l]) => ['s:' + l, l]),
    ...prefs.topics.map(t => ['t:' + t, `${topicOf(t).emoji} ${topicOf(t).label}`])];
  if (!chips.some(([id]) => id === favFilter)) favFilter = 'all';
  $('#fav-chips').innerHTML = chipsHTML(chips, favFilter);
  $$('#fav-chips [data-f]').forEach(b => b.onclick = () => { favFilter = b.dataset.f; drawFavorites(); });
  const [kind, val] = favFilter === 'all' ? [] : [favFilter.slice(0, 1), favFilter.slice(2)];
  const list = !kind ? favorites : favorites.filter(a =>
    kind === 'i' ? a.match.interests.includes(val) : kind === 's' ? a.match.subs.includes(val) : a.ai.topic === val);
  $('#fav-sub').textContent = `${favorites.length} article${favorites.length > 1 ? 's' : ''} sur vos ${prefs.interests.length + prefs.subtopics.length + prefs.topics.length} favoris · les sujets précis en premier`;
  const feed = $('#fav-feed');
  feed.setAttribute('aria-busy', 'false');
  feed.innerHTML = list.length ? list.slice(0, 60).map((a, i) => cardHTML(a, i)).join('')
    : emptyHTML(favorites.length ? 'Rien sur ce favori pour l\'instant.' : 'Ajoutez des thèmes, des précisions ou des sujets précis pour remplir ce fil.', '<a class="btn btn-primary" href="#/profile/details">Choisir mes favoris</a>');
  bindCards(feed, list);
}

function cardHTML(a, i, hero = i === 0) {
  const t = topicOf(a.ai.topic);
  const isSaved = saved.some(s => s.id === a.id);
  return `<article class="card ${hero ? 'hero' : ''} ${PALETTE[i % PALETTE.length]}" style="animation-delay:${Math.min(i, 8) * 40}ms">
    <div class="media" data-emoji="${t.emoji}" style="--g:${gradFor(a.ai.topic)}">${imgHTML(a, true)}</div>
    <div class="body">
      <div class="meta">${a.match?.interests.length ? `<span class="tag star">⭐ ${esc(a.match.interests[0])}</span>` : ''}<span class="tag">${t.emoji} ${a.match?.subs[0] ? esc(a.match.subs[0]) : t.label}</span>${a.ai.tone > 0.15 ? '<span class="tag good">Bonne nouvelle</span>' : ''}<span>${esc(a.source)} · ${timeAgo(a.date)}</span></div>
      <h2><a href="#/article/${encodeURIComponent(a.id)}">${esc(a.title)}</a></h2>
      <p>${esc(a.summary)}</p>
      <div class="actions">
        <button class="icon-btn" data-act="save" data-id="${esc(a.id)}" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Retirer des sauvegardés' : 'Sauvegarder'}">${ICONS.save}</button>
        <button class="icon-btn" data-act="share" data-id="${esc(a.id)}" aria-label="Partager">${ICONS.share}</button>
        <button class="icon-btn" data-act="less" data-id="${esc(a.id)}" aria-label="Moins de contenus comme celui-ci">${ICONS.less}</button>
        <button class="why" data-act="why" data-id="${esc(a.id)}">Pourquoi je vois ça ?</button>
      </div>
    </div></article>`;
}
function bindCards(root, list) {
  $$('[data-act]', root).forEach(b => b.onclick = e => {
    e.preventDefault();
    const a = list.find(x => x.id === b.dataset.id);
    ({ save: () => toggleSave(a, b), share: () => share(a), less: () => lessSheet(a), why: () => whySheet(a) })[b.dataset.act]();
  });
}
function toggleSave(a, btn) {
  const i = saved.findIndex(s => s.id === a.id);
  if (i < 0) saved.unshift(a); else saved.splice(i, 1);
  store.set('saved', saved);
  if (btn) { btn.setAttribute('aria-pressed', i < 0); btn.setAttribute('aria-label', i < 0 ? 'Retirer des sauvegardés' : 'Sauvegarder'); }
  toast(i < 0 ? 'Ajouté à vos sauvegardés' : 'Retiré des sauvegardés', i < 0 ? null : { label: 'Annuler', run: () => toggleSave(a, btn) });
}
async function share(a) {
  const data = { title: a.title, text: a.summary, url: a.url || location.href };
  if (navigator.share) { try { await navigator.share(data); } catch { /* annulé */ } }
  else { try { await navigator.clipboard.writeText(data.url); toast('Lien copié'); } catch { toast('Copie impossible'); } }
}
function whySheet(a) {
  const t = topicOf(a.ai.topic);
  const followed = prefs.topics.includes(a.ai.topic);
  sheet(`<h2 id="sheet-title">Pourquoi cet article ?</h2>
    <ul class="steps">
      ${a.match?.interests.length ? `<li>Il parle de <b>⭐ ${a.match.interests.map(esc).join(', ')}</b>, un de vos sujets précis.</li>` : ''}
      ${a.match?.subs.length ? `<li>Il correspond à vos précisions : <b>${a.match.subs.map(esc).join(', ')}</b>.</li>` : ''}
      <li>${followed ? `Vous suivez le thème <b>${t.emoji} ${t.label}</b>.` : `Thème détecté : <b>${t.emoji} ${t.label}</b> (vous ne le suivez pas encore).`}</li>
      <li>Ton estimé : <b>${a.ai.tone > 0.15 ? 'positif' : a.ai.tone < -0.15 ? 'plutôt négatif' : 'neutre'}</b> (${a.ai.tone}), compatible avec votre équilibre.</li>
      <li>Aucun de vos ${prefs.blocked.length} sujets bloqués n'a été détecté.</li>
      <li class="muted">Analyse : ${a.ai.by === 'IA' ? `intelligence artificielle (${esc(a.ai.engine || 'IA')})` : 'mots-clés (IA non configurée sur le serveur)'}.</li>
    </ul>`);
}
function lessSheet(a) {
  const t = topicOf(a.ai.topic);
  const d = sheet(`<h2 id="sheet-title">Moins de contenus comme celui-ci</h2><p class="muted">Que souhaitez-vous masquer ?</p>
    <div class="options single">
      <button class="option" data-less="topic"><span class="emo">${t.emoji}</span><span>Masquer le thème « ${t.label} »<small>Vous pourrez le réactiver dans Profil</small></span></button>
      <button class="option" data-less="source"><span class="emo">📰</span><span>Masquer la source « ${esc(a.source)} »</span></button>
      <button class="option" data-less="word"><span class="emo">🔤</span><span>Bloquer un mot de ce titre…</span></button>
      <button class="option block" data-less="report"><span class="emo">🚩</span><span>Ce contenu aurait dû être bloqué<small>Signaler au bouclier</small></span></button>
    </div>`);
  $$('[data-less]', d).forEach(b => b.onclick = () => {
    const kind = b.dataset.less;
    if (kind === 'report') { d.close(); return reportSheet(a); }
    if (kind === 'topic') { if (!prefs.mutedTopics.includes(t.id)) prefs.mutedTopics.push(t.id); prefs.topics = prefs.topics.filter(x => x !== t.id); }
    if (kind === 'source') prefs.keywords.push(a.source);
    if (kind === 'word') { const w = prompt('Mot ou expression à bloquer :', ''); if (!w) return; prefs.keywords.push(w.trim()); }
    savePrefs(); d.close(); redraw(); toast('C\'est noté, votre fil est mis à jour');
  });
}
// Signalement : masque l'article ici, et l'envoie au serveur pour qu'il soit masqué chez tous ceux qui bloquent ce sujet.
function reportSheet(a) {
  const d = sheet(`<h2 id="sheet-title">Signaler au bouclier 🚩</h2>
    <p class="muted">De quoi parle vraiment cet article ? Il sera masqué tout de suite, et le bouclier s'améliorera pour tout le monde.</p>
    <div class="options single">${SENSITIVE.map(s => `<button class="option block" data-rep="${s.id}"><span class="emo">${s.emoji}</span><span>${s.label}</span></button>`).join('')}</div>`);
  $$('[data-rep]', d).forEach(b => b.onclick = () => {
    const category = b.dataset.rep;
    store.set('reported', Object.assign(store.get('reported', {}), { [a.id]: category }));
    if (!prefs.blocked.includes(category)) { prefs.blocked.push(category); savePrefs(); }
    fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, title: a.title, category }) }).catch(() => { });
    d.close();
    toast(`Merci, article masqué. « ${sensOf(category).label} » est bloqué.`);
    if (location.hash.startsWith('#/article/')) history.length > 1 ? history.back() : (location.hash = '#/feed');
    else redraw();
  });
}
function shieldSheet(res) {
  const rows = Object.entries(res.hidden).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(r => r[1]));
  const label = k => k === 'tone' ? '🌥️ Ton trop négatif' : k === 'keyword' ? '🔤 Mots bloqués' : k === 'muted' ? '🙈 Thèmes masqués' : k === 'reported' ? '🚩 Signalés par vous' : `${sensOf(k).emoji} ${sensOf(k).label}`;
  sheet(`<h2 id="sheet-title">Votre bouclier 🛡️</h2>
    <p class="muted">${res.hiddenTotal} article${res.hiddenTotal > 1 ? 's' : ''} masqué${res.hiddenTotal > 1 ? 's' : ''} sur ${res.hiddenTotal + res.visible.length}. Les titres ne sont jamais affichés, pour vous préserver.</p>
    ${rows.length ? `<div class="bars">${rows.map(([k, n]) => `<div class="b"><span>${label(k)}</span><b>${n}</b><i style="width:${n / max * 100}%"></i></div>`).join('')}</div>` : '<p>Rien à masquer pour le moment 🌤️</p>'}
    <a class="btn btn-primary" href="#/profile" onclick="document.getElementById('sheet').close()">Régler mon bouclier</a>`);
}

// =====================================================================
// LECTEUR
// =====================================================================
async function renderArticle(id) {
  await loadArticles();
  const a = articles.find(x => x.id === id) || saved.find(x => x.id === id);
  if (!a) { main.innerHTML = `<div class="empty"><div class="big">🔍</div><p>Article introuvable.</p><a class="btn btn-primary" href="#/feed">Retour au fil</a></div>`; return; }
  const c = a.ai || window.Eclaircie.heuristicClassify(a);
  const t = topicOf(c.topic);
  const isSaved = saved.some(s => s.id === a.id);
  main.innerHTML = `<article class="reader">
    <div class="bar"><button class="icon-btn" onclick="history.length > 1 ? history.back() : location.hash='#/feed'" aria-label="Retour">${ICONS.back}</button>
      <div class="right"><button class="icon-btn" id="r-save" aria-pressed="${isSaved}" aria-label="Sauvegarder">${ICONS.save}</button><button class="icon-btn" id="r-share" aria-label="Partager">${ICONS.share}</button></div></div>
    <p class="eyebrow kicker">${t.emoji} ${t.label}${c.tone > 0.15 ? ' · Bonne nouvelle' : ''}</p>
    <h1>${esc(a.title)}</h1>
    <p class="byline">${esc(a.source)} — ${new Date(a.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <div class="hero-img media" data-emoji="${t.emoji}" style="--g:${gradFor(c.topic)}">${imgHTML(a, false)}</div>
    <p class="text">${esc(a.summary)}</p>
    <div class="ai-box">
      <p style="margin:0 0 10px">${c.by === 'IA'
        ? `🛡️ <b>Analysé par l'IA</b>${c.engine ? ` (${esc(c.engine)})` : ''} : aucun de vos sujets bloqués n'a été détecté.`
        : '🛡️ <b>Analyse rapide par mots-clés</b>, moins fiable que l\'IA (non activée sur ce serveur).'}</p>
      <button class="btn btn-ghost btn-sm" id="r-report">🚩 Ce contenu aurait dû être bloqué</button>
    </div>
    ${a.url ? `<a class="btn btn-primary" style="width:100%" href="${esc(a.url)}" target="_blank" rel="noopener">Lire l'article complet sur ${esc(a.source)} ↗</a>` : '<p class="hint" style="text-align:center">Article d\'exemple : lancez le serveur pour obtenir les vraies actualités.</p>'}
  </article>`;
  $('#r-save').onclick = e => toggleSave(a, e.currentTarget);
  $('#r-share').onclick = () => share(a);
  $('#r-report').onclick = () => reportSheet(a);
}

// =====================================================================
// EXPLORER
// =====================================================================
async function renderExplore() {
  main.innerHTML = `<header class="top"><h1 style="font-size:32px">Explorer</h1></header>
    <div class="field" style="margin-top:16px"><label for="q" class="sr">Rechercher</label>
      <input id="q" class="input" type="search" placeholder="Rechercher dans votre actualité filtrée…" autocomplete="off"></div>
    <div id="results"></div>
    <h2 style="font-size:22px;margin:24px 0 4px">Vos thèmes</h2><p class="hint">Touchez une bulle pour suivre ou ne plus suivre un thème.</p>
    ${bubbles()}`;
  bindBubbles(main, () => { savePrefs(); toast('Thèmes mis à jour'); });
  await loadArticles();
  let timer;
  $('#q').oninput = e => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const q = window.Eclaircie.normalize(e.target.value).trim();
      const box = $('#results');
      if (q.length < 2) { box.innerHTML = ''; return; }
      const found = myFeed().visible.filter(a => window.Eclaircie.normalize(a.title + ' ' + a.summary).includes(q));
      box.innerHTML = found.length ? `<p class="hint">${found.length} résultat${found.length > 1 ? 's' : ''}</p><div class="feed">${found.slice(0, 20).map((a, i) => cardHTML(a, i + 1)).join('')}</div>` : '<div class="empty"><p>Aucun résultat dans votre fil filtré.</p></div>';
      bindCards(box, found);
    }, 200);
  };
}

// =====================================================================
// SAUVEGARDÉS
// =====================================================================
function renderSaved() {
  const rot = ['-1.5deg', '1deg', '-0.5deg', '1.5deg'];
  const colors = ['var(--cream)', 'var(--pink-soft)', 'var(--blue-soft)', '#F3EDDF'];
  main.innerHTML = `<header class="top"><h1 style="font-size:32px">Sauvegardés</h1></header>
    ${saved.length ? `<p class="muted">${saved.length} article${saved.length > 1 ? 's' : ''} à lire plus tard</p>
    <div class="stack">${saved.map((a, i) => `<a class="s-card" href="#/article/${encodeURIComponent(a.id)}" style="--c:${colors[i % 4]};--r:${rot[i % 4]}">
      <span class="eyebrow" style="color:var(--ink)">${topicOf(a.ai?.topic).emoji} ${topicOf(a.ai?.topic).label}</span>
      <h3>${esc(a.title)}</h3><p>${esc(a.source)} · ${timeAgo(a.date)}</p>
      <button class="icon-btn rm" data-rm="${esc(a.id)}" aria-label="Retirer « ${esc(a.title)} »">${ICONS.x}</button></a>`).join('')}</div>`
    : `<div class="empty"><div class="big">🔖</div><p>Aucun article sauvegardé.<br>Touchez l'icône marque-page sur un article pour le garder ici.</p><a class="btn btn-primary" href="#/feed">Parcourir mon fil</a></div>`}`;
  $$('[data-rm]').forEach(b => b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    const a = saved.find(s => s.id === b.dataset.rm);
    toggleSave(a); renderSaved();
  });
}

// =====================================================================
// PROFIL & RÉGLAGES
// =====================================================================
function renderProfile(anchor) {
  if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  const origin = location.origin.startsWith('http') ? location.origin : 'http://localhost:3000';
  const newtab = origin + '/newtab.html';
  const enc = a => encodeURIComponent(a.join(','));
  const apiUrl = `${origin}/api/news?topics=${enc(prefs.topics)}`
    + (prefs.subtopics.length ? `&subtopics=${enc(prefs.subtopics)}` : '') + (prefs.interests.length ? `&interests=${enc(prefs.interests)}` : '')
    + (prefs.sources ? `&sources=${enc(prefs.sources)}` : '') + (prefs.customFeeds.length ? `&extra=${enc(prefs.customFeeds.map(f => f.url))}` : '')
    + `&block=${enc(prefs.blocked)}&tone=${prefs.tone}&limit=10`;
  main.innerHTML = `<header class="profile-head"><div class="avatar" aria-hidden="true">${esc((prefs.name || '?')[0].toUpperCase())}</div>
      <div><h1 style="font-size:28px">${esc(prefs.name || 'Mon profil')}</h1><p class="muted" style="margin:0">${prefs.topics.length} thèmes suivis · ${prefs.blocked.length} sujets bloqués</p></div></header>

    <section class="section"><h2>Mes thèmes</h2><p class="hint">Ils remontent en tête de votre fil.</p>
      <div class="options">${TOPICS.map(t => `<button class="option" aria-pressed="${prefs.topics.includes(t.id)}" data-p-topic="${t.id}"><span class="emo">${t.emoji}</span><span>${t.label}</span></button>`).join('')}</div>
      ${prefs.mutedTopics.length ? `<p class="label" style="margin-top:16px">Thèmes masqués</p><div class="row">${prefs.mutedTopics.map(t => `<button class="chip" data-unmute="${t}">${topicOf(t).emoji} ${topicOf(t).label} ✕</button>`).join('')}</div>` : ''}</section>

    <section class="section" id="details"><h2>Précisions</h2><p class="hint">Sous-thèmes et sujets précis : ils passent en tête de votre fil.</p><div id="details-box">${detailsControls()}</div></section>

    <section class="section" id="sources"><h2>Sources 📰</h2><p class="hint">Les médias lus pour composer votre fil.</p>${sourcesControls()}</section>

    <section class="section"><h2>Bouclier IA 🛡️</h2><p class="hint">Les articles traitant de ces sujets sont masqués, même si le titre est trompeur.</p>
      ${SENSITIVE.map(s => `<label class="switch"><span>${s.emoji} ${s.label}</span><input type="checkbox" data-p-block="${s.id}" ${prefs.blocked.includes(s.id) ? 'checked' : ''}></label>`).join('')}</section>

    <section class="section"><h2>Équilibre</h2><p class="hint">Niveau de négativité accepté pour le reste de l'actualité.</p>${toneControl()}</section>

    <section class="section"><h2>Mots masqués</h2>
      <div class="field"><label for="p-kw" class="sr">Mots masqués</label><textarea id="p-kw" class="input" placeholder="séparés par des virgules">${esc(prefs.keywords.join(', '))}</textarea></div></section>

    <section class="section" id="notifs"><h2>Notifications 🔔</h2><p class="hint">Uniquement des bonnes nouvelles sur vos thèmes, jamais pendant vos heures de silence.</p>
      ${notifControls()}<button class="btn btn-ghost btn-sm" id="n-test" style="margin-top:12px">Envoyer une notification test</button></section>

    <section class="section" id="homepage"><h2>Page d'accueil du navigateur 🏠</h2>
      <p class="hint">Une page légère avec l'heure, une recherche et vos meilleures nouvelles filtrées.</p>
      <div class="field"><label for="nt-url">Adresse à utiliser</label><div class="row"><input id="nt-url" class="input" readonly value="${esc(newtab)}" style="flex:1;min-width:200px"><button class="btn btn-dark" id="nt-copy">Copier</button></div></div>
      <p class="label">Chrome / Edge / Brave</p><ol class="steps"><li>Paramètres → <b>Au démarrage</b> → « Ouvrir une page spécifique » → collez l'adresse.</li><li>Pour aussi les nouveaux onglets : Paramètres → Apparence → « Afficher le bouton Accueil » → collez l'adresse.</li></ol>
      <p class="label">Firefox</p><ol class="steps"><li>Paramètres → <b>Accueil</b> → « Page d'accueil et nouvelles fenêtres » → Adresses web personnalisées → collez l'adresse.</li></ol>
      <p class="label">Safari</p><ol class="steps"><li>Réglages → <b>Général</b> → Page d'accueil → collez l'adresse.</li></ol>
      <a class="btn btn-ghost btn-sm" href="newtab.html" target="_blank" rel="noopener">Ouvrir l'aperçu ↗</a></section>

    <section class="section"><h2>API développeur</h2><p class="hint">Récupérez votre fil filtré depuis n'importe quel outil (widget, raccourci, bot…).</p>
      <pre>GET /api/news?topics=…&amp;block=…&amp;tone=0-100&amp;keywords=…&amp;limit=…
GET /api/topics          catalogue des thèmes et sujets bloquables
POST /api/classify       {"title": "…", "summary": "…"}
GET /api/health</pre>
      <p class="label">Votre fil, en une URL</p><pre style="white-space:pre-wrap;word-break:break-all">${esc(apiUrl)}</pre>
      <button class="btn btn-ghost btn-sm" id="api-copy">Copier l'URL</button></section>

    <section class="section"><h2>Apparence</h2>
      <div class="options">${[['auto', '🖥️', 'Automatique'], ['light', '☀️', 'Clair'], ['dark', '🌙', 'Sombre']].map(([v, e, l]) => `<button class="option" role="radio" aria-checked="${prefs.theme === v}" data-theme-v="${v}"><span class="emo">${e}</span><span>${l}</span></button>`).join('')}</div></section>

    <section class="section"><h2>Mes données</h2><p class="hint">Vos préférences sont stockées uniquement sur cet appareil.</p>
      <div class="row"><button class="btn btn-ghost btn-sm" id="redo">Refaire le questionnaire</button><button class="btn btn-ghost btn-sm" id="reset" style="color:#C2185B">Tout effacer</button></div></section>`;

  const changed = msg => { savePrefs(); toast(msg || 'Préférences enregistrées'); };
  const drawDetails = () => { $('#details-box').innerHTML = detailsControls(); bindDetails($('#details-box'), () => changed()); };
  $$('[data-p-topic]').forEach(b => b.onclick = () => { toggleIn(prefs.topics, b.dataset.pTopic, b); changed(); drawDetails(); });
  drawDetails();
  let st; bindSources($('#sources'), () => { clearTimeout(st); st = setTimeout(() => changed('Sources mises à jour'), 400); });
  $$('[data-unmute]').forEach(b => b.onclick = () => { prefs.mutedTopics = prefs.mutedTopics.filter(t => t !== b.dataset.unmute); changed('Thème réactivé'); renderProfile(); });
  $$('[data-p-block]').forEach(i => i.onchange = () => { toggleIn(prefs.blocked, i.dataset.pBlock); changed(i.checked ? 'Sujet bloqué' : 'Sujet débloqué'); });
  let tt; bindTone(main, () => { clearTimeout(tt); tt = setTimeout(() => changed(), 500); });
  $('#p-kw').onchange = e => { prefs.keywords = e.target.value.split(',').map(s => s.trim()).filter(Boolean); changed(); };
  bindNotif(main, () => changed());
  $('#n-test').onclick = () => notify('Éclaircie 🌤️', 'Voici à quoi ressembleront vos notifications : une bonne nouvelle, sans stress.');
  $('#nt-copy').onclick = () => navigator.clipboard.writeText(newtab).then(() => toast('Adresse copiée'));
  $('#api-copy').onclick = () => navigator.clipboard.writeText(apiUrl).then(() => toast('URL copiée'));
  $$('[data-theme-v]').forEach(b => b.onclick = () => { prefs.theme = b.dataset.themeV; applyTheme(); changed(); $$('[data-theme-v]').forEach(x => x.setAttribute('aria-checked', x === b)); });
  $('#redo').onclick = () => { store.set('onboarded', false); stepIdx = 0; location.hash = '#/onboarding'; };
  $('#reset').onclick = () => {
    if (!confirm('Effacer toutes vos préférences et articles sauvegardés ?')) return;
    try { Object.keys(localStorage).filter(k => k.startsWith('ecl:')).forEach(k => localStorage.removeItem(k)); } catch { }
    prefs = Object.assign({}, DEFAULT_PREFS); saved = []; stepIdx = 0; location.hash = '#/onboarding';
  };
}

// =====================================================================
// NOTIFICATIONS & PWA
// =====================================================================
let swReg = null;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; syncServiceWorker(); }).catch(() => { });
}
function syncServiceWorker() {
  if (!swReg) return;
  (swReg.active || swReg.installing || swReg.waiting)?.postMessage({ type: 'prefs', prefs });
  // Synchronisation en arrière-plan quand l'app est installée (Chrome/Edge Android & desktop).
  if (prefs.notif.enabled && 'periodicSync' in swReg) {
    const every = { live: 1, day: 1, twice: 6, daily: 12 }[prefs.notif.freq] * 3600e3;
    swReg.periodicSync.register('eclaircie-news', { minInterval: every }).catch(() => { });
  }
}
async function notify(title, body, url = '#/feed') {
  if (!('Notification' in window)) return toast('Notifications non prises en charge ici');
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return toast('Autorisez les notifications dans votre navigateur');
  const opts = { body, icon: 'icon.svg', badge: 'icon.svg', data: { url }, tag: 'eclaircie' };
  swReg ? swReg.showNotification(title, opts) : new Notification(title, opts);
}
// Pendant que l'app est ouverte : vérifie toutes les 5 min si un envoi est prévu par le rythme choisi.
async function checkForNews() {
  if (!prefs.notif.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const log = store.get('notifLog', null);
  const slot = window.Eclaircie.notifDue(prefs.notif, log);
  if (!slot) return;
  await loadArticles(true);
  const seen = new Set(store.get('notified', []));
  const fresh = myFeed().visible.filter(a => prefs.topics.includes(a.ai.topic) && a.ai.tone > 0.15 && !seen.has(a.id));
  if (!fresh.length) return;
  const digest = ['daily', 'twice'].includes(prefs.notif.freq);
  const a = fresh[0];
  if (digest && fresh.length > 1) notify(`🌤️ ${Math.min(fresh.length, 5)} bonnes nouvelles pour vous`, fresh.slice(0, 3).map(x => '• ' + x.title).join('\n'));
  else notify(`${topicOf(a.ai.topic).emoji} ${topicOf(a.ai.topic).label}`, a.title, '#/article/' + encodeURIComponent(a.id));
  store.set('notified', [...seen, ...(digest ? fresh.slice(0, 5) : [a]).map(x => x.id)].slice(-500));
  store.set('notifLog', window.Eclaircie.markSent(log, slot));
}
setInterval(checkForNews, 5 * 60e3);

router();
