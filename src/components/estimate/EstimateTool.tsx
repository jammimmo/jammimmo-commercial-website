/**
 * « Estimation express » — lead-magnet pour CAPTER DES MANDATS (propriétaires
 * vendeurs / bailleurs).
 *
 * RÈGLE FUNNEL (calibrage non négociable) : valeur d'abord, demande minimale au
 * pic d'intention.
 *   • AUCUN gate / formulaire AVANT l'outil — l'utilisateur compose son bien
 *     librement (type, transaction, quartier, surface, chambres, état).
 *   • Toutes les étapes de SAISIE sont gratuites et SANS contact.
 *   • À la fin on affiche un RÉSULTAT honnête tout de suite : récap
 *     « Votre {type} à {quartier} » + 3 facteurs de valorisation + l'OFFRE
 *     « estimation chiffrée GRATUITE par un expert Jamm sous 24h ».
 *     Pas de prix chiffré inventé (il n'existe pas de grille prix/m²).
 *   • PUIS on demande le contact — UN SEUL champ : le WhatsApp (+ prénom
 *     optionnel). Jamais email+tel+budget+pièce.
 *
 * ISOLATION TIER-3 : île 100 % statique côté runtime. AUCUN import
 * supabase.build, AUCUN secret, AUCUN nouvel endpoint. La capture réutilise
 * l'EXISTANT `POST /api/leads` (D1) — `message` = récap complet du bien — et
 * propose en alternative un deeplink WhatsApp (`SITE.whatsappUrl`) prérempli
 * avec ce même récap.
 *
 * Analytics : réutilise UNIQUEMENT l'event déjà allowlisté
 * `lead.form.submitted` (cf. AnalyticsEvent dans src/lib/analytics.ts) — c'est
 * sémantiquement juste (un lead a été soumis). Aucun nouveau nom d'event.
 *
 * Conventions design-system : imite ContactForm.tsx / HeroSearch.tsx
 * (champs `h-11`, `rounded-xl`, focus-ring, validation `aria-invalid` + bloc
 * `role="alert"` terra, panneau succès emerald `aria-live`, bouton pill
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
  Ruler,
  BedDouble,
  Sparkles,
} from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { SITE } from '@/lib/site-config';
import PlaceAutocomplete from '@/components/places/PlaceAutocomplete';
import { formatFCFA } from '@/lib/format';
import { buildBiensLink } from '@/lib/biens-filter';
import { estimateComps } from '@/lib/estimate-comps';
import type { PublicProperty } from '@/types/property';

interface Props {
  lang: Lang;
  /**
   * Real catalogue frozen at build (same source MatchTool uses) — powers the
   * comparable-listings price range. OPTIONAL: when absent (or no comparable
   * listing exists) the tool degrades to its original honest, no-number result.
   */
  properties?: PublicProperty[];
  hrefByRef?: Record<string, string>;
}

/**
 * Property types — i18n via estate.type.<key>.
 *   • `rooms`     gates the bedrooms step (residential only).
 *   • `condition` gates the condition/standing step — bare LAND has no
 *     "new / good / to renovate", so it's skipped there.
 */
const PROPERTY_TYPES = [
  { key: 'appartement', rooms: true, condition: true },
  { key: 'maison', rooms: true, condition: true },
  { key: 'villa', rooms: true, condition: true },
  { key: 'terrain', rooms: false, condition: false },
  { key: 'bureau', rooms: false, condition: true },
  { key: 'commerce', rooms: false, condition: true },
  { key: 'immeuble', rooms: false, condition: true },
] as const;
type PropertyTypeKey = (typeof PROPERTY_TYPES)[number]['key'];

/** Map an estimation type key → the capitalized DB `type` value used across the
 *  catalogue and the /biens `type` filter. Mirrors MatchTool/BudgetTool. */
const TYPE_BIENS: Record<PropertyTypeKey, string> = {
  appartement: 'Appartement',
  maison: 'Maison',
  villa: 'Villa',
  terrain: 'Terrain',
  bureau: 'Bureau',
  commerce: 'Magasin',
  immeuble: 'Immeuble',
};

const TRANSACTIONS = ['vente', 'location'] as const;
type Transaction = (typeof TRANSACTIONS)[number];

const CONDITIONS = ['neuf', 'bon', 'renover'] as const;
type Condition = (typeof CONDITIONS)[number];

