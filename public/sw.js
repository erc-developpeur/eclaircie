/* Éclaircie — service worker : hors ligne, notifications, synchro en arrière-plan. */
importScripts('shared.js');
const SHELL = 'eclaircie-v5';
const ASSETS = ['./', 'index.html', 'app.css', 'app.js', 'shared.js', 'demo-data.js', 'newtab.html', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Réseau d'abord (actualité fraîche), cache en secours.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  // no-cache : toujours revérifier auprès du serveur, pour ne jamais servir une ancienne version de l'app.
  const req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(fetch(req).then(r => {
    const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});

// Les préférences viennent de la page (le SW n'a pas accès au localStorage).
self.addEventListener('message', e => {
  if (e.data?.type === 'prefs') caches.open('eclaircie-prefs').then(c => c.put('/__prefs', new Response(JSON.stringify(e.data.prefs))));
});
async function getPrefs() {
  const r = await (await caches.open('eclaircie-prefs')).match('/__prefs');
  return r ? r.json() : null;
}

async function checkNews() {
  const prefs = await getPrefs();
  if (!prefs?.notif?.enabled) return;
  const cache = await caches.open('eclaircie-prefs');
  const log = await (await cache.match('/__log'))?.json() || null;
  const slot = self.Eclaircie.notifDue(prefs.notif, log);
  if (!slot) return;
  const data = await (await fetch('/api/news?raw=1')).json();
  const { visible } = self.Eclaircie.filterArticles(data.articles, prefs);
  const seen = new Set(await (await cache.match('/__seen'))?.json() || []);
  const fresh = visible.filter(a => prefs.topics.includes(a.ai.topic) && a.ai.tone > 0.15 && !seen.has(a.id));
  if (!fresh.length) return;
  await self.registration.showNotification(fresh.length > 1 ? `🌤️ ${fresh.length} bonnes nouvelles pour vous` : '🌤️ Une bonne nouvelle pour vous',
    { body: fresh[0].title, icon: 'icon.svg', badge: 'icon.svg', tag: 'eclaircie', data: { url: '#/article/' + encodeURIComponent(fresh[0].id) } });
  await cache.put('/__seen', new Response(JSON.stringify([...seen, ...fresh.map(a => a.id)].slice(-500))));
  await cache.put('/__log', new Response(JSON.stringify(self.Eclaircie.markSent(log, slot))));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'eclaircie-news') e.waitUntil(checkNews()); });

// Prêt pour le Web Push (serveur VAPID) : affiche la charge utile reçue.
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : { title: 'Éclaircie', body: 'De nouvelles actualités vous attendent.' };
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon.svg', data: { url: d.url || '#/feed' } }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(self.registration.scope).href + (e.notification.data?.url || '');
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const win = list.find(w => w.url.startsWith(self.registration.scope));
    return win ? win.navigate(url).then(w => w && w.focus()) : self.clients.openWindow(url);
  }));
});
