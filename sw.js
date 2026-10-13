/* Service worker récap SUIVI PCLE MMM
   - Page et fichiers de l'app : réseau d'abord (les mises à jour arrivent), cache en secours hors ligne
   - Bibliothèques externes (Tailwind, jsPDF, Supabase...) : cache puis mise à jour en arrière-plan
   - Supabase (données) : jamais mis en cache, l'app gère déjà son propre cache et sa file d'attente */
const VERSION = 'pcle-v1';
const APP_CACHE = VERSION + '-app';
const LIB_CACHE = VERSION + '-lib';

const FICHIERS = [
  './', 'index.html', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then(c => Promise.all(FICHIERS.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n.startsWith('pcle-') && !n.startsWith(VERSION)).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.hostname.endsWith('supabase.co')) return;

  /* Fichiers de l'app (même origine) : réseau d'abord */
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(rep => {
          if (rep && rep.ok) {
            const copie = rep.clone();
            caches.open(APP_CACHE).then(c => c.put(req, copie));
          }
          return rep;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
        )
    );
    return;
  }

  /* Bibliothèques externes : cache d'abord, mise à jour en arrière-plan */
  e.respondWith(
    caches.open(LIB_CACHE).then(c =>
      c.match(req).then(enCache => {
        const reseau = fetch(req)
          .then(rep => { if (rep && (rep.ok || rep.type === 'opaque')) c.put(req, rep.clone()); return rep; })
          .catch(() => enCache);
        return enCache || reseau;
      })
    )
  );
});
