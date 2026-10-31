# Préparation et activation du chatbot

La vitrine reste sur Astro 4 et Cloudflare Pages. Le candidat ajoute des routes `/api/chat/*` même origine ; la configuration et les conversations sont partagées avec Estate Flow dans la D1 existante. Une déclaration de binding ne vaut ni activation, ni preuve de déploiement. Le chat, l'IA, les notifications email et les fichiers sont désactivés par défaut dans `0002_chat.sql`.

## Environnements et bindings

Ne pas recréer les ressources existantes et ne pas remplacer les variables Pages depuis un fichier `[vars]`. La configuration runtime reste dans les paramètres Pages de chaque environnement. Conserver les autres variables et secrets déjà présents.

| Binding vitrine | Ressource | Condition de release |
|---|---|---|
| `INTAKE_DB` | `jammimmo-intake`, D1 `b4847f4d-9c30-4996-9770-077a73e5b0c1` | Même D1 que `COMMERCIAL_INTAKE_DB` dans Estate Flow ; migration chat vérifiée |
| `REFRESH_KV` | Namespace existant déclaré dans `wrangler.toml` | Préserver son usage de revalidation |
| `AI` | Workers AI du compte Cloudflare autorisé | Binding seul ; aucun appel avant vérification du gratuit et activation explicite |
| `CHAT_FILES` | Bucket privé dédié `jammimmo-chat-private`, créé le 31 octobre 2026, accès public désactivé | Même bucket dédié que le traitement chat Estate Flow ; jamais de `r2.dev` ou domaine public. Ce binding ne donne pas accès aux documents clients des autres buckets. |

La preuve de compte gratuite du 31 octobre 2026 concerne le compte Cloudflare autorisé commençant par `3f69`. La relire au moment de l'activation : elle n'atteste pas indéfiniment l'état du compte, le quota restant ou l'absence de consommation par les autres fonctions IA. Aucun abonnement, moyen de paiement ou surcroît de permissions n'est nécessaire à cette préparation.

## Variables runtime Pages

| Nom | Valeur / gestion |
|---|---|
| `CHAT_ALLOWED_ORIGINS` | `https://jammimmo.com,https://www.jammimmo.com` ; origines exactes sans slash final. Chaque requête exige aussi `Origin` identique à sa propre origine. Aucun wildcard ni domaine de preview ajouté automatiquement. |
| `CHAT_IP_HASH_SALT` | Nouveau secret aléatoire de forte entropie, au moins 32 octets générés pour cet environnement. L'opérateur le crée et l'enregistre directement comme secret Pages ; ne jamais le copier dans le dépôt, un rapport, une URL ou un log. Le serveur refuse une valeur absente ou de moins de 16 caractères. |
| `CHAT_AI_FREE_VERIFIED` | Absent ou `false` par défaut. Seul le texte exact `true` permet l'IA, en plus de `aiEnabled`, du binding et du budget D1. |
| `CHAT_SCANNER_OPERATIONAL` | Absent ou `false` par défaut. Ne passer à `true` qu'après toutes les preuves fichiers ci-dessous. Ce drapeau seul ne rend pas le scanner opérationnel. |
| `CHAT_TEST_MODE` | Absent en production et en preview publique. Réservé aux fixtures locales ; ne pas activer pour contourner le contrôle d'origine. |

`pnpm build` distingue désormais les builds local/CI/preview (capture publique approuvée97, aucune lecture DB) et Pages production de confiance (artefact frais depuis la source anon existante et la vue géographique publique). La production refuse l’ancien mode snapshot : configurer explicitement `CATALOGUE_BUILD_SOURCE=trusted-production`, retirer `CATALOGUE_SNAPSHOT_SHA256`, puis attester les valeurs publiques existantes et leur projet. Aucun credential ADMIN n’est lu ou copié dans Pages ; aucun nouveau secret/grant n’est requis. Les erreurs, données partielles ou hashes invalides arrêtent le build avant promotion et conservent le déploiement précédent. Le child Astro reçoit les trois ADMIN vides ; vérifier séparément que les previews ne disposent d’aucun secret admin dès checkout/install. Les détails, la provenance historique des extras et les prérequis non encore vérifiés figurent dans [`public-catalogue-snapshot.md`](public-catalogue-snapshot.md). Ne pas remplacer le wrapper par `astro build`.

