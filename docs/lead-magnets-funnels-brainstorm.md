All code references are confirmed: `/api/leads` (Zod, phoneSn/phoneLoose, CORS, message≤2000), the analytics allowlist (search.performed exists, no estimator/alert/quiz events yet), quartiers.ts (rich editorial, no price grid), `wa.me/221769444849`, formatFCFA. The brief's claims hold. I now have everything needed to write the final deliverable.

# Jamm Immobilier — Boîte à outils & lead magnets de la vitrine
### Livrable de brainstorming · 14 juin 2026 · Dakar, mobile-first, FR/EN/WO, FCFA

---

## 1. Résumé exécutif

**La grande idée :** transformer la vitrine `jammimmo.com` — aujourd'hui un catalogue qui *montre* des biens — en une **suite d'outils-aimants qui rendent un service réel et capturent l'intention au pic**, puis basculent chaque lead sur **WhatsApp** (canal natif de Dakar et de la diaspora) et dans le **CRM estate-flow**. Trois leviers que les marketplaces locales (Expat-Dakar, CoinAfrique) ne peuvent pas tenir : (a) **la confiance** comme produit (anti-fraude foncière, biens vérifiés) ; (b) **la supériorité géo** grâce au dataset territorial vérifié de 1 472 lieux (estimation, prix, guides et comparaison **au quartier**, pas à la ville) ; (c) **la diaspora** (achat à distance, devises, visite vidéo). Principe directeur, validé partout dans le marché : **valeur d'abord, lead ensuite** — on livre un résultat gratuit et instantané, et on n'échange l'affinement humain que contre un numéro WhatsApp, relancé en moins de 5 minutes.

**Les 3 priorités :**
1. **Capter le MANDAT, pas seulement l'acheteur** — l'estimateur vendeur-bailleur au quartier sur `/proprietaires` est le lead magnet n°1 mondial et adresse le besoin n°1 de l'agence (acquisition de mandats, denrée rare).
2. **Rendre la recherche récurrente** — l'alerte WhatsApp « Préviens-moi » transforme une visite unique en relation réactivable gratuitement à perpétuité.
3. **Désamorcer la peur** — score de sécurité foncière + biens vérifiés Jamm : la confiance devient l'argument de conversion premium pour la diaspora.

---

## 2. Insights marché

### Ce qui marche ailleurs (synthèse)
- **Le lead magnet n°1 mondial n'est pas la recherche, c'est l'ESTIMATION** (Zillow Zestimate, Redfin, SeLoger, Idealista). Elle attire le public le plus rare et rentable : le **propriétaire-vendeur**. Le mandat manque, pas l'acheteur (conversion acheteur portail ~0,4–1,2 %).
- **L'INTERACTION qualifie** : faire *agir* l'utilisateur (revendiquer son bien, choisir des comparables, dessiner une zone, ajuster un budget) augmente l'engagement émotionnel ET la qualité du lead (Redfin Owner Estimate).
- **L'ALERTE crée la récurrence** : recherche sauvegardée + notification instantanée = réactivation gratuite et répétée. La **vitesse** de notif est un avantage compétitif mesurable.
- **La RAPIDITÉ de relance décide tout** : répondre en <5 min = ~100× plus de chances de connecter ; >1h = -10×. Un lead magnet ne vaut que branché sur une relance quasi-instantanée.
- **Le VISUEL qualifie** : 3D/vidéo = +49 % de leads qualifiés, +87 % de vues, ventes ~31 % plus rapides — décisif quand on ne peut pas se déplacer.
- **Le CONTENU GÉO LOCAL** (guides de quartier, prix au m², walkscore) = SEO massif + temps sur site + crédibilité qui pré-conditionnent la conversion.

