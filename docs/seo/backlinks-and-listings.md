# Jamm Immobilier — Backlinks & listings playbook (free / freemium)

> Curated from the 2026-06-24 multi-agent SEO/GEO audit. Every item below is **free or has a free tier**. Most require **manual action by the owner** (claiming a profile, verifying premises) — those are flagged `OWNER`. A few are `DEV` (done in the codebase). No spam / link-farm tactics.
>
> **Golden rule — NAP consistency.** Use the *exact* same Name / Address / Phone everywhere, or the citations stop reinforcing each other. Copy-paste this block:
>
> ```
> Name:    Jamm Immobilier
> Address: RC 24, Sacré-Cœur 3, Dakar, Sénégal
> Phone:   +221 76 944 48 49   (also WhatsApp)
> Email:   contact@jammimmo.com
> Site:    https://jammimmo.com
> Hours:   Lun–Ven 9h–18h, Sam 9h–13h
> Geo pin: 14.7237, -17.468
> Category: Real estate agency / Agence immobilière
> ```

## Do this first (highest ROI)

| # | Service | Why | Effort | Action |
|---|---------|-----|--------|--------|
| 1 | **Google Business Profile** — business.google.com | The single most important local-SEO asset; powers Maps + the branded Knowledge Panel + "agence immobilière Dakar" packs. Dofollow website link. | M | `OWNER`. Create/claim with the exact NAP. Senegal verification is usually **video** (film the street, the RC 24 signage, the interior, your documents) — postcard mail to Dakar is unreliable. Then add photos, services, the site link. |
| 2 | **Facebook Page** — facebook.com/jammimmo | Dominant discovery channel in Senegal. Already in `site-config` + JSON-LD `sameAs` — **it must actually exist** for that entity link to resolve. | S | `OWNER`. Create the Page with NAP, hours, site, WhatsApp button. Post listings. |
| 3 | **LinkedIn Company Page** — linkedin.com/company/jammimmo | High-authority brand/entity signal; strengthens the JSON-LD `sameAs` graph. Already referenced in `site-config`. | S | `OWNER`. Create the Company Page (logo, About FR/EN, Dakar, site, industry Real Estate). |
| 4 | **Instagram Business** — instagram.com/jammimmo | Already in `site-config`. Pairs with the portrait property videos the site already produces. | S | `OWNER`. Convert to Business, site link in bio, post photos/Reels. |
| 5 | **Apple Business Connect** — businessconnect.apple.com | Free; feeds Apple Maps / Siri / Spotlight — relevant for the iPhone-heavy France/US/Italy diaspora this 6-lang site targets. | M | `OWNER`. Create the brand + location (same NAP + pin + hours + site). |
| 6 | **OpenStreetMap POI** — openstreetmap.org | The site's own map is built on OSM, so being *in* OSM improves the site too. Strong NAP citation that cascades into Nominatim + many apps. | S | `OWNER/DEV`. Add a node at the pin with `office=estate_agent`, `name`, `phone`, `website`, `opening_hours`. Map only the real premises; don't edit from a datacenter IP. |

## Real-estate portals (in-market traffic + brand citations)

Post real listings, each linking back to the matching `/biens/<ref>` page. Even where outbound links are `nofollow`, these drive qualified Dakar/diaspora traffic and reinforce the brand.

| Service | Note |
|---------|------|
| **Expat-Dakar** — expat-dakar.com | `OWNER`. #1 Senegal classifieds/real-estate (~81K visits/mo), free listings. Create a pro/agency account. Highest in-market referral. |
| **CoinAfrique** — sn.coinafrique.com/categorie/immobilier | `OWNER`. #2 platform (~36K/mo), strong mobile app, pan-African. Free pro account. |
| **KEUR-IMMO** — keur-immo.com | `OWNER`. Francophone-Africa portal with a dedicated **"agences immobilières au Sénégal" directory** — niche-relevant agency-profile backlink. Register an agency profile. Free tier exists. |
| **Realigro (Senegal)** — senegal.realigro.com | `OWNER`. International multilingual portal with a free tier — fits the 6-language diaspora targeting. |
| **Properstar** — properstar.co.uk/senegal/real-estate-agents | `OWNER`. Global agent index with a "Senegal real estate agents" section. Apply to be listed. |

## Senegal / Africa business directories (NAP citations)

Batch these — each is a low-effort NAP citation. Use the exact block above.

| Service | Note |
|---------|------|
| **GoAfrica / Pages Jaunes du Sénégal** — goafricaonline.com | `OWNER`. Pan-African yellow-pages, high regional authority. Free listing, immobilier category. |
| **Annuaire-Senegal.com** | `OWNER`. Established SN directory (7,500+ listings), free submission. |
| **SenPages** — senpages.com/inscription | `OWNER`. Senegalese Pages Jaunes, explicit free registration, "Entreprise Immobilier" category. |
| **Expat.com (Senegal directory)** — expat.com → Senegal → real-estate-agencies | `OWNER`. On-topic for the diaspora/expat audience; "Add your business". |
| **Yelu Senegal** — yelu.sn | `OWNER`. Extra local citation; low standalone value, batch it. |
| **Cybo / Cylex Senegal** — fr.cybo.com/senegal | `OWNER`. Claim the auto-generated entry to control the NAP. |
| **B2BMap Senegal** — b2bmap.com/senegal | `OWNER`. Easy international citation; skip if time-constrained. |

## Knowledge bases (entity authority for GEO + Knowledge Graph)

| Service | Note |
|---------|------|
| **Wikidata item** — wikidata.org | `OWNER/DEV`. Google + LLMs ingest Wikidata for the Knowledge Graph and AI answers. Create an item: `instance of` = real estate agency, `country` = Senegal, `located in` = Dakar, `coordinate location` = pin, `official website` = jammimmo.com. **Caution:** Wikidata notability needs serious public references — back it with the GBP/Apple listing + a press mention or it risks deletion. |
| **Bing Places** — bingplaces.com | `OWNER`. After GBP exists, use Bing's one-click "Import from Google Business Profile". Powers Bing + Copilot answers. (Skip if Senegal isn't selectable.) |

## Social — also add to `site-config` `sameAs` once live

`YouTube` (@jammimmo — already in config; upload the portrait property videos) · `TikTok` (@jammimmo — config slot is empty; claim + repurpose videos). Both `nofollow` but cheap brand reach + entity `sameAs` signals. **After claiming any new profile, confirm its exact URL is in `src/lib/site-config.ts` `socials` so it flows into the JSON-LD `sameAs` array.**

## Installable packages (DEV — evaluated)

| Package | Verdict |
|---------|---------|
| **schema-dts** (npm) | ✅ Recommended. Google's TypeScript types for JSON-LD — compile-time safety so the RealEstateAgent/Listing/Offer graphs can't silently drift (it would have caught the `inLanguage` 3-of-6-langs bug). Dev-dependency, zero runtime cost. |
| **@astrojs/sitemap** | ⚠️ Evaluate, don't blindly adopt. The hand-rolled `sitemap.xml.ts` already handles trailing-slash + 6-lang hreflang correctly and is more controllable. Only switch if it starts drifting. |
| **astro-seo** (npm) | ❌ Skip. The site already has a mature hand-built `SeoTags.astro` + JSON-LD components; this would duplicate and reduce control. |

---
*Tip: after claiming GBP, refine `SITE.geo` in `src/lib/site-config.ts` to match the verified GBP pin so the on-site `RealEstateAgent` `GeoCoordinates` and the map agree exactly.*
