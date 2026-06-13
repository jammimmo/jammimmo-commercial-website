# Évaluation : édition du contenu marketing « headless CMS » sans casser l'isolation Tier-3

> Document de décision — 2026-06-13. Produit par une évaluation multi-agents (4 approches conçues
> indépendamment, chacune passée au crible d'une revue adverse d'isolation, puis synthèse). Vérifié
> contre le code réel (`supabase.build.ts`, `revalidate.ts`, `astro.config.mjs`).
>
> **Portée :** uniquement le **contenu marketing** (hero, sections d'arguments, services, FAQ,
> témoignages, méta SEO, copie des pages `/proprietaires` & `/partenaires`, en fr/en/wo —
> aujourd'hui en dur dans les composants `.astro` + `src/i18n/locales/{fr,en,wo}.json`). Les annonces
> de biens sont hors scope (déjà gérées par le pull Supabase au build).

## 1. Recommandation (une ligne)

**Construire « Contenu du site » comme une source de contenu lue AU BUILD dans le Supabase admin
existant : tables `public.site_content` + `public.site_content_versions`, éditées depuis l'admin
estate-flow, tirées au build par un `src/lib/content.build.ts` jumeau de `supabase.build.ts`, et
publiées via le MÊME chemin webhook signé → rebuild — avec les 4 garde-fous durs exigés par la revue
d'isolation (merge HORS de tout module importé côté client, migration anon-deny commitée,
sanitization HTML au build, aucune route de preview runtime).**

C'est la seule option qui **n'ajoute aucun nouveau fournisseur, aucun secret runtime, aucune surface
runtime** et qui réutilise de bout en bout le mécanisme d'isolation déjà éprouvé pour les biens.

## 2. Pourquoi (invariant par invariant, puis UX, puis coût)

Les 4 approches obtiennent un risque d'isolation **2/5** et « ne casse pas l'isolation » — aucune
n'est disqualifiée sur la sécurité. Le départage suit donc l'ordre de priorité imposé :
**isolation d'abord, puis UX non-dev, puis effort/fournisseur — en préférant l'option qui réutilise le
mécanisme déjà éprouvé sauf si une autre gagne CLAIREMENT en UX sans augmenter le risque.**

- **INV1 — aucun secret privilégié dans le runtime/navigateur.** `content.build.ts` clone le pattern
  vérifié de `supabase.build.ts` : lit `process.env.ADMIN_SUPABASE_SERVICE_ROLE_KEY` (jamais
  `import.meta.env`, donc non inlinable par Vite), garde `isNodeBuild` qui *throw* en runtime Workers.
  Zéro nouveau secret. **Garde-fou obligatoire** : faire le merge contenu DANS une étape prebuild Node
  qui émet `src/i18n/generated/{fr,en,wo}.json` ; `i18n.ts` n'importe que ce JSON statique — JAMAIS un
  `*.build.ts` (les 10 îlots React importent `i18n.ts`). + ESLint `no-restricted-imports` / grep CI qui
  casse le build si un `.tsx`/`client:*` importe `*.build.ts`.
- **INV2 — contenu au BUILD uniquement, figé statique.** Récupéré une fois pendant `astro build`, gelé
  en HTML. `astro.config.mjs` ne route que `/api/*` en Function ; les pages restent `prerender=true`.
  `site_content` reste derrière RLS, jamais exposé à l'anon PostgREST. **Garde-fou** : interdiction
  documentée+CI de toute route `/api/content*` ; la « preview » = le déploiement de preview CF Pages,
  jamais une lecture runtime de brouillon.
- **INV3 — séparation deux fournisseurs.** Inchangée : les leads/vues restent sur Cloudflare D1 au
  edge ; le contenu vit côté Supabase admin, touché seulement au build. Honnêteté : cette approche
  n'**améliore** pas la séparation — elle approfondit le couplage build sur Supabase admin (la copie
  devient un SPOF de build comme les biens). Filet : valeurs CMS *par-dessus* le JSON commité → un
  snapshot vide rend la copie commitée, jamais une page blanche.
- **INV4 — rebuild via le chemin signé existant.** Un seul trigger `pg_net` (sur `status → published`)
  vers le MÊME `/api/revalidate` (même HMAC, même fenêtre anti-rejeu 5 min, même debounce KV 60s),
  puis la MÊME patte de déploiement. **Correction terrain bakée** : le `revalidate.ts` déployé POSTe
  un **Deploy Hook Cloudflare Pages** (`REVALIDATE_DEPLOY_HOOK_URL`), PAS `repository_dispatch` malgré
  le README. L'approche 1 réutilise tel quel ce que fait le trigger biens ; les 3 autres raisonnent sur
  le modèle `repository_dispatch` du README (faux) → chacune traîne un prérequis « trigger fantôme ».

