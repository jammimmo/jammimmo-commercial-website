/**
 * « Mon budget » — lead-magnet pour ACHETEURS / LOCATAIRES (miroir de
 * EstimateTool, qui vise les propriétaires vendeurs).
 *
 * RÈGLE FUNNEL (calibrage non négociable, identique à EstimateTool) : valeur
 * d'abord, demande minimale au pic d'intention.
 *   • AUCUN gate / formulaire AVANT l'outil — l'utilisateur compose librement
 *     son projet (acheter ou louer, budget, zone, type optionnel).
 *   • Toutes les étapes de SAISIE sont gratuites et SANS contact.
 *   • À la fin on affiche un RÉSULTAT honnête tout de suite : « Avec X FCFA en
 *     {achat|location} à {zone}, voici ce qu'on peut viser » + des repères
 *     concrets + l'OFFRE « sélection personnalisée + alertes sur WhatsApp ».
 *     AUCUN chiffre/calcul inventé : pas de fausse « capacité d'emprunt »
 *     (le crédit immo est rare/complexe au Sénégal), pas de prix moyen au m²
 *     inventé. On affiche le budget SAISI par l'utilisateur, jamais un chiffre
 *     fabriqué.
 *   • On renvoie vers les biens RÉELS dans le budget : /biens accepte un filtre
 *     `priceMax` (+ `transaction`, `type`, `q` pour la zone) — voir HeroSearch /
 *     ListingsView. C'est de la VRAIE donnée, pas une estimation.
 *   • PUIS on demande le contact — UN SEUL champ : le WhatsApp (+ prénom
 *     optionnel) pour la sélection personnalisée et les alertes.
 *
 * ISOLATION TIER-3 : île 100 % statique côté runtime. AUCUN import
 * supabase.build, AUCUN secret, AUCUN nouvel endpoint. La capture réutilise
 * l'EXISTANT `POST /api/leads` (D1) — `message` = récap complet du projet — et
 * propose en alternative un deeplink WhatsApp (`SITE.whatsappUrl`) prérempli.
 *
 * Analytics : réutilise UNIQUEMENT l'event déjà allowlisté
 * `lead.form.submitted` (cf. AnalyticsEvent dans src/lib/analytics.ts). Aucun
 * nouveau nom d'event. Les CTA vers /biens et WhatsApp portent `data-track`
 * ramassé globalement par src/lib/click-capture.ts.
 *
 * Conventions design-system : calquées sur EstimateTool / ContactForm /
 * HeroSearch (champs `h-11 rounded-xl`, focus-ring, validation `aria-invalid` +
 * bloc `role="alert"` terra, panneau succès emerald `aria-live`, bouton pill
 * `bg-secondary`). Mobile-first.
 */
import { useMemo, useState } from 'react';
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Home,
  MapPin,
  Wallet,
  Search,
  Sparkles,
  Building2,
} from 'lucide-react';
import { t, type Lang, localizedPath } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { SITE } from '@/lib/site-config';
import { filterPlaces, placeContext } from '@/lib/places';

interface Props {
  lang: Lang;
}

const TRANSACTIONS = ['acheter', 'louer'] as const;
type Transaction = (typeof TRANSACTIONS)[number];

/**
 * Property types — i18n via budget.type.<key>. `biens` is the EXACT capitalized
 * value the /biens `type` filter compares with `===` (cf. ListingsView /
 * HeroSearch TYPES). `key === ''` is the explicit "no preference" choice that
 * keeps the type step optional without leaving the filter set.
 */
const PROPERTY_TYPES = [
  { key: 'appartement', biens: 'Appartement' },
  { key: 'villa', biens: 'Villa' },
  { key: 'maison', biens: 'Maison' },
  { key: 'terrain', biens: 'Terrain' },
  { key: 'bureau', biens: 'Bureau' },
  { key: 'commerce', biens: 'Magasin' },
] as const;
type PropertyTypeKey = (typeof PROPERTY_TYPES)[number]['key'];