Les credentials administratifs ne sont jamais des secrets runtime du chatbot. `PUBLIC_CHAT_UI_QA=true` sert uniquement à la fixture du serveur de développement ; `/qa/chatbot` n'est pas une preuve de fonctionnement réel et ne doit pas être exposée comme démonstration en production.

Côté Worker Estate Flow, `CHAT_OPERATIONS_ENABLED=true` autorise les traitements planifiés de notification et de rétention ; le laisser absent ou `false` pendant la préparation. Vérifier leur fonctionnement avant l'ouverture publique, puis préserver la rétention des données déjà reçues lors d'un arrêt. Le Worker a aussi besoin de son propre binding `CHAT_FILES` vers le même bucket privé et de `CHAT_SCANNER_OPERATIONAL=true` après appairage réel. Son indicateur `CHAT_AI_FREE_VERIFIED` doit refléter la preuve de gratuité ; il ne remplace pas le drapeau Pages qui contrôle l'inférence publique. Configurer chaque environnement explicitement, sans recopier les secrets entre applications.

## Migration et ordre de livraison

1. Figer et faire relire ensemble les sources vitrine, Estate Flow et scanner, ainsi que le SHA-256 de `d1/migrations/0002_chat.sql`. Conserver les preuves des contrôles avec les hashes des sources réellement exécutées.
2. Vérifier la sauvegarde et le suivi des migrations D1 existantes. La migration `0002_chat.sql` crée les tables `chat_*`, les index, les quotas et les paramètres désactivés ; elle n'est pas idempotente. L'appliquer une seule fois à la D1 partagée par le chemin de migration approuvé, sans rejouer `0001_init.sql` et sans appliquer de migration commerciale/Supabase étrangère au chat.
3. Vérifier le schéma et les paramètres toujours désactivés. Livrer les deux applications compatibles et le scanner séparément par leurs chemins habituels approuvés. Cette documentation n'autorise ni push, ni déploiement, ni activation automatique.
4. Configurer les origines et le nouveau secret runtime. Garder l'IA, les fichiers et l'email désactivés. Les opérateurs et leur routage se configurent dans Estate Flow à partir du personnel actif réellement autorisé ; une panne Auth n'est pas une autorisation de contourner cette vérification.
5. Accepter le parcours réel sans IA : question sourcée, absence de réponse inventée sur un bien indisponible, demande humaine consentie et idempotente, visibilité inbox, réponse opérateur, reprise après perte réseau, suppression et expiration. Vérifier les exclusions rrweb/Clarity. Un reçu `recorded` n'atteste pas une notification envoyée ou la disponibilité de l'inbox.
6. Activer `enabled` dans les paramètres administrateur seulement après ces preuves. Activer les options ci-dessous séparément et conserver une preuve de chaque décision.

La base Supabase `ygaawqgwxlbtkcuqecxh` est déclarée indisponible lors de cette préparation. Aucun contrôle local avec fixtures ne prouve une authentification administrative ou une release saine. Ne pas lancer de sonde, redémarrage, contournement de rôle ou nouvelle acquisition de credentials dans le cadre de ces contrôles locaux.

## Activation séparée des options

**IA.** Le seul modèle du candidat est `@cf/meta/llama-3.2-3b-instruct`. Il sélectionne des extraits du corpus public de la release ; aucun outil, URL arbitraire, pièce jointe ou donnée privée ne lui est fourni. Avant `aiEnabled=true` et `CHAT_AI_FREE_VERIFIED=true`, confirmer le compte gratuit et le quota partagé, le budget atomique D1, les délais et la réponse déterministe de repli. Budget initial : 6 000 neurones/jour, plafond configurable de 8 000 ; ce budget chat ne plafonne pas les autres consommateurs du compte. Ne pas effectuer d'appel fournisseur pendant une recette déclarée hors réseau.

