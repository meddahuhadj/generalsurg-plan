// sw.js — Service Worker de OphtalmoSurg Plan
// =============================================================================
// Objectif : rendre l'app shell (HTML/CSS/JS statiques) installable et
// disponible hors-ligne, SANS jamais mettre en cache une réponse d'API.
//
// Règle de sécurité non négociable pour une appli qui manipule des données
// patients : ce service worker n'intercepte QUE les requêtes GET same-origin
// dont le chemin fait partie de la liste PRECACHE_URLS ci-dessous (le "app
// shell" : HTML/CSS/JS/manifest/icônes/traductions, tous statiques et
// versionnés). Toute autre requête — /patients, /audit, /dicom, /auth/*,
// /chat, /pacs/*, /fhir/*, /hl7/*, /segmentation/*, appels cross-origin
// (Gemini/Groq/CDN Three.js) — n'est PAS interceptée : le navigateur la
// traite normalement, en réseau direct. Mettre en cache une réponse patient
// ou un jeton d'auth serait un risque de sécurité/exactitude clinique, pas
// juste un détail de perf.
//
// Améliorations v2 :
//  - Version de cache basée sur un timestamp de build (mis à jour à chaque
//    déploiement pour forcer la purge de l'ancien cache).
//  - Page /offline.html mise en cache et servie en fallback ultime quand le
//    réseau ET le cache sont indisponibles.
//  - postMessage "SW_UPDATED" envoyé à tous les clients quand un nouveau
//    service worker prend le contrôle → l'UI affiche un toast "Mettre à jour".
// =============================================================================

// ── Version ──────────────────────────────────────────────────────────────────
// Mettez à jour ce timestamp (ou injectez-le via votre pipeline CI/CD) à
// chaque déploiement : c'est la clé de cache. L'ancien cache est supprimé
// automatiquement lors de l'activation du nouveau SW.
// En CI/CD, remplacez cette ligne par :
//   const CACHE_VERSION = 'generalsurg-shell-__BUILD_TIMESTAMP__';
// et substituez __BUILD_TIMESTAMP__ avec `date +%Y%m%d%H%M%S` dans le pipeline.
const CACHE_VERSION = 'generalsurg-shell-v2-20260731';

// ── Ressources du shell à pré-cacher ─────────────────────────────────────────
// Uniquement des ressources statiques versionnées, jamais de données patient.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/assets/styles.css',
  '/assets/app-part1.js',
  '/assets/app-part2.js',
  '/assets/app-part3.js',
  '/assets/app-bootstrap.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/i18n/en.json',
  '/i18n/fr.json',
  '/i18n/ar.json',
  '/i18n/nl.json',
  '/favicon.ico',
];

// ── Install ───────────────────────────────────────────────────────────────────
// Pré-cache du shell en best-effort (une ressource absente ne bloque pas tout).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn('[sw] précache ignorée (best-effort):', url, err)
          )
        )
      )
    )
  );
  // Prend le contrôle immédiatement sans attendre la fermeture des onglets.
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
// Purge les anciens caches et notifie les clients qu'une mise à jour est dispo.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => {
            console.info('[sw] suppression ancien cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      // Prend le contrôle de tous les onglets ouverts immédiatement.
      self.clients.claim();
      // Notifie tous les clients qu'un nouveau SW est actif → l'UI peut
      // proposer un bouton "Actualiser pour obtenir la dernière version".
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION })
        );
      });
    })
  );
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isPrecachedShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  return PRECACHE_URLS.includes(url.pathname);
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
// Stratégie : Network-First pour le shell (l'utilisateur en ligne reçoit
// toujours la version la plus récente), Cache-Fallback si hors-ligne,
// et /offline.html si ni le réseau ni le cache ne répondent.
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ne jamais intercepter POST/PUT/DELETE/PATCH (API REST, mutations).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ne jamais intercepter les requêtes hors-origin (CDN Three.js, Gemini…).
  if (url.origin !== self.location.origin) return;

  // N'intercepter que les ressources du shell précachées.
  if (!isPrecachedShellRequest(url)) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Mise à jour silencieuse du cache à chaque requête réseau réussie.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return response;
      })
      .catch(() =>
        // Réseau indisponible → repli sur le cache.
        caches.match(req).then(
          (cached) =>
            cached ||
            // Ni réseau ni cache → page offline dédiée.
            caches.match('/offline.html')
        )
      )
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
// Permet à l'UI d'envoyer 'SKIP_WAITING' pour forcer l'activation immédiate
// d'un SW en attente (déclenché par le bouton "Actualiser" dans le toast).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
