# Jamm Immobilier — site vitrine

Site marketing public pour Jamm Immobilier. Reconstruction greenfield en Astro 4, déploiement Cloudflare Pages. Sœur du SaaS admin [`jammimmo-estate-flow`](https://github.com/jammimmo/jammimmo-estate-flow).

## Architecture — Tier 3 (vitrine ↔ admin isolation)

La vitrine est **complètement statique** côté visiteurs. Aucun secret d'admin n'existe au runtime ; deux projets Supabase distincts encadrent les flux :

```
   admin Supabase (jammimmo-estate-flow)              GitHub Actions
   ┌─────────────────────────────────┐                ┌──────────────┐
   │ properties (is_public, …)       │◀───service-role┤  build + SSG │
   │ trigger pg_net + HMAC           │                │  + wrangler  │
   └────────────┬────────────────────┘                │     deploy   │
                │ webhook HMAC                        └──────┬───────┘
                ▼                                            │
   ┌─────────────────────────────────┐                       │  static HTML
   │ /api/revalidate                 │                       ▼  + Functions
   │  - verify HMAC                  │              ┌────────────────────┐
   │  - KV debounce 60 s             │──repository──▶│   jammimmo.com    │
   │  - GitHub repository_dispatch   │   dispatch    │ (CF Pages edge)   │
   └─────────────────────────────────┘               │ Functions know    │
                                                     │ only INTAKE_* env │
                                                     └─────────┬─────────┘
                                                               │ leads/views
                                                               ▼
                                                   ┌──────────────────────┐
                                                   │ intake Supabase      │
                                                   │ (jammimmo-intake)    │
                                                   │ leads, property_views│
                                                   └──────────────────────┘
```

**Pourquoi cette séparation** :

- Le visiteur télécharge du HTML pré-rendu, jamais de JS qui contient un endpoint admin.
- Une compromission du Worker Pages déployé donne au maximum un accès `INSERT` sur la DB intake. Aucune lecture ni écriture possible côté admin.
- Le seul credential capable de lire la DB admin (clé `service_role`) vit dans les secrets GitHub Actions, jamais dans le runtime Pages.

### Budget de rafraîchissement

| Phase | Typique | Pire cas |
|---|---|---|
| Admin UPDATE → webhook `pg_net` | 1 s | 5 s |
| `/api/revalidate` HMAC + KV debounce | 0.3 s | 1 s |
| GitHub `repository_dispatch` ack | 0.8 s | 3 s |
| Runner cold start | 15 s | 60 s |
| `pnpm install` (cache) | 15 s | 45 s |
| `astro build` (SSG) | 40 s | 90 s |
| `wrangler pages deploy` | 30 s | 90 s |
| CF edge propagation | 5 s | 15 s |
| **Total admin UPDATE → live edge** | **~1 m 47 s** | **~5 m 9 s** |

Bursts (5 toggles en 30 s) sont collapsés en 1 build via le debounce KV + `concurrency: cancel-in-progress`.

## Stack

- **Astro 4** (`output: 'hybrid'`) — SSG par défaut + SSR pour les route handlers
- **@astrojs/cloudflare** — adapter Cloudflare Pages
- **React 18** — îlots hydratés à la demande
- **TypeScript** strict
- **Tailwind CSS 3.4** + tokens **Jamm Sahel** (cf. [`DESIGN.md`](https://github.com/jammimmo/jammimmo-estate-flow/blob/main/DESIGN.md))
- **@supabase/supabase-js v2** — deux clients distincts (build-only admin, runtime intake)
- **shadcn/ui**, **Lucide React**, **Leaflet + react-leaflet@4**, **react-hook-form + zod**
- **pnpm 9** + **Node 20+**

## Routes

| Route | Type | Donnée |
|---|---|---|
| `/`, `/en/`, `/wo/` | SSG | 6 biens publics + sections home |
| `/biens` (×3 langs) | SSG + filtres client | tous biens publics |
| `/biens/[ref]` (×3 langs) | SSG (1 page par bien) | bien complet + 3 similaires |
| `/contact` (×3 langs) | SSG | form contact général |
| `/comparer` (×3 langs) | SSG + island | comparateur (localStorage) |
| `/api/leads` | SSR (POST) | INSERT dans intake `leads` |
| `/api/views` | SSR (POST) | INSERT dans intake `property_views` (hash IP côté serveur) |
| `/api/revalidate` | SSR (POST) | webhook admin → `repository_dispatch` |
| `/api/property/[ref].json` | SSG | un bien (lue par le comparateur côté client) |
| `/sitemap.xml` | SSG | multi-langue |

## Pré-requis côté admin (eStateflow)

Migration **`20260524130000_add_public_visibility.sql`** (PR #3 sur `jammimmo-estate-flow`) : ajoute `is_public`, `published_at`, le trigger, l'index partiel, et la policy RLS anon SELECT. Les tables `leads` / `property_views` ne vivent **plus** dans la DB admin — elles ont été déplacées vers la DB intake (cf. `supabase/intake/`).

## Modules clés

| Fichier | Quand | Pour quoi |
|---|---|---|
| `src/lib/supabase.build.ts` | build-only (Node, GH Actions) | lecture admin via `process.env.ADMIN_SUPABASE_*` — jamais bundlé dans le runtime |
| `src/lib/intake.ts` | runtime (CF Pages Worker) | INSERT intake via `import.meta.env.INTAKE_SUPABASE_*` |
| `src/pages/api/revalidate.ts` | runtime | HMAC verify + KV debounce + GitHub dispatch |
| `.github/workflows/deploy.yml` | CI | build + deploy déclenchés par push/dispatch |

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
| description, documents (URLs R2), tags publics, flux_passage | comments |

Le masquage est appliqué dans [`src/lib/supabase.build.ts`](src/lib/supabase.build.ts) → `maskRow()`. La fonction renvoie un `PublicProperty` (séparé du `DbProperty` interne).

## Setup local

```bash
git clone git@github.com:jammimmo/jammimmo-commercial-website.git
cd jammimmo-commercial-website
pnpm install

cp .env.example .env
# Renseigner ADMIN_SUPABASE_* (lecture biens) + INTAKE_SUPABASE_* (écriture leads)

pnpm dev      # http://localhost:4321
pnpm build    # build prod (vers dist/)
pnpm preview  # serve dist/ localement
```

## Secrets — qui va où

| Secret | GitHub Actions | Cloudflare Pages | Rôle |
|---|---|---|---|
| `ADMIN_SUPABASE_URL` | ✅ | ❌ | lecture biens au build |
| `ADMIN_SUPABASE_SERVICE_ROLE_KEY` | ✅ | ❌ | lecture biens au build |
| `INTAKE_SUPABASE_URL` | ✅ (pour le build) | ✅ | écriture leads/views au runtime |
| `INTAKE_SUPABASE_ANON_KEY` | ✅ (pour le build) | ✅ | écriture leads/views au runtime |
| `REVALIDATE_HMAC_SECRET` | ❌ | ✅ | vérif webhook admin |
| `GH_DISPATCH_TOKEN` | ❌ | ✅ | déclencher `repository_dispatch` |
| `GH_REPO` | ❌ | ✅ | nom du repo |
| `CLOUDFLARE_API_TOKEN` | ✅ | ❌ | déploiement Pages |
| `CLOUDFLARE_ACCOUNT_ID` | ✅ | ❌ | déploiement Pages |

⚠️ **CF Pages git auto-deploy doit rester désactivé.** Le build doit passer par GitHub Actions pour que la clé `service_role` admin ne se retrouve jamais dans l'env Pages. Le bouton `Settings → Builds & deployments → Git integration` doit être OFF.

## Déploiement initial

1. **Créer le projet intake Supabase** (cf. [`supabase/intake/README.md`](supabase/intake/README.md)).
2. **Créer un KV namespace** : `wrangler kv:namespace create REFRESH_KV`, copier l'ID dans `wrangler.toml`.
3. **Configurer les secrets GitHub** : `gh secret set` pour toutes les colonnes "GitHub Actions" ci-dessus.
4. **Configurer les secrets Cloudflare Pages** : dashboard ou `wrangler pages secret put` pour toutes les colonnes "Cloudflare Pages".
5. **Créer un PAT fine-grained** scoped à ce repo : `Contents:write` + `Metadata:read`. Le mettre dans `GH_DISPATCH_TOKEN`.
6. **Configurer le trigger admin** : créer un trigger `pg_net` côté admin Supabase qui POST sur `https://jammimmo.com/api/revalidate` avec headers `x-vitrine-signature` (hex HMAC-SHA256) + `x-vitrine-timestamp` (unix seconds). Voir [`/api/revalidate`](src/pages/api/revalidate.ts) pour le format attendu.
7. **Premier déploiement** : push sur `main` ou `gh workflow run deploy.yml`.

## i18n

3 langues : **fr** (défaut, sans préfixe) · **en** (`/en/`) · **wo** (Wolof, `/wo/`).

Le helper `t(key, lang)` (`src/lib/i18n.ts`) fait un fallback FR si une clé manque dans EN/WO. **Wolof à relire par un locuteur natif.**

## Comparateur

Pas de notion de compte sur la vitrine en v1. Le comparateur stocke la sélection dans `localStorage` (clé `jammimmo:compare`, max 3 biens), synchronisé entre pages via un `CustomEvent`. Sticky bar en bas dès qu'un bien est ajouté ; page `/comparer` rend le tableau côte-à-côte.

## Tracking vues

Beacon `requestIdleCallback` après chargement de la fiche → `POST /api/views`. Le route handler hash l'IP (sha-256, tronquée à 16 chars) et stocke `cf-ipcountry`. Aucun cookie. Conforme GDPR.

## Décisions v1 / v2

- **v1** : FR + EN + WO, comparateur, beacon vues, lead INSERT-only, Tier 3 isolation.
- **v2** :
  - Worker côté admin pour mirror intake → `intake_leads_mirror` (60 s pull)
  - Notif lead par email **Resend** + WhatsApp Cloud API
  - Favoris anonymes localStorage
  - Vraies traductions Wolof + EN review natif
  - Pagination réelle `/biens` si > 50 biens publics

---

## Compagnon : repo admin

[`jammimmo-estate-flow`](https://github.com/jammimmo/jammimmo-estate-flow) — Vite + React + Cloudflare Worker + R2. Stack séparée parce que les besoins sont opposés (SPA admin authentifiée vs. site SEO public).

© Jamm Immobilier · Dakar
