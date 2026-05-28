// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://jammimmo.com',
  output: 'hybrid',
  adapter: cloudflare({
    imageService: 'compile',
    platformProxy: { enabled: true },
    // Tell the adapter to route ONLY /api/* into the Function. Everything
    // else is a pre-rendered static asset; unknown URLs fall back to the
    // emitted 404.html via the CF Pages static handler. Without this the
    // adapter routes /* into the Function and unknown paths SSR the
    // homepage with HTTP 200.
    routes: {
      strategy: 'include',
      include: ['/api/*'],
      exclude: [],
    },
  }),
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  i18n: {
    defaultLocale: 'fr',
    locales: ['fr', 'en', 'wo'],
    routing: { prefixDefaultLocale: false },
    fallback: { en: 'fr', wo: 'fr' },
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'viewport',
  },
  vite: {
    ssr: {
      noExternal: ['react-leaflet', '@react-leaflet/core'],
    },
  },
});
