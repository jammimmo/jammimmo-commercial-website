import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Jamm Sahel design tokens — dupliqués depuis l'admin SaaS.
 * Voir DESIGN.md de jammimmo-estate-flow pour la philosophie.
 *
 * Cœur logo (immuable) : primary indigo, secondary soleil.
 * Accents Sahel : terra (cotta), ochre (saffron), emerald (baobab).
 * Pas de blanc clinique : sand en background, clay en bordure.
 */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    container: {
      center: true,
      // Container padding — bigger left/right margins at lg+ so the
      // floating cards inside (max-w-5xl/6xl) sit on a generous gutter.
      padding: {
        DEFAULT: '1.25rem', // 20 px
        sm: '1.5rem',       // 24 px
        md: '2rem',         // 32 px
        lg: '3rem',         // 48 px
        xl: '4rem',         // 64 px
      },
      screens: { '2xl': '1320px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Sahel accents
        terra: {
          DEFAULT: 'hsl(var(--terra))',
          foreground: 'hsl(var(--terra-foreground))',
        },
        ochre: {
          DEFAULT: 'hsl(var(--ochre))',
          foreground: 'hsl(var(--ochre-foreground))',
        },
        emerald: {
          DEFAULT: 'hsl(var(--emerald))',
          foreground: 'hsl(var(--emerald-foreground))',
        },
        sand: 'hsl(var(--sand))',
        clay: 'hsl(var(--clay))',
        ink: 'hsl(var(--ink))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter Tight', 'system-ui', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['3.5rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-x': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'marquee': 'slide-x 38s linear infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