**UX non-dev (2e critère).** Sanity (approche 3) est la meilleure en absolu (5/5 : WYSIWYG Portable
Text, i18n natif, rollback). L'approche 1 est 3/5 — mais gagne l'argument *propre à ce système* :
l'équipe marketing **vit déjà dans l'admin estate-flow** → « un onglet de plus, même login, même
design system, FR|EN|WO côte à côte » ≈ zéro friction. Plafond commun : un site statique
rebuild-on-publish n'a **pas de WYSIWYG instantané** (~2-3 min publish→live pour les 4) — INV2 interdit
la lecture runtime qu'exigerait une vraie preview live. L'avantage UX de Sanity est donc en partie
nominal ici, et coûte un nouveau fournisseur + un nouveau secret runtime.

**Effort/coût/fournisseur (3e critère).** Approche 1 : ~6-9 j-dev, **0 $ d'infra, 0 fournisseur, 0
surface runtime**. Sanity : 1,5-2 sem + fournisseur SaaS + secret webhook runtime + lock-in. Git-CMS :
~4-7 j mais nouvelle surface éditeur (Keystatic/Decap, OAuth, branch protection) + réconciliation de la
patte de déploiement.

## 3. Tableau comparatif

| Approche | Risque isolation | UX non-dev | Nouveau fournisseur ? | Effort | Coût |
|---|---|---|---|---|---|
| **1. Source build-time Supabase « Contenu du site »** (recommandée) | **2/5** — réutilise `supabase.build.ts` + `/api/revalidate` ; risque contingent au lieu du merge | **3/5** — même login, FR\|EN\|WO côte à côte, brouillon/publication/versions ; pas de WYSIWYG live | **Non** (Supabase admin existant) | ~6-9 j | ~0 $ |
| 2. Keystatic (mode Git) | 2/5 — fichiers build-time propres ; risque = route OAuth co-déployée sur le domaine | 3/5 — vraie UI form ; dossiers par locale ; pas de WYSIWYG live | GitHub App (étend la chaîne de confiance) | ~4-6 j | ~0 $ |
| 3. Sanity (fetch build-time) | 2/5 — token read build-only ; ajoute un secret webhook runtime + 3e fournisseur | **5/5** — Portable Text, i18n natif, rollback, autosave | **Oui — SaaS** | ~1,5-2 sem | 0-30 $/mois |
| 4. Astro Content Collections + Decap/Sveltia | 2/5 — cœur le plus pur ; risque = relais OAuth + `/admin` same-origin | 3/5 — forms-over-Git ; pas de WYSIWYG live | Aucun essentiel (GitHub) | ~4-7 j | ~0 $ |

## 4. Architecture recommandée