/**
 * Phone validation — accepts the Senegalese pattern (shared with ContactForm /
 * the /api/leads server schema) OR a loose international format, but in BOTH
 * branches we additionally require ≥7 ACTUAL digits so junk like "-------" or
 * "((((((((" (which the loose regex alone would accept) is rejected.
 */
const phoneSn = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const phoneLoose = /^\+?[\d\s().-]{7,20}$/;
const isValidPhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7) return false;
  return phoneSn.test(v) || phoneLoose.test(v);
};

type StepId = 'type' | 'transaction' | 'quartier' | 'surface' | 'rooms' | 'condition';

interface FormState {
  type: PropertyTypeKey | '';
  transaction: Transaction | '';
  quartier: string;
  surface: string;
  rooms: string;
  condition: Condition | '';
}

const INITIAL: FormState = {
  type: '',
  transaction: '',
  quartier: '',
  surface: '',
  rooms: '',
  condition: '',
};

export default function EstimateTool({ lang, properties = [], hrefByRef = {} }: Props) {
  // `phase` drives the whole experience: the property wizard, then the honest
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

  // Steps depend on the chosen type: bedrooms only for residential, and the
  // condition/standing step only for built property (skipped for bare land).
  const typeMeta = PROPERTY_TYPES.find((p) => p.key === form.type);
  const steps = useMemo<StepId[]>(() => {
    const base: StepId[] = ['type', 'transaction', 'quartier', 'surface'];
    if (typeMeta?.rooms) base.push('rooms');
    // Default to showing `condition` until a type is chosen (the most common
    // branch), then drop it for types where it makes no sense (bare land).
    if (!typeMeta || typeMeta.condition) base.push('condition');
    return base;
  }, [typeMeta]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;
  // Stable denominator: before a type is chosen, advertise the LONGEST possible
  // flow (residential = 6 steps) so the "Step X/N" counter and progress bar
  // never jump backwards (e.g. 1/5 → 1/6) when the user picks a residential type.
  const MAX_STEPS = 6;
  const totalSteps = form.type ? steps.length : MAX_STEPS;
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);

  /** Is the current step satisfied enough to advance? */
  function canAdvance(): boolean {
    switch (currentStep) {
      case 'type':
        return !!form.type;
      case 'transaction':
        return !!form.transaction;
      case 'quartier':
        return form.quartier.trim().length >= 2;
      case 'surface': {
        const n = Number(form.surface);
        // Reject 0, negative, empty and absurd values; cap at a sane upper bound.
        return Number.isFinite(n) && n > 0 && n <= 100000;
      }
      case 'rooms':
        return form.rooms !== '';
      case 'condition':
        return !!form.condition;
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
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function back() {
    if (stepIndex === 0) return;
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Human label for the chosen type / transaction / condition (current lang).
   *  Transaction uses the NOUN form ("Vente" / "Location") here — it's shown as
   *  a value under the "Projet" label (recap, result, lead, WhatsApp), where the
   *  verb form ("Vendre") used on the wizard buttons would read awkwardly. */
  const typeLabel = form.type ? t(`estimate.type.${form.type}`, lang) : '';
  // Inline form for the « Votre {type} à … » sentence. Lowercased ONLY for FR/EN
  // (mid-sentence common-noun convention); Wolof keeps its original casing.
  const typeLabelInline = lang === 'wo' ? typeLabel : typeLabel.toLowerCase();
  const transactionLabel = form.transaction
    ? t(`estimate.transaction.noun.${form.transaction}`, lang)
    : '';
  // Only surface a condition when the type actually has that step — guards
  // against a stale value lingering if the user picks a residential type, sets
  // a condition, then switches to land (where the step is skipped).
  const conditionLabel =
    typeMeta?.condition && form.condition ? t(`estimate.condition.${form.condition}`, lang) : '';

  /** Full property recap — REUSED as the lead `message` AND the WhatsApp text. */
  const recap = useMemo(() => {
    const lines: string[] = [t('estimate.recap.header', lang)];
    lines.push(`- ${t('estimate.label.type', lang)}: ${typeLabel}`);
    lines.push(`- ${t('estimate.label.transaction', lang)}: ${transactionLabel}`);
    lines.push(`- ${t('estimate.label.quartier', lang)}: ${form.quartier.trim()}`);
    lines.push(`- ${t('estimate.label.surface', lang)}: ${form.surface} m²`);
    if (typeMeta?.rooms && form.rooms !== '') {
      lines.push(`- ${t('estimate.label.rooms', lang)}: ${form.rooms}`);
    }
    if (conditionLabel) {
      lines.push(`- ${t('estimate.label.condition', lang)}: ${conditionLabel}`);
    }
    return lines.join('\n');
  }, [
    lang,
    typeLabel,
    transactionLabel,
    conditionLabel,
    form.quartier,
    form.surface,
    form.rooms,
    typeMeta,
  ]);

  /** WhatsApp deeplink — greeting + recap, URL-encoded (wa.me ?text=). */
  const waLink = useMemo(() => {
    const msg = `${t('estimate.wa.intro', lang)}\n\n${recap}`;
    return `${SITE.whatsappUrl}?text=${encodeURIComponent(msg)}`;
  }, [lang, recap]);

  /**
   * Comparable-listings price range from the REAL Jamm catalogue (frozen at
   * build). Honest: same type + transaction, same quartier when enough comps
   * exist, else widened to all listings of that type (labelled via `basis`).
   * `basis: 'none'` (no comparable listing) → no number, and the result keeps
   * its original honest "free expert valuation" shape.
   */
  const comps = useMemo(() => {
    if (!form.type || !form.transaction || properties.length === 0) return null;
    return estimateComps(properties, {
      typeBiens: TYPE_BIENS[form.type],
      transaction: form.transaction,
      quartier: form.quartier,
      surface: Number(form.surface) || 0,
    });
  }, [properties, form.type, form.transaction, form.quartier, form.surface]);

  /** Cross-sell: the filtered /biens listing for these comparables. */
  const compsBiensLink = useMemo(
    () =>
      buildBiensLink(
        {
          transaction:
            form.transaction === 'vente' ? 'acheter' : form.transaction === 'location' ? 'louer' : '',
          typeBiens: form.type ? TYPE_BIENS[form.type] : undefined,
          zone: form.quartier,
        },
        lang,
      ),
    [lang, form.transaction, form.type, form.quartier],
  );

  /** Monthly suffix appended to rental amounts (vente shows the bare total). */
  const priceSuffix = form.transaction === 'location' ? ` ${t('estimate.comps.perMonth', lang)}` : '';

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
      const fullName = firstName.trim() || t('estimate.lead.anonName', lang);
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
      // transaction (vente/location) — a short non-PII tag already accepted by
      // the union. No new event name introduced.
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
        <p className="font-serif text-2xl mb-2 text-foreground">{t('estimate.done.title', lang)}</p>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {t('estimate.done.body', lang)}
        </p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          data-track="whatsapp.tapped"
          className="mt-6 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-emerald text-white font-semibold text-sm shadow-lg hover:translate-y-[-1px] transition-transform"
        >
          <WhatsAppIcon />
          {t('estimate.done.wa', lang)}
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
          {t('estimate.eyebrow', lang)}
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl leading-tight">{t('estimate.title', lang)}</h2>
        <p className="text-muted-foreground text-sm mt-1.5">{t('estimate.subtitle', lang)}</p>
      </div>

      {/* ─────────────────────────── Wizard ─────────────────────────── */}
      {phase === 'wizard' && (
        <>
          {/* Progress bar — free, no contact gate. */}
          <div className="mb-6" aria-hidden="true">
            <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              <span>
                {t('estimate.step', lang)} {stepIndex + 1}/{totalSteps}
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
            {/* (a) Type de bien */}
            {currentStep === 'type' && (
              <Fieldset
                icon={<Home className="w-5 h-5" />}
                legend={t('estimate.q.type', lang)}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  {PROPERTY_TYPES.map((p) => (
                    <ChoiceButton
                      key={p.key}
                      selected={form.type === p.key}
                      onClick={() => update('type', p.key)}
                    >
                      {t(`estimate.type.${p.key}`, lang)}
                    </ChoiceButton>
                  ))}
                </div>
              </Fieldset>
            )}

            {/* (b) Vente ou location */}
            {currentStep === 'transaction' && (
              <Fieldset
                icon={<ArrowRight className="w-5 h-5" />}
                legend={t('estimate.q.transaction', lang)}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  {TRANSACTIONS.map((tr) => (
                    <ChoiceButton
                      key={tr}
                      selected={form.transaction === tr}
                      onClick={() => update('transaction', tr)}
                    >
                      {t(`estimate.transaction.${tr}`, lang)}
                    </ChoiceButton>
                  ))}
                </div>
              </Fieldset>
            )}

            {/* (c) Quartier — nationwide autocomplete (communes + quartiers,
                all 14 regions). Non-blocking: free text is still accepted. */}
            {currentStep === 'quartier' && (
              <Fieldset
                icon={<MapPin className="w-5 h-5" />}
                legend={t('estimate.q.quartier', lang)}
              >
                <PlaceAutocomplete
                  id="est-quartier"
                  value={form.quartier}
                  onChange={(v) => update('quartier', v)}
                  placeholder={t('estimate.placeholder.quartier', lang)}
                  ariaLabel={t('estimate.q.quartier', lang)}
                />
                <p className="text-muted-foreground text-xs mt-2">
                  {t('estimate.hint.quartier', lang)}
                </p>
              </Fieldset>
            )}

            {/* (d) Surface m² — for bare land, ask for the PLOT area instead. */}
            {currentStep === 'surface' && (
              <Fieldset
                icon={<Ruler className="w-5 h-5" />}
                legend={t(
                  form.type === 'terrain' ? 'estimate.q.surface.terrain' : 'estimate.q.surface',
                  lang,
                )}
              >
                <div className="relative">
                  <input
                    id="est-surface"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    step={1}
                    value={form.surface}
                    onChange={(e) => update('surface', e.target.value)}
                    placeholder="120"
                    className="w-full h-11 pl-3.5 pr-12 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    m²
                  </span>
                </div>
              </Fieldset>
            )}

            {/* (e) Chambres — only when the type is residential */}
            {currentStep === 'rooms' && (
              <Fieldset
                icon={<BedDouble className="w-5 h-5" />}
                legend={t('estimate.q.rooms', lang)}
              >
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {['1', '2', '3', '4', '5', '6+'].map((r) => (
                    <ChoiceButton
                      key={r}
                      selected={form.rooms === r}
                      onClick={() => update('rooms', r)}
                    >
                      {r}
                    </ChoiceButton>
                  ))}
                </div>
              </Fieldset>
            )}

            {/* (f) État / standing */}
            {currentStep === 'condition' && (
              <Fieldset
                icon={<Sparkles className="w-5 h-5" />}
                legend={t('estimate.q.condition', lang)}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {CONDITIONS.map((c) => (
                    <ChoiceButton
                      key={c}
                      selected={form.condition === c}
                      onClick={() => update('condition', c)}
                    >
                      {t(`estimate.condition.${c}`, lang)}
                    </ChoiceButton>
                  ))}
                </div>
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
                {t('estimate.back', lang)}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance()}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg disabled:opacity-50 hover:translate-y-[-1px] transition-transform"
            >
              {isLastStep ? t('estimate.seeResult', lang) : t('estimate.next', lang)}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* ─────────────────────────── Result (honest) ─────────────────────────── */}
      {phase === 'result' && (
        <div>
          {/* Personalized recap — « Votre {type} à {quartier} » */}
          <div className="rounded-2xl border border-clay bg-card p-5 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary-strong mb-1.5">
              {t('estimate.result.eyebrow', lang)}
            </p>
            <p className="font-serif text-xl sm:text-2xl leading-snug">
              {t('estimate.result.recapPrefix', lang)}{' '}
              <strong className="text-primary">{typeLabelInline}</strong>{' '}
              {t('estimate.result.recapAt', lang)}{' '}
              <strong className="text-primary">{form.quartier.trim()}</strong>
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
              <Detail label={t('estimate.label.transaction', lang)} value={transactionLabel} />
              <Detail label={t('estimate.label.surface', lang)} value={`${form.surface} m²`} />
              {typeMeta?.rooms && form.rooms !== '' && (
                <Detail label={t('estimate.label.rooms', lang)} value={form.rooms} />
              )}
              {conditionLabel && (
                <Detail label={t('estimate.label.condition', lang)} value={conditionLabel} />
              )}
            </dl>
          </div>

          {/* Data-backed comparable-listings range — from the REAL Jamm
              catalogue. Shown only when comparable listings exist; the expert
              valuation below stays the precise, human figure. */}
          {comps && comps.basis !== 'none' && (comps.estimate || comps.range) && (
            <div className="mt-5 rounded-2xl border border-secondary/30 bg-secondary/5 p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary-strong mb-1.5">
                {t('estimate.comps.eyebrow', lang)}
              </p>
              <p className="font-serif text-2xl sm:text-[28px] leading-tight text-primary">
                {formatFCFA((comps.estimate ?? comps.range)!.low, { suffix: false })} –{' '}
                {formatFCFA((comps.estimate ?? comps.range)!.high)}
                {priceSuffix}
              </p>
              <p className="text-muted-foreground text-xs mt-1.5">
                {comps.estimate ? t('estimate.comps.rangeLabel', lang) : t('estimate.comps.marketLabel', lang)}
                {' · '}
                {t('estimate.comps.basis', lang)} {comps.count} {t('estimate.comps.basisListings', lang)}{' '}
                {t(`estimate.comps.scope.${comps.basis}`, lang)}
              </p>

              {comps.comps.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {comps.comps.map((c) => {
                    const href = hrefByRef[c.reference];
                    const row = (
                      <>
                        <span className="truncate text-foreground">{c.title}</span>
                        <span className="shrink-0 font-semibold text-foreground">
                          {formatFCFA(c.price)}
                          {priceSuffix}
                        </span>
                      </>
                    );
                    return (
                      <li key={c.reference}>
                        {href ? (
                          <a
                            href={href}
                            className="flex items-center justify-between gap-3 rounded-lg border border-clay bg-card px-3 py-2 text-sm hover:border-secondary/50 transition"
                          >
                            {row}
                          </a>
                        ) : (
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-clay bg-card px-3 py-2 text-sm">
                            {row}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <a
                href={compsBiensLink}
                data-track="estimate.comps.seeListings"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-secondary transition"
              >
                {t('estimate.comps.seeListings', lang)}
                <ArrowRight className="w-4 h-4" />
              </a>

              <p className="text-muted-foreground text-[11px] mt-3 leading-relaxed">
                {t('estimate.comps.disclaimer', lang)}
              </p>
            </div>
          )}

          {/* 3 value-drivers — honest, no invented price. */}
          <div className="mt-5">
            <p className="text-sm font-semibold mb-2.5">{t('estimate.result.factorsTitle', lang)}</p>
            <ul className="space-y-2.5">
              {['1', '2', '3'].map((n) => (
                <li key={n} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-secondary/15 text-secondary-strong grid place-items-center">
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span>{t(`estimate.result.factor.${n}`, lang)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* The OFFER — free expert valuation under 24h. No invented number. */}
          <div className="mt-6 rounded-2xl border border-secondary/30 bg-secondary/5 p-5">
            <p className="font-serif text-lg leading-snug">{t('estimate.result.offerTitle', lang)}</p>
            <p className="text-muted-foreground text-sm mt-1.5">{t('estimate.result.offerBody', lang)}</p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setPhase('capture')}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg hover:translate-y-[-1px] transition-transform"
            >
              {t('estimate.result.cta', lang)}
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
              {t('estimate.result.edit', lang)}
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────── Capture (single field) ─────────────────────────── */}
      {phase === 'capture' && (
        <form onSubmit={submitLead} noValidate>
          <div className="rounded-2xl border border-clay bg-card p-5 mb-5">
            <p className="text-sm font-semibold mb-1">{t('estimate.capture.title', lang)}</p>
            <p className="text-muted-foreground text-sm">{t('estimate.capture.body', lang)}</p>
          </div>

          {/* Prénom — OPTIONAL */}
          <div className="mb-3.5">
            <label
              htmlFor="est-firstname"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('estimate.capture.firstName', lang)}
            </label>
            <input
              id="est-firstname"
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
              htmlFor="est-phone"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('estimate.capture.whatsapp', lang)}
            </label>
            <input
              id="est-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouchedPhone(true)}
              autoComplete="tel"
              placeholder="+221 77 ..."
              required
              aria-invalid={touchedPhone && !phoneValid}
              aria-describedby={touchedPhone && !phoneValid ? 'est-phone-err' : undefined}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
            />
            {touchedPhone && !phoneValid && (
              <p id="est-phone-err" role="alert" className="text-terra text-xs mt-1">
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
                {t('estimate.capture.submit', lang)}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Alternative — prefilled WhatsApp deeplink. */}
          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-clay" aria-hidden="true" />
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              {t('estimate.capture.or', lang)}
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
            {t('estimate.capture.wa', lang)}
          </a>

          <button
            type="button"
            onClick={() => setPhase('result')}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-muted-foreground text-sm hover:text-foreground transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('estimate.capture.back', lang)}
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
