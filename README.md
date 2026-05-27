# Jamm Immobilier — site vitrine

Site marketing public pour Jamm Immobilier. Reconstruction greenfield en Astro 4, déploiement Cloudflare Pages. Sœur du SaaS admin [`jammimmo-estate-flow`](https://github.com/jammimmo/jammimmo-estate-flow).

## Stack

- **Astro 4** (`output: 'hybrid'`) — SSG par défaut + SSR pour les route handlers
- **@astrojs/cloudflare** — adapter Cloudflare Pages
- **React 18** — îlots hydratés à la demande (`client:visible`, `client:idle`, `client:load`)
- **TypeScript** strict
- **Tailwind CSS 3.4** + tokens **Jamm Sahel** (palette indigo + soleil + terra/ochre/emerald/sand) — dupliqués depuis l'admin (voir [`DESIGN.md`](https://github.com/jammimmo/jammimmo-estate-flow/blob/main/DESIGN.md))
- **@supabase/supabase-js v2** — clé anon uniquement, RLS côté admin
- **shadcn/ui** — primitives Button, Input, Select, Textarea, Label, Checkbox, Badge
- **Lucide React** — icônes
- **Leaflet + react-leaflet@4** — map fiche bien (v4 = React 18 compatible)
- **react-hook-form + zod** — formulaires validés
- **pnpm 9** + **Node 20+**

## Routes

| Route | Type | Donnée |
|---|---|---|
| `/`, `/en/`, `/wo/` | SSG | 6 biens publics récents + sections home |
| `/biens`, `/en/biens`, `/wo/biens` | SSG + filtres client | tous biens publics |
| `/biens/[ref]` (×3 langs) | SSG (1 page par bien) | bien complet + 3 similaires |
| `/contact` (×3 langs) | SSG | form contact général |
| `/comparer` (×3 langs) | SSG + island | comparateur (lit localStorage) |
| `/api/leads` | SSR (POST) | INSERT dans `leads` |
| `/api/views` | SSR (POST) | INSERT dans `property_views`, hash IP côté serveur |
| `/api/revalidate` | SSR (POST) | webhook Supabase → Cloudflare Deploy Hook |
| `/api/property/[ref].json` | SSG | un bien (lue par le comparateur côté client) |
| `/sitemap-index.xml` | SSG | généré par `@astrojs/sitemap`, multi-langue |
| `/robots.txt` | static | indexation autorisée |

## Pré-requis côté admin (eStateflow)

Cette vitrine consomme la migration **`20260524130000_add_public_visibility.sql`** publiée en PR sur `jammimmo-estate-flow`. Elle ajoute :

1. `properties.is_public BOOLEAN DEFAULT false` + `published_at TIMESTAMPTZ` (trigger qui stamp au premier passage à true)
2. Une **policy RLS anon** : `SELECT` uniquement sur `is_public = true AND status = 'Disponible'`
3. Tables `property_views` + `leads` avec policies anon INSERT, authenticated SELECT/FULL
4. CHECKs de longueur sur `leads` (anti payload-bomb)

**Sans cette migration**, la vitrine se construit quand même mais les pages biens sont vides.

## Données — règle de masquage

L'anon RLS retourne toute la ligne, mais on **ne rend jamais** les champs sensibles dans le HTML :

| ✅ Affiché publiquement | ❌ Masqué (stays server-side) |
|---|---|
| title, type, transaction_type, status | reference (affichée tronquée "Ref #00019") |
| price, negotiable (badge) | commission_amount, vat_applied, taxe_36_applied |
| city, quartier, address, gps (map) | caution, avance (→ "Conditions sur demande") |
| surface, bedrooms, attributes pertinents | apporteur_id, source_type, source_detail |
| images (R2), video_links (YouTube) | accessibility, manager, deal_type, auto_title |
| commodities, nearby_commerce | whatsapp_business, whatsapp_channel |
| commercial_message (accroche) | created_at, updated_at (côté front) |
| description complète, documents (URLs R2), tags publics, flux_passage (Magasin/Bureau/Hangar) | comments |

Le masquage est appliqué dans [`src/lib/supabase.ts`](src/lib/supabase.ts) → `maskRow()`. La fonction renvoie un `PublicProperty` (séparé du `DbProperty` interne). Toute fuite forcerait à éditer ce fichier.

## Setup local

```bash
git clone git@github.com:jammimmo/jammimmo-commercial-website.git
cd jammimmo-commercial-website
pnpm install

# Variables d'env (vraies valeurs dans le wrangler.jsonc de l'admin)
cp .env.example .env
# Renseigner PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY

pnpm dev      # http://localhost:4321
pnpm build    # build prod (vers dist/)
pnpm preview  # serve dist/ localement
```

**Sync types Supabase** après chaque migration côté admin :

```bash
pnpm dlx supabase gen types typescript --project-id ygaawqgwxlbtkcuqecxh > src/types/supabase.ts
# remplacer ensuite le DbProperty manuel par Database['public']['Tables']['properties']['Row']
```

## Déploiement Cloudflare Pages

1. **Connect** le repo `jammimmo-commercial-website` à Cloudflare Pages.
2. **Settings → Environment variables** :
   - `PUBLIC_SUPABASE_URL` = `https://ygaawqgwxlbtkcuqecxh.supabase.co`
   - `PUBLIC_SUPABASE_ANON_KEY` = `<anon publishable key>` (dans wrangler.jsonc admin)
   - `REVALIDATE_SECRET` = `<long random string>` (pour le webhook)
   - `DEPLOY_HOOK_URL` = `<URL générée dans Pages → Deploy hooks>`
3. **Build settings** :
   - Build command : `pnpm build`
   - Build output directory : `dist`
   - Node version : `20`
4. **Custom domain** : `jammimmo.com` (admin reste sur `jammimmo-estate-flow.jammimmo221admin.workers.dev`).
5. **Supabase host allowlist** : ouvrir pour les IPs Cloudflare Pages (sinon le build ne pourra pas lire la DB). À régler dans Supabase Dashboard → Settings → Network restrictions.

### Webhook revalidation (V2)

À configurer dans Supabase Studio (Database → Webhooks) :
- Trigger : `UPDATE` sur `properties` où `is_public` change
- URL : `https://jammimmo.com/api/revalidate`
- Headers : `Authorization: Bearer <REVALIDATE_SECRET>`

En V1, prévoir un cron Cloudflare quotidien qui POST sur la Deploy Hook (faisable depuis Cloudflare Workers Cron Triggers).

## i18n

3 langues : **fr** (défaut, sans préfixe) · **en** (`/en/`) · **wo** (Wolof, `/wo/`).

Le helper `t(key, lang)` (`src/lib/i18n.ts`) fait un fallback FR si une clé manque dans EN/WO. Les fichiers `src/i18n/locales/*.json` sont sources de vérité. **Wolof à relire par un locuteur natif** — les chaînes existantes sont une première passe.

Pour ajouter une langue : ajouter à `LANGS` dans `src/lib/i18n.ts`, créer le `.json` correspondant, et créer les pages parallèles dans `src/pages/<lang>/`.

## Comparateur

Pas de notion de compte sur la vitrine en v1 (décision produit). Le comparateur stocke la sélection dans `localStorage` (clé `jammimmo:compare`, max 3 biens), synchronisé entre pages via un `CustomEvent`. Sticky bar en bas affichée dès qu'un bien est ajouté ; page `/comparer` rend le tableau côte-à-côte.

## Tracking vues

Beacon `requestIdleCallback` après chargement de la fiche → `POST /api/views`. Le route handler hash l'IP (sha-256, tronquée à 16 chars) et stocke `cf-ipcountry`. Aucun cookie déposé. Conforme GDPR.

## Décisions v1 / v2

- **v1** : FR + EN + WO, comparateur, beacon vues, lead INSERT-only.
- **v2** :
  - Notif lead par email **Resend** (token dans `RESEND_API_KEY`) + WhatsApp Cloud API
  - Favoris anonymes localStorage (le user a explicitement dit "pas de compte sur la vitrine pour l'instant")
  - Webhook Supabase → revalidation automatique au lieu du cron quotidien
  - Vraies traductions Wolof + EN review natif
  - Pagination réelle `/biens` si > 50 biens publics

---

## Compagnon : repo admin

[`jammimmo-estate-flow`](https://github.com/jammimmo/jammimmo-estate-flow) — Vite + React + Cloudflare Worker + R2. Stack séparée parce que les besoins sont opposés (SPA admin authentifiée vs. site SEO public).

© Jamm Immobilier · Dakar