/**
 * Phone validation — accepts the Senegalese pattern (shared with ContactForm /
 * EstimateTool / the /api/leads server schema) OR a loose international format,
 * but in BOTH branches we additionally require ≥7 ACTUAL digits so junk like
 * "-------" (which the loose regex alone would accept) is rejected.
 */
const phoneSn = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const phoneLoose = /^\+?[\d\s().-]{7,20}$/;
const isValidPhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7) return false;
  return phoneSn.test(v) || phoneLoose.test(v);
};

/** Thousands-separator formatting for the FCFA money input (display only). */
const digitsOnly = (v: string) => v.replace(/\D/g, '');
const formatMoney = (digits: string) =>
  digits ? Number(digits).toLocaleString('fr-FR').replace(/ /g, ' ') : '';

type StepId = 'transaction' | 'budget' | 'zone' | 'type';
const STEP_ORDER: StepId[] = ['transaction', 'budget', 'zone', 'type'];
const TOTAL_STEPS = STEP_ORDER.length; // stable denominator — always 4

interface FormState {
  transaction: Transaction | '';
  /** Raw digits only (no separators) — the source of truth for the amount. */
  budget: string;
  zone: string;
  type: PropertyTypeKey | '';
}

const INITIAL: FormState = {
  transaction: '',
  budget: '',
  zone: '',
  type: '',
};