**Notifications.** Activer `notificationEmailEnabled` uniquement après une preuve d'envoi réelle avec identifiant fournisseur, destinataires staff vérifiés et reprise de l'outbox. Les statuts `simulated`, `unknown`, `unconfigured` ou `pending` ne signifient jamais « envoyé ». Le relais D1 demeure distinct de la notification.

**Fichiers.** Laisser `files.enabled=false` et `CHAT_SCANNER_OPERATIONAL` absent tant que chacune de ces conditions n'est pas prouvée en production :

- Bucket dédié privé, aucun accès public et règle native R2 d'expiration **limitée au préfixe exact `chat/quarantine/`**, configurée et relue avant le premier upload. Expiration après un jour comme filet de sécurité des objets orphelins ; l'éligibilité à suppression R2 ne garantit pas un effacement à la seconde. L'expiration applicative après 24 h interdit l'accès indépendamment du délai d'exécution R2. Préserver les règles et documents des autres buckets.
- Scanner réellement appairé par clé Ed25519, approbation tracée, heartbeat de moins de cinq minutes, signatures de moins de 48 heures et moteur ClamAV reconnu ; ni clé privée ni secret d'appairage dans le dépôt.
- Véritables scans d'un fichier propre et d'EICAR dans l'environnement appairé, contrôle du SHA-256 et de la taille exacts, et refus de téléchargement avant verdict propre. La qualification ClamAV locale seule ne prouve pas cet appairage de production.
- Upload R2 conditionnel immuable, `head` et récupération d'accusé perdu vérifiés sur le vrai binding ; refus de verdict rejoué/tardif, crash après PUT, suppression concurrente et reprise du nettoyage vérifiés. La règle native doit aussi couvrir l'orphelin non référencé après un crash.
- Route de téléchargement Estate Flow authentifiée, rôle/affectation revalidés, réponse privée `attachment`/`nosniff` et absence de fallback public. Erreur de scan, scanner périmé ou hash différent : accès refusé.
- Nettoyage et rétention applicatifs vérifiés sur les deux ressources D1/R2. Maximum 3 fichiers, 5 Mio chacun, 15 Mio par conversation, JPEG/PNG/WebP/PDF ; quota global de 100 Mio/jour. Les fichiers expirent au plus tard après 24 h ; les conversations suivent `retentionDays` (maximum 30 jours) et la session au plus sept jours.

## Contrôles locaux et limites de preuve

Utiliser Node **22.20.0** et pnpm 9. Le workflow `check.yml` emploie cette version pour exécuter le vrai `node:sqlite`, avec la migration réelle dans le harnais local. Il ne valide pas les bindings distants.

Avec le créneau lourd attribué et sans autre build/test/navigateur en parallèle, les contrôles locaux autorisés sont :

```bash
ADMIN_SUPABASE_URL='' ADMIN_SUPABASE_SERVICE_ROLE_KEY='' pnpm check
ADMIN_SUPABASE_URL='' ADMIN_SUPABASE_SERVICE_ROLE_KEY='' pnpm test
CATALOGUE_BUILD_SOURCE=public-snapshot-20261031 \
CATALOGUE_SNAPSHOT_SHA256=60f64ea76325fd5f5098e6938e768c983963a6ec892b11f9584c73f2fef8c8cb \
ADMIN_SUPABASE_URL='' ADMIN_SUPABASE_SERVICE_ROLE_KEY='' ADMIN_SUPABASE_ANON_KEY='' pnpm build
```

Le premier smoke local sans credentials ni mode snapshot a produit un catalogue vide ; ce résultat antérieur reste **exclu de publication**. Le contrôle local/CI conserve le snapshot97 ci-dessus. La release production exige en plus la préparation fraîche, la qualification des nouvelles annonces/retraits/prix sur une même révision et les prérequis réels de configuration ; elle ne peut pas rester figée sur97 silencieusement. Une réussite CI reste distincte du déploiement et de la recette en production. Ne pas récupérer la migration Astro 7 ou des fichiers du checkout racine modifié pour combler ce manque.