### Les MANQUES Dakar / diaspora à exploiter (océans bleus)
- **Estimation vendeur quasi absente localement** : SamaGalle/Immotaissir s'arrêtent à la ville/grand quartier. Personne n'a la **granularité quartier/rue** (Almadies, Ngor, Sacré-Cœur, Ouakam, Mermoz…) que le dataset 1 472 lieux rend possible. **Impossible à copier.**
- **L'alerte par WhatsApp n'existe nulle part nativement** : le standard international est l'email ; à Dakar le canal natif est WhatsApp. « Préviens-moi sur WhatsApp » est un différenciant pur.
- **L'anti-fraude foncière n'existe qu'en articles** (Loger-Dakar), jamais en **outil interactif**. Or c'est la peur n°1, documentée : arnaques réelles de 18 à 270 M FCFA, titres falsifiés, ventes multiples, coxeurs. Un *outil* positionne Jamm en **tiers de confiance**.
- **La projection financière en FCFA + devises pour la diaspora est un vide** : capacité d'achat, rendement locatif net en EUR/USD/CAD, frais réels sénégalais (enregistrement, notaire, caution+avance). Aligné sur le narratif public **Fonds diaspora FCPI-DS** (« transformer ~2 200 milliards FCFA/an de transferts en revenus locatifs »).
- **La conversion se joue sur WhatsApp + mobile money** : site+WhatsApp intégré ≈ **4,8 % de conversion vs 1,2 % site seul** (données Kolonell). Wave/Orange Money à ~1 % de frais. C'est le canal, pas l'email.

### Avantage structurel Jamm (briques déjà en place à réutiliser)
Capture lead edge `POST /api/leads` (D1, Zod, CORS, rate-limit KV) · deeplink `wa.me/221769444849` · galerie publique `/g/{uuid}` · reels YouTube internes · cartes Leaflet `/carte` · pages quartier `/immobilier/<quartier>` · `/comparer` · `/favoris` · `/proprietaires` & `/partenaires` · CRM estate-flow (apporteurs, matching client↔bien, scoring) · dataset 1 472 lieux. **Tout est compatible Tier-3** (vitrine statique, calculs en JS client, données géo packagées au build, IA via Worker edge sans secret admin).

---

## 3. Catalogue d'outils & lead magnets (priorisé)

Scores sur 5 — **L** = valeur lead · **Faisa** = faisabilité (5 = livrable seul tout de suite) · **Fit** = adéquation Dakar/diaspora · **Nouv** = nouveauté/différenciation.