export default function BudgetTool({ lang }: Props) {
  // `phase` drives the whole experience: the budget wizard, then the honest
  // result, then the (single-field) contact capture, then the success panel.
  const [phase, setPhase] = useState<'wizard' | 'result' | 'capture' | 'done'>('wizard');
  const [form, setForm] = useState<FormState>(INITIAL);
  const [stepIndex, setStepIndex] = useState(0);

  // Contact capture (shown ONLY after the result — pic d'intention).
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [touchedPhone, setTouchedPhone] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const currentStep = STEP_ORDER[Math.min(stepIndex, TOTAL_STEPS - 1)];
  const isLastStep = stepIndex >= TOTAL_STEPS - 1;
  const progress = Math.round(((stepIndex + 1) / TOTAL_STEPS) * 100);

  const budgetNumber = Number(form.budget) || 0;

  /** Is the current step satisfied enough to advance?
   *  `type` is OPTIONAL — always advanceable (the user can pick or skip). */
  function canAdvance(): boolean {
    switch (currentStep) {
      case 'transaction':
        return !!form.transaction;
      case 'budget':
        // Reject 0/empty; cap at a sane upper bound to avoid junk.
        return budgetNumber > 0 && budgetNumber <= 100_000_000_000;
      case 'zone':
        return form.zone.trim().length >= 2;
      case 'type':
        return true; // optional
      default:
        return false;
    }
  }

  function next() {
    if (!canAdvance()) return;
    if (isLastStep) {
      setPhase('result');
      return;
    }
    setStepIndex((i) => Math.min(i + 1, TOTAL_STEPS - 1));
  }

  function back() {
    if (stepIndex === 0) return;
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Human labels (current lang).
  const typeMeta = PROPERTY_TYPES.find((p) => p.key === form.type);
  const transactionLabel = form.transaction
    ? t(`budget.transaction.noun.${form.transaction}`, lang)
    : '';
  const transactionInline = form.transaction
    ? t(`budget.transaction.inline.${form.transaction}`, lang)
    : '';
  const typeLabel = form.type ? t(`budget.type.${form.type}`, lang) : '';
  const budgetDisplay = formatMoney(form.budget);
  // For a rental the amount is a monthly rent ceiling; for a purchase it's a
  // total budget. The suffix makes the recap honest about which it is.
  const budgetSuffix =
    form.transaction === 'louer' ? t('budget.amount.perMonth', lang) : '';

  /** Full project recap — REUSED as the lead `message` AND the WhatsApp text. */
  const recap = useMemo(() => {
    const lines: string[] = [t('budget.recap.header', lang)];
    lines.push(`- ${t('budget.label.transaction', lang)}: ${transactionLabel}`);
    lines.push(
      `- ${t('budget.label.budget', lang)}: ${budgetDisplay} FCFA${budgetSuffix ? ` ${budgetSuffix}` : ''}`,
    );
    lines.push(`- ${t('budget.label.zone', lang)}: ${form.zone.trim()}`);
    if (typeLabel) {
      lines.push(`- ${t('budget.label.type', lang)}: ${typeLabel}`);
    }
    return lines.join('\n');
  }, [lang, transactionLabel, budgetDisplay, budgetSuffix, form.zone, typeLabel]);

  /** WhatsApp deeplink — greeting + recap, URL-encoded (wa.me ?text=). */
  const waLink = useMemo(() => {
    const msg = `${t('budget.wa.intro', lang)}\n\n${recap}`;
    return `${SITE.whatsappUrl}?text=${encodeURIComponent(msg)}`;
  }, [lang, recap]);

  /**
   * Link to the REAL matching listings. /biens reads its filters from the URL
   * (cf. ListingsView.readFromUrl): `transaction` must be the capitalized noun
   * `Vente`/`Location`, `priceMax` is an integer FCFA, `type` an exact label,
   * and the zone goes into the free-text `q` (no dedicated quartier filter).
   * For a rental we DON'T send priceMax (the rent ceiling isn't a sale price
   * the /biens price filter understands the same way) — transaction + zone +
   * type already narrow it; the agent refines the rest. For a purchase the
   * total budget maps cleanly to priceMax.
   */
  const biensLink = useMemo(() => {
    const params = new URLSearchParams();
    params.set('transaction', form.transaction === 'acheter' ? 'Vente' : 'Location');
    if (form.transaction === 'acheter' && budgetNumber > 0) {
      params.set('priceMax', String(budgetNumber));
    }
    if (typeMeta) params.set('type', typeMeta.biens);
    if (form.zone.trim()) params.set('q', form.zone.trim());
    return `${localizedPath('/biens', lang)}?${params.toString()}`;
  }, [lang, form.transaction, form.zone, budgetNumber, typeMeta]);

  const phoneValid = isValidPhone(phone.trim());

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setTouchedPhone(true);
    if (!phoneValid) return;
    setSubmitState('sending');
    setErrorMsg('');
    try {
      // full_name must be ≥2 chars (server LeadSchema). Use the provided first
      // name, falling back to a stable label so capture never fails on the
      // optional field while staying honest about its origin.
      const fullName = firstName.trim() || t('budget.lead.anonName', lang);
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone: phone.trim(),
          message: recap,
          // No email, no property_id — single-field capture by design.
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setPhase('done');
      // Reuse the EXISTING allowlisted conversion event. `subject` carries the
      // transaction (acheter/louer) — a short non-PII tag accepted by the union.
      // No new event name introduced.
      track({
        name: 'lead.form.submitted',
        props: {
          subject: form.transaction || undefined,
          hasMessage: true,
          fromProperty: false,
        },
      });
      // Force-record this session's replay (every conversion is worth watching).
      void import('@/lib/replay-recorder').then((m) => m.forceReplay()).catch(() => {});
    } catch (err: any) {
      setSubmitState('error');
      setErrorMsg(err?.message ?? 'Unknown error');
    }
  }

  // ─────────────────────────── Success ───────────────────────────
  if (phase === 'done') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-emerald/10 border border-emerald/30 text-emerald rounded-3xl p-8 sm:p-10 text-center"
      >
        <Check className="w-9 h-9 mx-auto mb-3" aria-hidden="true" />
        <p className="font-serif text-2xl mb-2 text-foreground">{t('budget.done.title', lang)}</p>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {t('budget.done.body', lang)}
        </p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          data-track="whatsapp.tapped"
          className="mt-6 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-emerald text-white font-semibold text-sm shadow-lg hover:translate-y-[-1px] transition-transform"
        >
          <WhatsAppIcon />
          {t('budget.done.wa', lang)}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground rounded-3xl shadow-xl p-6 sm:p-9">
      {/* Header — eyebrow + title + subtitle (same on every phase). */}
      <div className="mb-6">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary-strong mb-2">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          {t('budget.eyebrow', lang)}
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl leading-tight">{t('budget.title', lang)}</h2>
        <p className="text-muted-foreground text-sm mt-1.5">{t('budget.subtitle', lang)}</p>
      </div>

      {/* ─────────────────────────── Wizard ─────────────────────────── */}
      {phase === 'wizard' && (
        <>
          {/* Progress bar — free, no contact gate. */}
          <div className="mb-6" aria-hidden="true">
            <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              <span>
                {t('budget.step', lang)} {stepIndex + 1}/{TOTAL_STEPS}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-secondary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="min-h-[260px]">
            {/* (a) Acheter ou louer */}
            {currentStep === 'transaction' && (
              <Fieldset
                icon={<Home className="w-5 h-5" />}
                legend={t('budget.q.transaction', lang)}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  {TRANSACTIONS.map((tr) => (
                    <ChoiceButton
                      key={tr}
                      selected={form.transaction === tr}
                      onClick={() => update('transaction', tr)}
                    >
                      {t(`budget.transaction.${tr}`, lang)}
                    </ChoiceButton>
                  ))}
                </div>
              </Fieldset>
            )}

            {/* (b) Budget — FCFA money input with thousands separators. The
                question + hint adapt to rent (monthly ceiling) vs purchase
                (total budget). */}
            {currentStep === 'budget' && (
              <Fieldset
                icon={<Wallet className="w-5 h-5" />}
                legend={t(
                  form.transaction === 'louer' ? 'budget.q.budget.louer' : 'budget.q.budget.acheter',
                  lang,
                )}
              >
                <div className="relative">
                  <input
                    id="bud-amount"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={budgetDisplay}
                    onChange={(e) => update('budget', digitsOnly(e.target.value))}
                    placeholder={form.transaction === 'louer' ? '350 000' : '50 000 000'}
                    aria-describedby="bud-amount-suffix"
                    className="w-full h-11 pl-3.5 pr-20 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span
                    id="bud-amount-suffix"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm"
                  >
                    FCFA{form.transaction === 'louer' ? ` ${t('budget.amount.perMonth', lang)}` : ''}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs mt-2">
                  {t(
                    form.transaction === 'louer' ? 'budget.hint.budget.louer' : 'budget.hint.budget.acheter',
                    lang,
                  )}
                </p>
              </Fieldset>
            )}

            {/* (c) Zone / quartier — nationwide autocomplete (communes +
                quartiers, all 14 regions). Non-blocking: free text accepted. */}
            {currentStep === 'zone' && (
              <Fieldset icon={<MapPin className="w-5 h-5" />} legend={t('budget.q.zone', lang)}>
                <input
                  id="bud-zone"
                  type="text"
                  list="bud-zone-list"
                  autoComplete="off"
                  value={form.zone}
                  onChange={(e) => update('zone', e.target.value)}
                  placeholder={t('budget.placeholder.zone', lang)}
                  className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="bud-zone-list">
                  {filterPlaces(form.zone, 50).map((p) => (
                    // Names collide nationally (~57 dupes) → key on name|commune,
                    // and show "commune, region" to disambiguate.
                    <option key={`${p.name}|${p.commune}`} value={p.name}>
                      {placeContext(p)}
                    </option>
                  ))}
                </datalist>
                <p className="text-muted-foreground text-xs mt-2">{t('budget.hint.zone', lang)}</p>
              </Fieldset>
            )}

            {/* (d) Type de bien — OPTIONAL. A "no preference" pill lets the user
                skip without leaving the step in an invalid state. */}
            {currentStep === 'type' && (
              <Fieldset
                icon={<Building2 className="w-5 h-5" />}
                legend={t('budget.q.type', lang)}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <ChoiceButton selected={form.type === ''} onClick={() => update('type', '')}>
                    {t('budget.type.any', lang)}
                  </ChoiceButton>
                  {PROPERTY_TYPES.map((p) => (
                    <ChoiceButton
                      key={p.key}
                      selected={form.type === p.key}
                      onClick={() => update('type', p.key)}
                    >
                      {t(`budget.type.${p.key}`, lang)}
                    </ChoiceButton>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs mt-2">{t('budget.hint.type', lang)}</p>
              </Fieldset>
            )}
          </div>

          {/* Nav buttons */}
          <div className="mt-7 flex items-center gap-3">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-full border border-input bg-card text-foreground font-semibold text-[15px] hover:bg-muted transition"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('budget.back', lang)}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance()}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg disabled:opacity-50 hover:translate-y-[-1px] transition-transform"
            >
              {isLastStep ? t('budget.seeResult', lang) : t('budget.next', lang)}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* ─────────────────────────── Result (honest) ─────────────────────────── */}
      {phase === 'result' && (
        <div>
          {/* Personalized recap — « Avec X FCFA en {achat|location} à {zone}… » */}
          <div className="rounded-2xl border border-clay bg-card p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary-strong mb-1.5">
              {t('budget.result.eyebrow', lang)}
            </p>
            <p className="font-serif text-xl sm:text-2xl leading-snug">
              {t('budget.result.recapPrefix', lang)}{' '}
              <strong className="text-primary">
                {budgetDisplay} FCFA{budgetSuffix ? ` ${budgetSuffix}` : ''}
              </strong>{' '}
              {t('budget.result.recapIn', lang)}{' '}
              <strong className="text-primary">{transactionInline}</strong>{' '}
              {t('budget.result.recapAt', lang)}{' '}
              <strong className="text-primary">{form.zone.trim()}</strong>
              {t('budget.result.recapSuffix', lang)}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
              <Detail label={t('budget.label.transaction', lang)} value={transactionLabel} />
              <Detail
                label={t('budget.label.budget', lang)}
                value={`${budgetDisplay} FCFA${budgetSuffix ? ` ${budgetSuffix}` : ''}`}
              />
              <Detail label={t('budget.label.zone', lang)} value={form.zone.trim()} />
              {typeLabel && <Detail label={t('budget.label.type', lang)} value={typeLabel} />}
            </dl>
          </div>

          {/* 3 honest pointers — no invented number, no fake borrowing capacity. */}
          <div className="mt-5">
            <p className="text-sm font-semibold mb-2.5">{t('budget.result.pointsTitle', lang)}</p>
            <ul className="space-y-2.5">
              {['1', '2', '3'].map((n) => (
                <li key={n} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-secondary/15 text-secondary-strong grid place-items-center">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span>{t(`budget.result.point.${n}`, lang)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* PRIMARY CTA — real listings within the budget (/biens filter). */}
          <a
            href={biensLink}
            data-track="budget.seeListings"
            className="mt-6 w-full inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg hover:translate-y-[-1px] transition-transform"
          >
            <Search className="w-4 h-4" />
            {t('budget.result.seeListings', lang)}
          </a>

          {/* The OFFER — personalized shortlist + WhatsApp alerts. */}
          <div className="mt-6 rounded-2xl border border-secondary/30 bg-secondary/5 p-5">
            <p className="font-serif text-lg leading-snug">{t('budget.result.offerTitle', lang)}</p>
            <p className="text-muted-foreground text-sm mt-1.5">
              {t('budget.result.offerBody', lang)}
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setPhase('capture')}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-primary text-primary-foreground font-semibold text-[15px] shadow-lg hover:translate-y-[-1px] transition-transform"
            >
              {t('budget.result.cta', lang)}
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('wizard');
                setStepIndex(0);
              }}
              className="inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-full border border-input bg-card text-foreground font-semibold text-[15px] hover:bg-muted transition"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('budget.result.edit', lang)}
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────── Capture (single field) ─────────────────────────── */}
      {phase === 'capture' && (
        <form onSubmit={submitLead} noValidate>
          <div className="rounded-2xl border border-clay bg-card p-5 mb-5">
            <p className="text-sm font-semibold mb-1">{t('budget.capture.title', lang)}</p>
            <p className="text-muted-foreground text-sm">{t('budget.capture.body', lang)}</p>
          </div>

          {/* Prénom — OPTIONAL */}
          <div className="mb-3.5">
            <label
              htmlFor="bud-firstname"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('budget.capture.firstName', lang)}
            </label>
            <input
              id="bud-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              placeholder="Aïcha"
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* WhatsApp — THE single required field */}
          <div className="mb-1">
            <label
              htmlFor="bud-phone"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('budget.capture.whatsapp', lang)}
            </label>
            <input
              id="bud-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouchedPhone(true)}
              autoComplete="tel"
              placeholder="+221 77 ..."
              required
              aria-invalid={touchedPhone && !phoneValid}
              aria-describedby={touchedPhone && !phoneValid ? 'bud-phone-err' : undefined}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
            />
            {touchedPhone && !phoneValid && (
              <p id="bud-phone-err" role="alert" className="text-terra text-xs mt-1">
                {t('form.validation.phone', lang)}
              </p>
            )}
          </div>

          {submitState === 'error' && (
            <p role="alert" aria-live="assertive" className="mt-3 text-terra text-sm">
              {t('form.error', lang)}
              {errorMsg && <span className="block opacity-60 text-xs mt-0.5">{errorMsg}</span>}
            </p>
          )}

          <button
            type="submit"
            disabled={submitState === 'sending'}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg disabled:opacity-50 hover:translate-y-[-1px] transition-transform"
          >
            {submitState === 'sending' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                ...
              </>
            ) : (
              <>
                {t('budget.capture.submit', lang)}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Alternative — prefilled WhatsApp deeplink. */}
          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-clay" aria-hidden="true" />
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              {t('budget.capture.or', lang)}
            </span>
            <span className="h-px flex-1 bg-clay" aria-hidden="true" />
          </div>
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            data-track="whatsapp.tapped"
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full border border-emerald/40 bg-emerald/10 text-emerald font-semibold text-[15px] hover:bg-emerald/15 transition"
          >
            <WhatsAppIcon />
            {t('budget.capture.wa', lang)}
          </a>

          <button
            type="button"
            onClick={() => setPhase('result')}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-muted-foreground text-sm hover:text-foreground transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('budget.capture.back', lang)}
          </button>
        </form>
      )}
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function Fieldset({
  icon,
  legend,
  children,
}: {
  icon: React.ReactNode;
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="flex items-center gap-2.5 font-serif text-xl mb-4">
        <span className="w-9 h-9 rounded-xl bg-accent text-primary grid place-items-center shrink-0">
          {icon}
        </span>
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        'h-11 px-3 rounded-xl border text-sm font-medium transition ' +
        (selected
          ? 'border-secondary bg-secondary/10 text-secondary-strong shadow-sm'
          : 'border-input bg-card text-foreground hover:border-secondary/50')
      }
    >
      {children}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground font-medium">{value}</dd>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2zm5.6 14.2c-.2.6-1.3 1.2-1.8 1.3-.5.1-1.1.1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.7-4-4.8-4.2-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5.2.5.7 1.7.7 1.8.1.1.1.3 0 .5l-.3.4-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.8 2.1 1.2 1.1 2.2 1.4 2.5 1.5.3.1.5.1.7-.1.2-.2.7-.9 1-1.2.2-.3.4-.2.7-.1.3.1 1.7.8 2 1 .3.1.5.2.6.3.1.2.1.7-.1 1.4z" />
    </svg>
  );
}