La recette locale UI conserve captures et films réellement relus sur desktop 1366×850, portrait 390×844 et paysage 844×390. L'extension WebKit est opt-in, sans téléchargement automatique de navigateur :

```bash
CHAT_UI_WEBKIT=true pnpm exec playwright test --config=playwright.chatbot.config.ts --project=webkit-portrait --project=webkit-landscape
```

Le harnais utilise uniquement des données fictives, bloque `/api/chat/*`, désactive analytics/Clarity et les credentials catalogue. `PUBLIC_CHAT_UI_QA=true` est une variable du processus local lancé par le harnais, jamais un paramètre fourni par un visiteur : elle désactive le `platformProxy` du serveur Astro de développement pour éviter l'ouverture automatique d'une connexion Workers AI distante par Wrangler. Cette condition ne modifie pas le build ou le runtime de production. L'émulation WebKit ne prouve pas un clavier ou un appareil iOS physique. Inspecter les vrais PNG et films, ainsi que les cas 320 px, texte à 200 %, rotation et espace de clavier réduit avant de déclarer la recette acceptée.

Le parcours local `/qa/chatbot?files=simulated` porte un avertissement explicite et utilise des noms de fichiers préfixés `SIMULATION`. Il vérifie l'affichage nom/taille, la quarantaine, un accusé perdu rejoué avec la même identité et un refus simulé qui continue de compter dans le quota. Il ne lit pas les octets pour les analyser, n'appelle aucun scanner et ne renvoie jamais de faux verdict propre. Seule la confirmation serveur `countsTowardsQuota=false` libère une réservation côté interface ; un statut refusé ou expiré seul ne la libère pas.

## Recette UI sur la CI Ubuntu

Le workflow `.github/workflows/check.yml` conserve les étapes de types, de tests unitaires et de build strict sur les 97 annonces, puis installe Chromium et WebKit avec la CLI Playwright issue du lockfile (`pnpm exec playwright install --with-deps chromium webkit`). Il lance tous les cas de `playwright.chatbot.config.ts` avec `CHAT_UI_WEBKIT=true` et `PUBLIC_CHAT_UI_QA=true`, sous Node 22.20.0. Les trois variables administratives Supabase sont vides ; le harnais bloque les origines externes et `/api/chat/*`, et le proxy Cloudflare local est désactivé avant son initialisation. Cette recette n'appelle ni Auth, ni fournisseur IA, ni base distante.

Les réglages restent un seul worker, aucun retry automatique et un arrêt au premier échec. Une erreur d'installation ou de recette fait échouer le job. Aucune assertion, aucun délai et aucun contrôle de réseau n'est assoupli pour contourner les échecs du Mac.

L'étape de diagnostic s'exécute avec `always()` et utilise `actions/upload-artifact@v4` pour conserver seulement `test-results/chatbot` et `playwright-report/chatbot`, pendant sept jours. Seule cette collecte possède `continue-on-error`. Une erreur de quota ou de transport des artefacts ne transforme jamais un échec QA en réussite ; elle laisse les preuves visuelles incomplètes, même si les tests passent. Associer les résultats au commit exact et récupérer puis relire les vrais PNG, films et traces avant d'accepter le rendu. Une étape verte ou un rapport indisponible ne remplace pas cette revue.

## Arrêt et retour arrière

Désactiver les options dans les paramètres administrateur et remettre les deux drapeaux techniques à `false` avant d'investiguer un incident. Une ancienne version sans chatbot peut être rétablie par le mécanisme Pages approuvé ; conserver les tables dédiées et les preuves, sans suppression SQL destructive ni altération des leads legacy. Le retour arrière doit préserver le traitement et la suppression des données déjà reçues. Une baisse de drapeau ne remplace pas le nettoyage des objets ou la rétention.
