# Rapport d'audit UX mobile — jammimmo.com

## 1. Synthèse

L'expérience mobile repose sur des fondations solides : architecture de recherche claire sur `/biens`, fiche bien riche en CTA (WhatsApp/Appel), outil anti-arnaque crédible et microcopy de confiance bien pensée. Mais trois enjeux majeurs freinent la conversion :

- **WhatsApp, canal dominant à Dakar, est absent de presque tous les points d'entrée** (home, contact, outils) — il n'existe que sur la fiche bien.
- **Le logo cassé sur fond bleu et les photos de biens sombres/non représentatives** sapent la confiance dès le premier écran, sur un marché où la crédibilité est l'argument de vente n°1.
- **Les funnels (outils + cartes résultats) cachent leurs CTA et infos clés sous la ligne de flottaison**, retardant l'entrée dans la tâche.

Aucun défaut bloquant (P0) : tout fonctionne, rien n'est cassé.

## 2. Ce qui est déjà réussi

- **Fiche bien = grappe de conversion complète** : « Je suis intéressé(e) » + Appeler + WhatsApp côte à côte + formulaire, numéro/email en clair. Le lead chaud convertit en 1 tap.
- **Outil « Sécurité foncière » différenciant** : nomme les peurs réelles du marché (« faux titres, vente multiple, coxeurs »), gratuit, sans inscription, vérification par un expert.
- **Microcopy de confiance** : « gratuitement et sans inscription », « Aucune coordonnée demandée avant le résultat », « Réponse garantie sous 24h ».
- **Recherche `/biens` bien posée above-fold** : champ plein largeur, bouton Filtres, compteur « 51 bien(s) », tri, bascule Carte.
- **Autocomplétion de lieu excellente** : hiérarchie quartier→ville en fil d'Ariane (Almadies › Ngor › Dakar).
- **Menu mobile exemplaire pour le pouce** : entrées pleine largeur, bien espacées, chevrons, CTA « Estimer un bien » épinglé en bas.
- **Identité de marque forte au hero** : serif élégante + italique orange, palette bleu nuit/orange disciplinée et lisible.
- **Accessibilité de base soignée** : labels au-dessus des champs, statuts doublés texte+icône+couleur, progression funnel « ÉTAPE 3/6 + 50% » en texte.
- **i18n de qualité sur les chemins clés** : EN idiomatique (« peace of mind »), FCFA formaté avec séparateur (« 110 000 FCFA / mois »).

## 3. Problèmes priorisés

### P0 — bloquant
Aucun. Tous les parcours sont fonctionnels.

### P1 — à corriger en priorité

**1. WhatsApp absent de tous les points d'entrée sauf la fiche bien**
- Écran : Contact (E1/E2), home (A1/A2), landings outils (D1-D4, F1)
- Problème : seuls canaux = adresse, téléphone en texte brut, email, formulaire ; WhatsApp (canal dominant, plus faible friction) uniquement sur la fiche bien.
- Correctif : transformer le téléphone du Contact en double bouton « Appeler » + « WhatsApp » (lien `wa.me` pré-rempli) ; ajouter un FAB WhatsApp persistant en bas d'écran (a minima home + pages outils).
- Effort : **quick** (transformer le numéro) à **medium** (FAB global)

**2. Logo cassé sur fond bleu (rectangle noir collé, wordmark + baseline qui se chevauchent)**
- Écran : A1, et identique sur C1, C2, F1, G1
- Problème : mark enfermé dans un bloc noir opaque qui tranche avec le hero bleu nuit ; effet « template mal intégré » dès le 1er écran, sur un marché où la confiance prime.
- Correctif : fournir un logo SVG transparent (mark détouré + wordmark clair) pour fonds sombres, variante foncée pour fonds crème, switch selon le thème ; corriger crénage/interlignage wordmark+baseline.
- Effort : **medium**