**Où vit le contenu.** Deux tables commitées dans le `public` du Supabase admin (gouvernées par RLS,
PAS le modèle anon-grant de l'analytics) :
- `public.site_content` — une ligne par CLÉ : `key` (ex. `hero.title.line1`, `faq.q1`,
  `meta.proprietaires.title`), `namespace` (pilote les onglets de l'écran + les requêtes build par
  page), `value_fr`, `value_en`, `value_wo`, `content_type` (`text`|`markdown`), `order`, `status`
  (`draft`|`published`), `updated_by`, `updated_at`, `published_at`. Texte plat pour ~90 % des clés
  (mapping 1:1 avec l'i18n actuel) ; `jsonb` seulement pour les blocs structurés (FAQ, témoignages).
- `public.site_content_versions` — historique append-only pour audit + revert en un clic.
- **Seed** = un importeur one-shot qui charge les `{fr,en,wo}.json` actuels en lignes → l'état de
  lancement est byte-pour-byte le site actuel. `/proprietaires` et `/partenaires` = nouveaux namespaces.

**Édition (fr/en/wo).** Nouvelle route « Contenu du site » dans l'admin React estate-flow, gatée par la
matrice `has_min_role` / `role_permission_overrides` existante (ex. rôle min `responsable`, même
machinerie que `/analytics`). Onglets par section, chaque champ **FR | EN | WO côte à côte, FR source
de vérité** ; un EN/WO vide hérite visiblement du FR. Sur le design system Jamm Sahel. Save (`draft`,
pas de rebuild) → « Publier » (passe en `published` + écrit une version + déclenche le rebuild).

**Récupération AU BUILD.** `src/lib/content.build.ts`, clone de `supabase.build.ts` : même garde
`isNodeBuild`, mêmes lectures `process.env.ADMIN_SUPABASE_*`, `persistSession:false`, soft-fail vers le
JSON commité. **Le merge CMS→dict tourne dans une étape prebuild** qui écrit
`src/i18n/generated/{fr,en,wo}.json` ; `i18n.ts` importe UNIQUEMENT ce JSON par-dessus les défauts
commités — donc `i18n.ts` n'importe jamais un `*.build.ts` et les 10 îlots client restent propres.
`t(key, lang)` et son fallback FR inchangés → tous les composants `.astro` continuent sans modif ;
seuls les blocs répétables (FAQ/témoignages/services) et les 2 nouvelles landing deviennent
data-driven.

**Déclenchement du rebuild (chemin existant, verbatim).** Un trigger `pg_net` sur `public.site_content`
(condition `NEW.status = 'published'`) calcule le même `HMAC-SHA256(body, REVALIDATE_HMAC_SECRET)` +
`x-vitrine-timestamp` et POSTe vers `/api/revalidate` existant → vérif HMAC → fenêtre anti-rejeu 5 min
→ debounce `REFRESH_KV` 60s → **la même patte de déploiement que le trigger biens** (le code montre
`REVALIDATE_DEPLOY_HOOK_URL`). Aucune nouvelle route, aucun nouveau credential, aucune surface runtime.

**Ce qui change où.**
- **estate-flow :** une migration commitée (2 tables + RLS anon-deny), un écran d'admin, un trigger
  `pg_net`, un importeur de seed.
- **vitrine :** `content.build.ts` (build-only), l'étape prebuild qui émet le JSON généré, la barrière
  d'import ESLint/CI, la sanitization HTML au build pour tout `set:html`, FAQ/témoignages/services
  data-driven + les 2 landing. **Aucune nouvelle var d'env, binding ou endpoint dans le runtime Pages.**
- **Cross-repo :** logguer le contrat de clés, le contrat d'env et le trigger dans `SHARED-STATE.md`
  avant de toucher au schéma (règle CLAUDE.md).

## 5. Plan d'implémentation par phases (le plus petit d'abord)

- **Phase 0 — schéma + seed (estate-flow, ~0,5 j).** Logguer l'intention dans `SHARED-STATE.md`.
  Migration **commitée** `site_content` + `site_content_versions` avec RLS qui `REVOKE` explicitement
  l'anon + un test de policy prouvant que l'anon PostgREST ne peut pas SELECT. Importeur one-shot →
  lancement == site actuel. **PAS de DDL ad-hoc via MCP** (le piège de la migration analytics).
- **Phase 1 — câblage build vitrine, le moins risqué (~1-2 j).** `content.build.ts` cloné ; étape
  prebuild → `src/i18n/generated/*.json` ; `i18n.ts` superpose généré sur commité. Barrière d'import
  ESLint + grep CI (à appliquer aussi à `supabase.build.ts`). Convertir les clés plates (FAQ, services,
  footer, méta SEO). Vérifier que la sortie `astro build` est byte-comparable à aujourd'hui. **Livrable
  ici — isolation complète, pas encore d'UX.**
- **Phase 2 — écran d'admin (estate-flow, ~2-3 j).** Route « Contenu du site », form FR|EN|WO par
  section, brouillon/publication, historique + « revert au dernier publié », gate de rôle.
- **Phase 3 — blocs structurés + nouvelles pages (~2-3 j).** FAQ/témoignages data-driven ; enrichir
  `/proprietaires` & `/partenaires` ; sanitization `sanitize-html`/`rehype-sanitize` au build ;
  `set:html` restreint aux clés revues par un dev.
- **Phase 4 — trigger rebuild + e2e (~0,5 j).** Trigger `pg_net` sur la transition publish uniquement,
  réutilisant `REVALIDATE_HMAC_SECRET` ; confirmer debounce KV + deploy ; test publish→live fr/en/wo.

**Total ~6-9 j-dev**, dominé par l'écran d'admin et les blocs structurés/landing.

## 6. Second choix & quand le préférer

**Second : approche 3 (Sanity), fetch build-time uniquement.** À préférer si la cadence éditoriale est
élevée (proche d'un blog), s'il faut du rich-text + gestion d'images + autosave + vrai rollback de
premier ordre, et si l'org accepte de gouverner un fournisseur de contenu SaaS de plus. L'UX 5/5 et
l'i18n natif de Sanity deviennent décisifs dès que le volume d'édition dépasse un formulaire côte-à-côte.

**À greffer quelle que soit l'option retenue :**
- De l'approche 4 : la discipline de **schéma typé**. Générer une **union typée des clés** depuis le
  seed + un check build qui casse sur clé manquante/renommée (au lieu d'afficher la clé brute) — durcit
  le contrat de clés cross-repo qu'introduit l'approche 1.
- Des approches 2 & 4 : publier via un **déploiement de preview / PR-gated** comme « preview » éditeur.
  Exposer l'URL de preview CF Pages + un statut « en ligne dans ~2-3 min » dans l'écran d'admin, pour
  adoucir l'absence de WYSIWYG live sans jamais ajouter de lecture runtime.
- De tous les reviewers : avant tout déploiement, **réconcilier la contradiction de la patte de
  déploiement** (le code POSTe un Deploy Hook ; le README dit `repository_dispatch` ; `check.yml`
  suggère l'auto-deploy Git CF) en une seule source de vérité commitée, et **asserter en CI que
  `ADMIN_SUPABASE_SERVICE_ROLE_KEY` est absent de l'env CF Pages**. L'approche 1 n'en dépend pas, mais
  c'est la vraie faille latente INV1 du système.

## 7. Risques & mitigations

| Risque (signalé en revue) | Mitigation |
|---|---|
| **Fuite INV1 via merge du CMS dans `i18n.ts` importé côté client** (constat principal) | Merge dans une **étape prebuild → JSON généré** ; `i18n.ts` n'importe que ce JSON. ESLint `no-restricted-imports` + grep CI cassent le build si un `.tsx`/`client:*` importe `*.build.ts`. Garder le throw `isNodeBuild` ; tester qu'il throw sous runtime Workers simulé. |
| **Footgun de déploiement INV1** — contradiction README/code ; la clé service_role pourrait atterrir dans l'env CF Pages si l'auto-deploy Git CF est ON | Rendre sans ambiguïté + CI-enforced que la PROD build dans GitHub Actions et que l'intégration Git CF Pages est OFF ; canary qui récupère le bundle client déployé et grep `service_role`/`sb_secret`/l'URL admin. |
| **Dérive de scope INV2/INV4** — le marketing demande une preview live → lecture runtime / nouvelle route | Interdiction documentée+CI de `/api/content*`. Preview = le **déploiement de preview CF Pages** (lui-même un build statique), exposé dans l'écran. Jamais de lecture runtime de brouillon. |
| **XSS stocké via `set:html`** figé en statique par un éditeur semi-confiance | Sanitizer AU BUILD tout HTML CMS (allowlist) ; champs éditeur restreints à un sous-ensemble markdown sûr ; clés HTML brut réservées à revue dev. Traiter les éditeurs comme semi-confiance. |
| **Répétition de la migration ad-hoc** — les objets analytics ont contourné `supabase/migrations` ; un grant anon accidentel exposerait `site_content` à PostgREST | Livrer une **migration commitée** avec `REVOKE` anon explicite + test de policy. Ne PAS refléter le modèle de grants de l'analytics. |
| **Dérive du contrat de clés cross-repo** — clé renommée/supprimée → JSON périmé / clé brute affichée | Générer une union typée des clés depuis le seed ; check build que chaque clé référencée existe ; logguer clés + env + trigger dans `SHARED-STATE.md`. |
| **Le SPOF de build s'approfondit** — la copie rejoint les biens comme dépendance build sur Supabase admin ; publier pendant une panne livre une copie périmée | Soft-fail vers le JSON commité (le site ne blanchit jamais). Rendre le fallback BRUYANT en CI. Trigger sur publish seulement ; une session de publication = un build ; debounce 60s. |
| **Amplification de rebuild / coût build-minutes** — chaque « Publier » = un rebuild SSG complet incl. pull biens | Trigger sur transition `status→published` uniquement ; collapser une session de publication en un build ; debounce KV 60s ; consigne d'édition par lots. |
| **Pas de preview instantanée** (la 1re plainte des éditeurs) | Gérer les attentes ; exposer l'URL du déploiement de preview + statut « en ligne dans ~2-3 min » ; « revert au dernier publié » en un clic pour borner l'exposition d'une mauvaise publication. |
| **Surface de rotation de secret** — un 2e trigger détient désormais `REVALIDATE_HMAC_SECRET` | Rotation de `REVALIDATE_HMAC_SECRET` en lockstep sur les deux triggers ; coordonné par CLAUDE.md. |

**Conclusion :** livrer la source de contenu build-time Supabase — la seule option **sans nouveau
fournisseur ni nouvelle surface runtime** qui réutilise de bout en bout le mécanisme d'isolation déjà
éprouvé (lecture service-role au build + garde `isNodeBuild` + le chemin exact `/api/revalidate`
HMAC→Deploy-Hook). Isolation-préservante *par conception* une fois les 4 garde-fous mécaniques en place
(merge prebuild, migration anon-deny, sanitization au build, interdiction d'endpoint runtime) : un 2/5
contingent qui devient un pass robuste.
