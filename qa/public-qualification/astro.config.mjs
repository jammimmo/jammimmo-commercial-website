import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import { fileURLToPath } from 'node:url';
import { selection, origin } from './selection.mjs';

const selected = selection();
const local = path => new URL(path, import.meta.url);
// Local static compilation only: no production API routes, adapter or platform
// proxy. Both pages below import the real production Astro page composition.
export default defineConfig({
  root: fileURLToPath(local('../../')), site: origin, output: 'static',
  srcDir: fileURLToPath(local('./src/')), publicDir: fileURLToPath(local('./public/')),
  outDir: selected.output + '/html/', cacheDir: selected.output + '/astro-cache/',
  integrations: [react(), tailwind({ applyBaseStyles: false })],
  i18n: { defaultLocale: 'fr', locales: ['fr', 'en', 'wo'], routing: { prefixDefaultLocale: false }, fallback: { en: 'fr', wo: 'fr' } },
  prefetch: { prefetchAll: false, defaultStrategy: 'viewport' },
  vite: {
    envDir: fileURLToPath(local('./empty-env/')),
    resolve: { alias: [
      { find: /^@\/lib\/supabase\.build$/, replacement: fileURLToPath(local('./catalogue.ts')) },
      { find: /^@\//, replacement: fileURLToPath(local('../../src/')) },
    ] },
    define: Object.fromEntries(['PUBLIC_ANALYTICS_ENDPOINT', 'PUBLIC_CLARITY_PROJECT_ID', 'PUBLIC_CF_ANALYTICS_TOKEN',
      'PUBLIC_GSC_VERIFICATION', 'PUBLIC_BING_VERIFICATION'].map(key => ['import.meta.env.' + key, JSON.stringify('')])
      .concat([['import.meta.env.PUBLIC_REPLAY_SAMPLE_RATE', '"0"']])),
    ssr: { noExternal: ['react-leaflet', '@react-leaflet/core'] },
  },
});
