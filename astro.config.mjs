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