| # | Outil | Public | Lead magnet (la promesse) | L | Faisa | Fit | Nouv |
|---|-------|--------|---------------------------|---|-------|-----|------|
| 1 | **Alerte WhatsApp « Préviens-moi »** (recherche/quartier/budget → notif) | Acheteurs/locataires + diaspora (récurrent) | « Sois prévenu·e EN PREMIER sur WhatsApp — pas d'email, pas de compte » | 5 | 5* | 5 | 4 |
| 2 | **Mon budget à Dakar** (capacité d'achat FCFA + devises) | Acheteurs résidents + diaspora | « Reçois ta sélection dans ton budget + sois rappelé sur WhatsApp » | 5 | 5 | 5 | 4 |
| 3 | **Combien vaut / loue mon bien ?** (estimateur bi-mode AU QUARTIER) | **Propriétaires vendeurs & bailleurs** | « Estimation précise GRATUITE par un expert Jamm + mise en marché » → **mandat** | 5 | 3† | 5 | 5 |
| 4 | **Score de sécurité foncière + décodeur de titre** (anti-fraude) | Tous — surtout diaspora | « Fais vérifier ce bien gratuitement par Jamm avant de payer » + badge vendeur | 5 | 4 | 5 | 5 |
| 5 | **Match-o-mètre** (quiz 60s → 3 biens + carte partageable) | Acheteurs/locataires indécis + diaspora | « Reçois ta sélection + les nouveautés sur WhatsApp » (+ boucle virale) | 4 | 4 | 5 | 4 |
| 6 | **Calculateur de rendement & coût total d'achat** (FCFA + net en devises) | Diaspora/investisseurs + propriétaires hésitants | « Reçois ton rapport + les 3 biens à fort rendement du quartier » | 4 | 4 | 5 | 4 |
| 7 | **Vérification de bien Jamm** (encart confiance + inspection vidéo) | Diaspora/investisseurs | Form ultra-court attaché au `property_id` → lead haute-intention | 4 | 5 | 4 | 4 |
| 8 | **Comprendre l'achat au Sénégal** (parcours guidé résident/diaspora) | Tous — diaspora en priorité | « Reçois ta feuille de route personnalisée + accompagnement Jamm » | 3 | 5 | 5 | 4 |
| 9 | **Comparateur de quartiers + guide enrichi** (Almadies vs Ouakam vs Mermoz) | Diaspora/investisseurs + locaux | « Reçois le guide complet + les biens dispo de la zone » | 4 | 3† | 5 | 5 |

\* La **capture** de l'alerte est livrable seule immédiatement ; le **push** des matchs vit dans le worker estate-flow (cross-repo, à séquencer).
† Faisabilité 3 = **prérequis bloquant partagé** : `quartiers.ts` n'a **aucune grille prix/m²** aujourd'hui. La produire une fois (build-time, dérivée des annonces réelles + benchmarks) débloque tout le cluster vendeur/investisseur (#3, #6 mode optimal, #9, heatmap, « devine le prix »).

**Écartés / phase ultérieure :** recherche en langage naturel FR/EN/WO, dessine-ta-zone, swipe « coup de cœur » (améliorent la *découverte*, peu d'intention captée → phase « expérience ») ; WhatsApp Flows in-chat natif (vit côté WhatsApp Business API + CRM, hors périmètre vitrine — la version dégradée deeplink est déjà couverte) ; mécaniques virales pures (parrainage, reels-battle, « devine le prix ») = beaucoup de trafic, peu d'intention d'achat directe → à tester *après* le cœur du funnel ; « Mon espace mandat » via `/g/{uuid}` = excellent en **rétention** post-conversion mais cross-repo lourd → phase 2.

### État de livraison (au 15 juin 2026)

| # | Outil | Statut | Route |
|---|-------|--------|-------|
| 3 | Estimateur vendeur/bailleur (capture **mandat**) | ✅ **Live** | `/estimation` |
| 2 | Mon budget (acheteurs/locataires) | ✅ **Live** | `/budget` |
| 4 | Score de sécurité foncière (anti-arnaque) | ✅ **Live** | `/securite-fonciere` |
| 5 | Match-o-mètre (quiz → 3 biens réels) | ✅ **Live** | `/trouver-mon-bien` |
| 1 | Alerte WhatsApp « Préviens-moi » | ⏳ Capture livrable seule ; **push = worker estate-flow** (cross-repo, à séquencer) | — |
| 6 | Calculateur de rendement / coût total | 🔒 Bloqué sur la **grille prix/m²** (mode optimal) ; livrable en mode « saisie utilisateur » sans elle | — |
| 9 | Comparateur de quartiers enrichi | 🔒 Bloqué sur la **grille prix/m²** | — |

**Prochain non bloqué :** la **grille prix/m²** (build-time, dérivée des annonces réelles + benchmarks) qui débloque le cluster vendeur/investisseur (#6 rendement, #9 comparateur, et les chiffres réels de l'estimateur #3) — sensible côté honnêteté (chiffres défendables), à cadrer. Sinon #8 « Comprendre l'achat » (parcours guidé diaspora, sans chiffre). #1 alerte WhatsApp = bloqué worker estate-flow.

---

## 4. Quick-wins (fort impact / faible effort — ce qu'on lance en premier)

1. **Mon budget à Dakar (#2)** — *Le plus rentable à l'effort.* Calcul 100 % JS client, `formatFCFA` déjà là, catalogue déjà chargé pour le matching, deeplink `wa.me` en place, `/api/leads` opérationnel. Seul prérequis : un petit `rates.json` curé au build (taux bancaires + EUR/USD/CAD). **Lève la barrière psychologique n°1** (« puis-je acheter, et combien ? ») dans la monnaie de l'utilisateur, sans compte. Effort ~2–4 j. **Aucune dépendance grille prix.**

2. **Alerte WhatsApp « Préviens-moi » (#1)** — *Le meilleur ratio valeur-vie.* Réutilise les filtres URL-synced de la liste de biens (`q,type,transaction,city,priceMin,priceMax,bedsMin,sort`) → drawer pré-rempli, 2 champs, `POST /api/leads` (source=`alerte-wa`, critères sérialisés dans `message`). **La capture est livrable seule, sans attendre le worker.** Effort vitrine ~1 j. Le canal WhatsApp + valeur différée porte le taux d'opt-in bien au-dessus d'un email.

3. **Score de sécurité foncière + décodeur (#4)** — *Différenciant unique.* 100 % JS client, PDF généré côté client (jsPDF), capture `/api/leads`, **zéro dépendance grille prix** (critère « prix vs marché » dégradable, poids 0). L'effort est surtout **éditorial** (moteur de règles + glossaire à valider avec l'agence). Répond à la peur n°1 documentée. Effort ~1 sprint front + éditorial en parallèle.

4. **Comprendre l'achat au Sénégal — parcours guidé (#8)** — *Quick-win éditorial pur.* Contenu statique + progression en `localStorage` (pattern `favorites.ts`). SEO massif FR/EN/WO sur « comment acheter une maison au Sénégal ». Désamorce le flou exploité par les coxeurs, établit l'autorité. Effort très faible, **zéro grille prix, zéro cross-repo**.

5. **Vérification de bien Jamm — encart confiance (#7)** — *Réutilisation pure d'assets.* Encart « Confiance Jamm » + reel YouTube (`youtube.ts`) + statut packagé au build + 2 CTA diaspora (inspection terrain vidéo / visite vidéo privée), capture liée au `property_id` réel. Capte le lead exactement où la diaspora hésite à payer à l'aveugle. Effort léger (encart + CTA sur une fiche existante).

**Pourquoi cet ordre :** ces cinq sont livrables **sans le prérequis grille prix/m²** et **sans bloquer sur le worker estate-flow**. Ils couvrent les 3 publics dès le jour 1 (acheteur résident, propriétaire via le parcours, diaspora via le score + l'encart). En parallèle, on lance le **seeding de la grille prix/m²** (le vrai goulot) pour débloquer l'estimateur et le cluster investisseur en phase 2.

---

## 5. Funnels détaillés (top outils)

### Funnel A — Estimateur vendeur-bailleur AU QUARTIER (#3) · *la machine à mandats*

| Étape | Action | KPI |
|------|--------|-----|
| **Attirer** | Encart « Vous êtes propriétaire à `<Quartier>` ? Estimez votre bien » sur `/immobilier/<quartier>`, `/carte` ; hero `/proprietaires` pointe vers l'ancre `#estimer` (pas `/contact`) ; SEO « prix m² `<quartier>` Dakar » ; reels « lien estimation en bio » | Sessions `/proprietaires` ; clics vers `#estimer` |
| **Engager** | Widget React îlot, 5 champs, onglets VENTE / LOYER : quartier (autocomplete sur 1 472 lieux), type, surface, chambres, statut juridique (TF +20–30 %) + état. Calcul **instantané 100 % client** depuis la grille seedée → fourchette FCFA + position vs médiane du quartier + rendement brut (mode loyer) | Complétion estimation (start→résultat) 55–70 % |
| **Capturer** | Fourchette **gratuite**. Gating sur l'incrément : (a) estimation précise par expert qui se déplace, (b) PDF « rapport de quartier », (c) RDV visite. CTA WhatsApp pré-rempli + mini-form nom+tél (email optionnel) → `POST /api/leads`, `source='estimateur'`, contexte dans `message` | Résultat→capture 12–20 % ; split WhatsApp ~60 % / form ~40 % |
| **Qualifier** | Scoring auto : +3 titre foncier, +2 mode VENTE, +2 quartier premium, +2 gros ticket. ≥8 = HOT (rappel <1 h), 4–7 = WARM, <4 = NURTURE | % titre foncier ; délai 1er contact |
| **Nurturing WhatsApp** | J0 (<30 min) appel/WA expert reprenant le contexte exact + envoi du PDF ; J+2 preuve sociale (bien vendu dans le quartier) ; J+7 conseil de mise en marché ; diaspora = variante devises + visite filmée + mandat à distance | Réponse WhatsApp ; RDV pris |
| **Hand-off CRM** | `/api/leads` → D1 → mirror worker → estate-flow. Le CRM parse `message` (regex `[ESTIMATION • VENTE/LOYER]`), remplit les champs structurés, déclenche « mandat potentiel à matcher » si acheteurs en attente sur la zone | Lead→qualifié 50–65 % |
| **Convertir** | Visite gratuite = meilleur closing de mandat. Vente → mandat (idéalement exclusif) ; bailleur → mandat de gestion | Visite→mandat 25–40 % |

**KPIs bout-en-bout :** ~1–3 % visiteur-outil→mandat. Ordre de grandeur sur 1 000 lancements/mois ≈ 120–200 leads → ~60–110 qualifiés → ~25–50 visites → **~8–18 mandats/mois** à coût d'acquisition ≈ 0.

---

### Funnel B — Alerte WhatsApp « Préviens-moi » (#1) · *la relation récurrente*

| Étape | Action | KPI |
|------|--------|-----|
| **Attirer** | Trafic recherche existant (`/biens` filtrée, `/immobilier/<quartier>`) ; hook poussé en bas des reels et en bio sociale | % sessions recherche avec ≥1 filtre (30–45 %) |
| **Engager** | La recherche EST l'outil : résultats actuels **toujours gratuits**. Bouton « 🔔 Préviens-moi sur WhatsApp » sous les filtres + collant en bas mobile. **Recherche à 0 résultat → meilleur moment de capture** (« rien aujourd'hui, sois le 1er prévenu ») | Clic « Préviens-moi » / sessions filtrées 8–15 % |
| **Capturer** | Drawer mobile-first, critères **pré-remplis depuis l'URL** et éditables, résumé humain FCFA. 2 champs (nom + WhatsApp, regex `phoneSn`/`phoneLoose`). `POST /api/leads`, `source='alerte-wa'`, `message` = critères sérialisés, `property_id=null`. Confirmation + `wa.me` pré-rempli (opt-in scellé) | Complétion drawer 50–70 % ; % qui tapent le `wa.me` 40–60 % |
| **Qualifier** | Scoring : +25 vente, +15 budget, +15 critères riches, +15 tap `wa.me`, +10 diaspora (indicatif étranger), +10 quartier premium, +10 recherche 0-stock (signal mandat). ≥70 chaud / 40–69 tiède / <40 froid | % leads critères complets ; % matchés <24 h |
| **Nurturing WhatsApp** | **Événementiel (cœur)** : chaque nouveau bien matché → push photo + prix FCFA + lien + « Réserver une visite ». **Entretien** : J+7 si 0 match (2 biens proches) ; digest mensuel max 1/mois. Plafond ~2 msg/sem hors match, STOP honoré, fuseau respecté (diaspora) | Réponse aux pushs 25–40 % ; désabo <5 % |
| **Hand-off CRM** | (Reco) migration D1 `saved_searches` (additive, reste dans `INTAKE_DB` → Tier-3 OK) ; à défaut, voie `message+source` livre tout de suite. Le **matcher vit côté estate-flow** (cross-repo) | % alertes matchées ≥1 bien |
| **Convertir** | Push → visite → offre/bail. **Boucle de valeur-vie** : alerte non convertie reste active, RErelancée gratuitement à chaque nouveau bien (coût marginal ≈ 0). Volume d'alertes non satisfaites sur une zone = **argument d'acquisition de mandat** (« 37 personnes cherchent un T3 à Sacré-Cœur ») | Alertes→visites 8–15 % ; visites→transac 15–25 % |

**KPIs bout-en-bout :** ~1,5–3,5 % alerte→transaction, **cumulatif dans le temps** (l'alerte se re-déclenche gratuitement). KPI clé = nb de pushs de match par numéro/an + taux de réactivation.

---

### Funnel C — Mon budget à Dakar (#2) · *le qualifieur d'acheteur*

| Étape | Action | KPI |
|------|--------|-----|
| **Attirer** | Pages-piliers `/outils/budget` (+ `/en`, `/wo`) ; bandeau « Calculez votre budget » sur quartiers/carte/comparer/fiches ; ciblage diaspora FB/IG par géo (Paris, Lyon, Montréal, NY) | Visiteurs outil ; part diaspora |
| **Engager** | 4 champs (revenu, apport, charges, durée) + bascule devise → FCFA (taux du `rates.json` build). Résultat immédiat : fourchette de prix + mensualité + reste-à-vivre + **3–6 biens Jamm réels** dans la fourchette (filtre client). Moment « aha » | Complétion calcul 55–70 % ; % avec ≥1 bien matché 70–85 % |
| **Capturer** | Résultat de base gratuit. Gating sur « ma sélection complète + être rappelé ». Porte A (dominante) : `wa.me` pré-rempli (budget arrondi + réfs matchées). Porte B : form `/api/leads`, budget encodé dans `message` (`BUDGET=…|DEVISE=…|TX=…|REFS=…`) | Capture/calcul 12–20 % (15–25 % diaspora) |
| **Qualifier** | ≥80 M = HOT premium ; devise étrangère = flag diaspora (priorité) ; ≥1 réf = intention concrète, rattachée via `property_id` | % HOT ; % diaspora |
| **Nurturing WhatsApp** | J0 <30 min (heures Dakar) → galerie `/g/{uuid}` des biens matchés ; J+2 email sélection + guide quartier + bloc diaspora ; J+5 SMS ; J+14 « on élargit ? ». Diaspora = visite vidéo live systématique | Délai 1re réponse ; réponse WhatsApp |
| **Hand-off CRM** | `/api/leads` → D1 → mirror → estate-flow. Le budget capté alimente directement le matching client↔bien | Délai capture→qualif |
| **Convertir** | Résident → visite physique ; diaspora → visite vidéo → réservation. Effet de bord : un « propriétaire » qui calcule → router vers `/proprietaires` (mandat) | Calcul→RDV 20–35 % |

**KPIs bout-en-bout :** funnel global session→lead ~1,5–4 % (vs ~0,5–1 % d'un contact générique) — l'outil **multiplie ×3 à ×5** la conversion sur son segment. *Disclaimer obligatoire près du résultat : « estimation indicative, non contractuelle, ne constitue pas une offre de crédit ».*

---

### Funnel D — Score de sécurité foncière (#4) · *le tiers de confiance*

| Étape | Action | KPI |
|------|--------|-----|
| **Attirer** | SEO de la peur : `/verifier-titre` (+ `/verify-title`, `/wo`) sur « délibération c'est quoi », « TF ou bail Sénégal », « arnaque terrain Dakar » ; reels « 3 phrases qui trahissent une arnaque » ; groupes WhatsApp diaspora | Sessions ; part diaspora (CF country ≠ SN) |
| **Engager** | Wizard 6–8 questions cochables, 100 % client, mobile-first : type de titre, ancienneté du certificat, notaire, nb de coxeurs, prix vs quartier, acompte avant docs. Jauge de score + micro-décodage du jargon en direct (« une délibération n'est PAS un titre ») | Complétion 55–70 % ; temps <2 min |
| **Capturer** | Score /100 + feu tricolore + drapeaux rouges **gratuits et complets**. Gating sur (a) PDF récap + checklist (généré client, téléchargeable sans contact ; **envoi WhatsApp** = contact), (b) CTA fort « Faire vérifier ce bien gratuitement par Jamm avant de payer ». Form nom+tél | Résultat→lead 12–20 % (rouge/orange ×2–3) |
| **Qualifier** | `message` = `[VERIF-TITRE] score=34/100 feu=ROUGE flags=DELIB,COXEURS_MULTI,ACOMPTE_AVANT_DOCS quartier=ngor diaspora=FR`, `source='verif-titre'`. Priorité par couleur : ROUGE <30 min, ORANGE <2 h, VERT <24 h | % rouge/orange ; délai par couleur |
| **Nurturing WhatsApp** | ROUGE : « ne versez rien, on vérifie pour vous » + 2–3 alternatives au titre propre du même quartier. VERT : bascule douce vers la recherche. Non-acheteurs : drip éducatif J3/J10/J30 (guides quartier). Diaspora : email + visio + procuration | Réponse J0 ; RDV pris |
| **Hand-off CRM** | estate-flow parse `[VERIF-TITRE]`, range par priorité, assigne (`assigned_to`), propose des biens au **titre propre** (matching client↔bien) | Lead→RDV 25–40 % (rouge/orange) |
| **Convertir** | Acheteur/diaspora → vérif gratuite → visite (physique/procuration) → transaction. **Propriétaire** → badge « Bien vérifié par Jamm » → **mandat** (l'outil devient un argument d'acquisition) | Visite→transac/mandat 10–20 % |

**KPIs bout-en-bout :** funnel visiteur→lead ~4–8 % (vs 1–2 % d'un contact générique). Effet vendeur additionnel : mandats signés via le badge.

---

## 6. Roadmap par phases (avec dépendances)

### Phase 0 — Fondations transverses (à lancer en parallèle de la Phase 1)
- **Seeding de la grille prix/m² au quartier** (`src/lib/price-grid.ts`, figée au build, dérivée des annonces réelles + benchmarks, ajustée titre foncier/état). **Prérequis bloquant** des #3, #6 (mode optimal), #9, heatmap. Effort 2–4 j (data + validation terrain). **Reseed = simple rebuild → Tier-3 préservé.**
- **`rates.json` curé au build** (EUR/USD/CAD→FCFA + taux bancaires SN). Prérequis léger de #2 et #6.
- **Coordination cross-repo** (à logger dans `SHARED-STATE.md` *avant* de coder) : extension de l'allowlist d'events dans `src/lib/analytics.ts` ↔ worker `analytics-ingest` (events `estimator.*`, `verif.*`, `quiz.*`, `alert.created` — non-PII) ; support `source` additionnel dans D1 (`source` est TEXT libre → **pas de migration**) ; le matcher de l'alerte WhatsApp côté estate-flow.

### Phase 1 — Quick-wins vitrine (semaines 1–3) · *livrables seuls, sans grille prix, sans bloquer sur le worker*
- **#2 Mon budget à Dakar** (dépend de `rates.json`)
- **#1 Alerte WhatsApp — capture** (la capture seule ; le push est séquencé en Phase 2 côté estate-flow)
- **#4 Score de sécurité foncière** (critère prix dégradable sans la grille)
- **#8 Comprendre l'achat au Sénégal** (zéro dépendance)
- **#7 Vérification de bien Jamm — encart confiance** (réutilise reels + `/g/{uuid}`)

### Phase 2 — Cœur vendeur/investisseur (semaines 3–6) · *débloquée par la grille prix/m²*
- **#3 Estimateur vendeur-bailleur** (la machine à mandats — dépend grille)
- **#6 Calculateur de rendement & coût total** (mode optimal dépend grille ; dégradable en saisie libre avant)
- **#1 Alerte WhatsApp — push** (matcher worker estate-flow ; le stock d'alertes accumulé en Phase 1 amorce le matcher dès sa mise en ligne — **aucun risque de 502**)
- **#5 Match-o-mètre** (scoring client, pas de dépendance grille — peut aussi venir en Phase 1 si la capacité le permet)

### Phase 3 — Ambitieux / différenciation (semaines 6+)
- **#9 Comparateur de quartiers + guides enrichis** (dépend grille + indice de vigilance foncière éditorial par zone) → SEO local massif
- Recherche conversationnelle FR/EN/WO (NLP au edge via Worker), heatmap prix/rendement sur `/carte`, dessine-ta-zone, swipe « coup de cœur »
- WhatsApp Flows in-chat natif (intégration WhatsApp Business API + CRM)
- « Mon espace mandat » via `/g/{uuid}` (rétention post-conversion)
- Tests des mécaniques virales (« devine le prix », carte coup de cœur) une fois le funnel de conversion solide

**Dépendance critique à retenir :** la **grille prix/m²** est le goulot unique qui gate tout le cluster vendeur/investisseur. La produire tôt (Phase 0) en parallèle des quick-wins est le choix à plus fort levier.

---

## 7. Mesure (KPIs globaux du funnel)

### Le funnel en 6 étages (à suivre par outil ET en agrégat)
1. **Trafic outil** : sessions sur chaque outil ; % depuis SEO vs social vs interne ; **part diaspora** (langue ≠ fr-SN + devise non-FCFA + CF country ≠ SN).
2. **Activation** : taux de complétion de l'outil (a vu un résultat). Cibles 55–70 %. Alerter si <50 % (signal friction mobile/3G).
3. **Capture** : leads / résultats. Cibles 12–20 % (8–15 % budget, 25–40 % quiz) — bien au-dessus d'un opt-in email à 1–2 % grâce au gating valeur-d'abord + WhatsApp.
4. **Qualité du lead** : % HOT/premium, % diaspora, % avec `property_id`, complétude des critères.
5. **Vitesse de relance** (LE KPI déterminant) : **délai médian 1re réponse WhatsApp < 30 min** en heures Dakar. Corrèle directement au taux de RDV.
6. **Conversion business** : lead→RDV/visite, visite→offre/mandat, et le KPI de valeur-vie de l'alerte (pushs/an, réactivation).

### KPIs stratégiques propres à Jamm
- **Mandats acquis** via l'estimateur + via le badge « Bien vérifié » + via les **alertes non satisfaites** par quartier (boucle public 1 ↔ public 2).
- **Mix devises** (FCFA vs EUR/USD/CAD) = santé du segment diaspora premium.
- **Coefficient viral** du Match-o-mètre (cartes partagées → nouveaux visiteurs) = CAC organique.

### Comment l'analytics maison + Clarity couvrent ces KPIs
- **Analytics maison** (`src/lib/analytics.ts` → worker → schéma `analytics`) : étages 1–3 via des events **non-PII** à ajouter à l'allowlist (`estimator.started/completed/lead.submitted`, `verif.started/completed/pdf.generated`, `quiz.started/completed/card.shared`, `alert.created`, `budget.calculated`). Règle stricte : **jamais de PII** dans les props (slug/type/bool/scoreband uniquement). `search.performed`, `quartier.viewed`, `property.viewed`, `whatsapp.tapped`, `favorite.*`, `lead.form.submitted` existent **déjà** — réutilisables tels quels. Toute extension = élargir l'union dans `analytics.ts` **et** côté worker `analytics-ingest`, **logué dans `SHARED-STATE.md`** (touchpoint payload cross-repo).
- **Microsoft Clarity** (`wzmf77dsq9`) : étages 2 et 4 par les **heatmaps + session replay** — voir *où* les wizards/quiz sont abandonnés (carte budget ? question foncière ?) et itérer les pondérations. `forceReplay()` est déjà appelé sur les conversions (`lead.form.submitted`) → enregistrer la session des leads.
- **PII (budget, devise, n° de tél, critères) reste exclusivement dans D1** via `/api/leads` (PII-side), **jamais dans le flux analytics**. Les étages 5–6 (relance, conversion) se mesurent côté **CRM estate-flow** (pipeline nouveau→contacté→RDV→visite→offre/mandat), branché sur le lead D1 par `source` + `message` structuré.

---

**Fil rouge unique de tout ce document :** *valeur d'abord, lead ensuite, relance en moins de 5 minutes sur WhatsApp.* Chaque outil livre un résultat gratuit utile, ne demande le contact que pour l'incrément de valeur, capte dans D1 sans casser l'isolation Tier-3, et bascule sur le canal natif de Dakar et de la diaspora — pour que la vitrine ne se contente plus de montrer des biens, mais **fabrique du mandat et de la confiance**.

---

*Fichiers vérifiés (chemins absolus) : `/Users/solutionmakers/SolutionMakersCloud/P/jammimmo/jammimmo-commercial-website/src/pages/api/leads.ts` (Zod, phoneSn/phoneLoose, CORS `jammimmo.com`, message≤2000) · `/Users/solutionmakers/SolutionMakersCloud/P/jammimmo/jammimmo-commercial-website/src/lib/analytics.ts` (allowlist d'events ; `search.performed` présent, pas d'event estimator/verif/quiz/alert) · `/Users/solutionmakers/SolutionMakersCloud/P/jammimmo/jammimmo-commercial-website/src/lib/quartiers.ts` (copie éditoriale riche, AUCUNE grille prix/m² = prérequis bloquant) · `/Users/solutionmakers/SolutionMakersCloud/P/jammimmo/jammimmo-commercial-website/src/lib/site-config.ts` (`whatsappUrl: https://wa.me/221769444849`) · `/Users/solutionmakers/SolutionMakersCloud/P/jammimmo/jammimmo-commercial-website/src/lib/format.ts` (`formatFCFA`, `formatRentalPrice`) · état coordination : `/Users/solutionmakers/SolutionMakersCloud/P/jammimmo/SHARED-STATE.md`.*