**3. Photos de biens sombres, non représentatives et incohérentes (catalogue + fiche)**
- Écran : B1/B2 (grille), C1 (fiche)
- Problème : vignettes quasi noires, frames vidéo avec bandeaux texte lus comme des documents, **un Taj Mahal en couverture d'une villa à 1,2 Md FCFA** — atteinte directe à la crédibilité ; cover de fiche = pièce vide sombre avec palettes au sol.
- Correctif : standardiser la 1re photo (ratio fixe, recadrage center, correction d'exposition) ; exclure documents, frames vidéo à bandeaux et images stock/placeholder de la position couverture ; sélection auto de la photo la plus lumineuse ; badge nombre de photos.
- Effort : **medium**

**4. Les 4 landings d'outils n'ont aucun CTA above-the-fold**
- Écran : D1 (vérifié), D2/D3/D4
- Problème : 1er écran = titre + paragraphe de promesse + sous-titre de section, aucun bouton/champ « Commencer / Étape 1/6 » sans scroller, sur les pages d'entrée des funnels.
- Correctif : faire remonter le 1er champ/bouton sous le titre, réduire l'intro à une ligne et déplacer le détail sous le CTA.
- Effort : **medium**

**5. Galerie photo pauvre + infos clés trop maigres sur la fiche bien**
- Écran : C1/C2
- Problème : peu de visuels, pas de compteur « 1/N » ni miniatures ; bloc d'attributs limité à « CHAMBRES 1 » / « TYPE Chambre », pas de surface m², étage, charges, caution/dépôt — contact « à l'aveugle » sur un marché sensible à l'arnaque.
- Correctif : imposer un minimum de 5-6 photos lumineuses + compteur « 1/N » + miniatures ; ajouter des champs structurés obligatoires (surface, étage, meublé, charges, caution, dispo) en pictogrammes sous le titre ; afficher « non communiqué » plutôt que masquer. Bloquer la publication sous le minimum côté admin.
- Effort : **large**

**6. Le bouton flottant « Carte (51) » recouvre le compteur et le tri**
- Écran : B3 (et B1)
- Problème : la pastille « Carte (51) » chevauche « 51 bien(s) affiché(s) » et le sélecteur « Trier », masquant l'info et provoquant des taps accidentels Trier↔Carte en pleine zone du pouce.
- Correctif : padding-bottom de sécurité sous la liste, ou FAB compact aligné à droite, ou bascule Liste/Carte intégrée à la barre de filtres.
- Effort : **medium**

**7. Autocomplétion de lieu tassée et multi-lignes → risque de mis-tap**
- Écran : D5 (estimation, étape 3/6)
- Problème : résultats sur 2 lignes à hauteurs inégales, espacement vertical serré, sans séparateur → choix du mauvais quartier qui fausse l'estimation.
- Correctif : hauteur de ligne min 48px, séparateur/zebra, zone de tap pleine largeur, fil d'Ariane tronqué sur une ligne (ellipsis).
- Effort : **medium**

### P2 — à corriger ensuite

**Conversion & funnels**
- **Hero : CTA secondaire « Estimation gratuite » fantôme et tronqué** (A1) — outline translucide sur la blob orange, bas coupé par la ligne de flottaison. Fix : fond semi-opaque/bordure nette, contraste AA, faire tenir entièrement above-fold. _quick_
- **Formulaire de contact à 6 champs redondants** (E2) — Prénom+Nom scindés, téléphone ET email demandés. Fix : fusionner « Nom complet », un seul contact requis, viser 3 champs. _medium_
- **Page Contact noie le formulaire sous les blocs agence** (E1/E2) — scroll important avant le 1er champ. Fix : remonter le formulaire après le titre, coordonnées (avec Appeler/WhatsApp) à côté. _medium_
- **Prix hors écran sur la fiche, masqué par l'overlay vidéo** (C1) — gros play rouge centré, prix non visible above-fold. Fix : réduire/déplacer le play en coin, remonter le prix sous le titre (ou sticky). _medium_

**Design & marque**
- **Play vidéo rouge hors charte** (C1) — style YouTube, le site est bleu/orange. Fix : restyler orange/blanc, plus discret, décalé du sujet. _medium_
- **Wordmark hero sur l'orbe orange → contraste irrégulier** (A1) — dernières lignes du paragraphe lavées sur l'orange. Fix : scrim sombre derrière le bloc texte, garantir AA. _quick_

**Fiche bien & confiance**
- **Texte critique (réf, agence) posé sur photo sans scrim garanti** (C2) — lisible aujourd'hui mais dépendant de la luminosité ; barre prix sticky sur fond variable. Fix : dégradé sombre systématique sous l'overlay, prix sur fond plein. _medium_
- **Incohérence vente/location** (C2) — bien « À louer » avec CTA « Acheter sans risque ». Fix : conditionner le libellé au type d'offre (« Louer sans risque ? »). _medium_
- **Prix sans séparateur de milliers** (C2) — « 110000 FCFA » sur le champ principal alors que les biens similaires affichent « 80 000 ». Fix : formatage centralisé fr (espace insécable). _quick_
- **« Ref #— » placeholder alors que la vraie réf existe** (C1) — JI-RCH-DKR-2606-0304 imprimée juste en dessous. Fix : brancher le champ Ref, le rendre copiable, ne jamais afficher « #— ». _quick_
- **Pas de preuve de vérification par bien** (C2) — promesse anti-arnaque abstraite, non rattachée au bien. Fix : badge « Vérifié par Jamm + date », type de mandat, date de MAJ. _medium_

**Accessibilité & lisibilité**
- **Slogan d'en-tête en micro-texte gris peu lisible + libellé bancal** (A1) — « UN INVESTISSEMENT SÛR ET TOUTE SÉCURITÉ ». Fix : ≥12px, contraste AA, reformuler (« Un investissement sûr, en toute sérénité »), teinte claire dédiée sur fond sombre. _quick_
- **Placeholders gris très clair (~1,2-1,9:1)** (E2/C2) — sous le seuil AA, pris pour des valeurs saisies ; select « VOTRE PROJET » affiche « — ». Fix : monter le contraste à AA, libellé clair sur le select. _quick_
- **Labels/valeurs de filtres en gris clair** (B3) — difficiles à scanner. Fix : contraste AA, agrandir labels, foncer les valeurs sélectionnées. _quick_

**Recherche & navigation**
- **Pas de recherche globale (loupe header / champ menu)** (A3) — recherche enfermée dans `/biens`. Fix : icône loupe dans le header (overlay → /biens pré-ciblé) ou champ en tête de menu ; libeller « Chercher un bien ». _medium_
- **Filtres sans compteur live ni « Voir X résultats »** (B3) — réglage à l'aveugle. Fix : compteur live dans le panneau + CTA collant qui se met à jour, grisé si 0. _medium_
- **51 résultats en 1 colonne sans pagination/lazy-load** (B2) — scroll très long. Fix : pagination ou infinite-scroll paginé (12/lot) + lazy images + conservation du scroll au retour. _medium_
- **Cartes résultats sans prix/quartier/caractéristiques above-fold** (B1) — il faut ouvrir chaque fiche pour comparer. Fix : réduire la hauteur photo, afficher prix gras + quartier + 2-3 puces sous la photo. _medium_
- **Taxonomie du menu ambiguë** (A3) — Services / Accompagnement / Estimation express / Propriétaires se recoupent. Fix : regrouper par intention (Acheteur/Locataire vs Propriétaire/Vendeur), fusionner Estimation dans Propriétaires. _medium_

**Ergonomie & contenu**
- **Pas de FAB de contact persistant sur fiche/liste** (C1/B1) — contact seulement via header ou bas de page. Fix : FAB WhatsApp+appel ancré en bas ≥56px (recoupe le P1 #1). _medium_
- **Footer : ~20 liens texte serrés** (E2) — cibles sous 44px. Fix : padding vertical ~44px ou sections repliables. _quick_
- **Sélecteur de langue étroit, absent du menu, WO non visible** (A1/A3) — promesse trilingue non tenue visuellement. Fix : vrai sélecteur 3 langues (FR/EN/WO) dans le menu, cible ≥44px. _medium_
- **Titre de bien = fragment minuscule sans type** (C1) — « 1 chambre à Liberté 3 » (studio ? appart ?). Fix : gabarit « Appartement 1 chambre — Liberté 3, Dakar ». _medium_
- **Tagline redondant FR/EN** (G1) — « sûr et toute sécurité » / « safe and secure ». Fix : réécrire un bénéfice distinct (« peace of mind » déjà utilisé au hero EN), MAJ `site.tagline` 3 locales. _quick_
- **Wolof incomplet (~20% des clés retombent en FR) avec note interne** — chemins principaux OK, mais sections secondaires en FR. Fix : compléter les ~125 clés par un natif, ou marquer WO « Bêta » dans le switcher. _large_

### P3 — regroupés (polish mineur, à traiter en lot opportuniste)
Contraste « Ref #— » et breadcrumb, placeholders « — » des filtres sans exemple, microcopy budget molle, incohérence légère du discours « sans coordonnée », doubles CTA d'estimation redondants (F1), deux univers visuels bleu/crème, baseline du logo repliée, eyebrows incohérents inter-pages, densité de badges sur la fiche, liens contextuels fins (retour/itinéraire), selects de filtres bas, header un peu haut, landing home très longue sans bouton « ↑ haut de page », absence de chips/slider de filtres rapides, hero sans vraie barre de recherche, tri « Pertinence » opaque, absence de fil d'Ariane sur la fiche. → Traiter via un design-system pass (tokens contraste/typo, composant eyebrow, formatage prix centralisé) + un bouton « retour en haut ».

## 4. Top 5 quick wins (fort impact, effort quick)

1. **Téléphone Contact → double bouton « Appeler » + « WhatsApp »** (`wa.me` pré-rempli) — ouvre le canal dominant sur un point d'entrée majeur. (E1)
2. **Brancher le champ « Ref #— » sur la vraie référence + la rendre copiable** — signal anti-arnaque gratuit, donnée déjà présente. (C1)
3. **Formater le prix principal avec séparateur de milliers** (« 110 000 FCFA ») — corrige une incohérence visible sur la même page. (C2)
4. **Monter le contraste des placeholders et des labels de filtres à AA** — débloque la lisibilité formulaire + filtres en plein soleil. (E2, B3)
5. **Rendre le CTA hero « Estimation gratuite » visible** (fond semi-opaque/bordure nette + tenir above-fold) et corriger le slogan d'en-tête (taille/contraste + reformulation). (A1)

## 5. Plan suggéré (ordre de bataille)

**Vague 1 — Confiance & WhatsApp (impact lead immédiat, surtout quick)**
Double bouton Appeler/WhatsApp + FAB WhatsApp persistant ; champ Ref réel + copiable ; formatage prix centralisé ; contraste placeholders/labels/slogan AA ; CTA hero secondaire lisible ; tagline reformulé. → Débloque le canal n°1 et répare les signaux de crédibilité à coût minimal.

**Vague 2 — Marque & funnels (medium, fort levier conversion)**
Logo SVG transparent multi-thème ; CTA above-the-fold sur les 4 outils ; standardisation des photos de couverture (exclure docs/frames vidéo/stock, exposition, badge photos) + play vidéo restylé/déplacé + prix remonté ; collision « Carte (51) » ; autocomplétion D5 aérée ; formulaire contact allégé + remonté ; recherche globale (loupe header) ; compteur live de filtres.

**Vague 3 — Profondeur fiche & catalogue (large/structurel)**
Champs structurés obligatoires + galerie minimale + compteur 1/N (front + règles admin) ; badge de vérification par bien ; pagination/lazy-load + cartes résultats enrichies (prix/quartier/puces) ; taxonomie du menu par intention ; complétion Wolof ou marquage « Bêta » ; design-system pass absorbant le lot P3.