# Vitrine — Funnel & Tools upgrade (2026-06-23)

Goal (user, autonomous run): finish/polish features, add attractivity tools (estimation-grade)
+ a real conversion funnel, full test coverage (unit + e2e + security) with visual validation on
mobile **and** desktop, multi-agent review, redo until clean.

The user explicitly overrode the brainstorming skill's "ask for approval" gate ("full autonomy,
ne t'arrête pas, arrête de me demander les choses évidentes"). So: design thinking + spec + TDD +
verification + review are kept; the interactive approval blocking is skipped per user instruction
(highest priority).

## Current state (audited)

- Tools already live: `/estimation`, `/budget`, `/securite-fonciere` (safety), `/trouver-mon-bien`
  (match), `/comparer`, `/favoris`. Each tool page has **6 byte-identical locale copies**
  (FR root + en/es/it/wo/ar); `getLang()` derives language from the URL prefix.
- Lead path: all tools → `POST /api/leads` (Zod-validated, rate-limited, CORS-locked) + WhatsApp
  deeplink. Analytics is a strict **allowlist** in `src/lib/analytics.ts`.
- **Estimation** is currently a pure lead form with **no price output** (deliberate "no invented
  price/m² grid" honesty stance).
- **Dead-ends**: `/comparer` and `/favoris` have no contact CTA.
- **Discoverability gap**: tools are only in nav/footer, not surfaced on the home page.
- **No unit-test framework** (only Playwright e2e [prod] + visual [local dev]). Vitest now added.
- **Security**: `PUBLIC_COLUMNS` (build reader) over-selected sensitive admin columns
  (`negotiable_price`, `commission_amount`, …) that `maskRow` already drops — trimmed so estate-flow
  can REVOKE them from the `anon` role. Cross-repo coordination logged in SHARED-STATE.

## Design decisions

### 1. Security (done first, zero visible impact)
Trim `PUBLIC_COLUMNS` to exactly the columns `maskRow` projects. Add automated guards:
no sensitive field names in rendered HTML, security headers present, analytics allowlist enforced.

### 2. Unit-test foundation (Vitest 2, Vite-5 compatible)
Extract deterministic logic out of the React islands into pure, testable modules and cover them:
- `src/lib/safety-score.ts` — risk scorer extracted from `SafetyTool` (level vert/orange/rouge).
- `src/lib/budget-link.ts` — form→`/biens` filter-URL builder extracted from `BudgetTool`.
- `src/lib/match-filter.ts` — catalogue filter+score+top-N extracted from `MatchTool`.
- `src/lib/estimate-comps.ts` — **new** comparable-listings price-range engine (see §3).
- Plus existing pure libs: `format`, `reference`, `compare`, `favorites`, `places`, `status`,
  `youtube`.
Islands then import the extracted modules (behavior-preserving refactor).

### 3. Estimation upgrade — data-backed, still honest (flagship attractivity)
`estimateComps(catalogue, input)` returns, from the **real frozen Jamm catalogue** (same data the
match tool already uses), the set of comparable listings (same type + transaction, same/near
quartier or city, surface within a band) and a **price range** (low/median/high) + price-per-m²
band. This is NOT an invented grid — it's "voici la fourchette des biens comparables **réellement
chez Jamm** à {quartier} ({n} biens)". When too few comps exist, it transparently widens (quartier →
city → type only) and labels the basis; if still none, it shows no number and keeps the existing
honest "expert valuation under 24h" offer. The result always cross-sells to `/biens` filtered and to
the human-valuation lead capture. Pure + unit-tested.

### 4. Funnel continuity
- `/comparer` and `/favoris`: add a "be called back about these N properties" CTA that opens
  WhatsApp/contact with the selected refs prefilled + fires an allowlisted lead event.
- Home: add a compact **"Outils gratuits"** showcase section linking the 4 tools (discoverability).
- Keep every tool result ending in a concrete next step (listings or contact).

### 5. New investor tool — Rental-yield calculator (`/rentabilite`)
Honest deterministic math: price, monthly rent, charges/taxes → gross & net yield + payback years.
New page (6 locales), React island, pure `src/lib/yield-calc.ts` + tests, `/api/leads` capture with
a new allowlisted `subject:'rentabilite'`, cross-sell to real listings. Surfaced in nav/footer/home.

### 6. Testing & validation
- Unit: `vitest run` green.
- Build: `astro build` clean; `astro check` at/under baseline.
- Visual: Playwright `iphone-12` + `desktop-chromium` snapshots for every changed/new page
  (mobile-first gate), baselines updated deliberately.
- e2e: prod-style specs for new/changed features, run against the CF branch preview, then prod.
- Security guards as in §1.

### 7. Multi-agent review
Workflow fan-out: desktop-UX, mobile-UX, conversion/funnel, security, i18n/RTL, a11y, code-quality
reviewers over the diff; adversarially verify; redo anything confirmed real; iterate until clean.

## Isolation / cross-repo
All changes are vitrine-only and Tier-3 isolated (build-time data, no new runtime endpoint/secret).
The only cross-repo touchpoint is the `PUBLIC_COLUMNS` trim, which UNBLOCKS estate-flow's anon
REVOKE — logged in SHARED-STATE, no payload/endpoint/schema change.

## Out of scope (YAGNI)
No accounts/auth, no server-side estimation model, no CMS, no new analytics endpoint. New events
reuse the existing `lead.form.submitted` shape (+ the one new `subject` value).
