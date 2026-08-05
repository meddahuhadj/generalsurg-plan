import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ───────────────────────────────────────────────────────────────────────────
// OphtalmoSurg Plan — configuration Vite
//
//  - base relative («./») : le build se sert aussi bien à la racine (backend
//    FastAPI, docker, vercel) que depuis un sous-chemin.
//  - public/ est copié tel quel dans dist/ (sw.js, manifest, icônes, i18n,
//    offline.html, favicon) — voir la liste PRECACHE_URLS de sw.js.
//  - Après build, un petit plugin réécrit dist/sw.js pour y injecter le nom
//    haché du bundle JS (index-<hash>.js) dans PRECACHE_URLS : le service
//    worker continue de pré-cacher EXACTEMENT les fichiers du shell (règle de
//    sécurité : jamais de données patient/API), y compris le bundle Vite dont
//    le hash change à chaque build.
// ───────────────────────────────────────────────────────────────────────────

const DIST = fileURLToPath(new URL('./dist', import.meta.url));

function injectSwPrecache() {
  return {
    name: 'inject-sw-precache',
    closeBundle() {
      try {
        const html = readFileSync(DIST + '/index.html', 'utf8');
        const match = html.match(/<script[^>]*src="\.\/([^"]+\.js)"[^>]*>/);
        if (!match) return;
        const bundleUrl = '/' + match[1];
        const swPath = DIST + '/sw.js';
        let sw = readFileSync(swPath, 'utf8');
        if (!sw.includes('__APP_BUNDLE__')) return;
        writeFileSync(swPath, sw.replace("'/__APP_BUNDLE__/'", "'" + bundleUrl + "'"));
      } catch (e) {
        console.warn('[vite:inject-sw-precache]', e.message);
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [injectSwPrecache()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
