/**
 * « Match-o-mètre » — quiz acheteur/locataire (60 s) qui affiche 3 biens RÉELS
 * correspondants, puis capture WhatsApp. Distinct de BudgetTool (qui filtre puis
 * renvoie vers /biens) : ICI on montre les biens directement, classés par fit.
 *
 * RÈGLE FUNNEL (identique aux autres outils) : valeur d'abord, demande minimale
 * au pic d'intention.
 *   • AUCUN gate avant l'outil — quiz libre (transaction, type, chambres,
 *     budget, zone), toutes les étapes gratuites et SANS contact.
 *   • RÉSULTAT immédiat et HONNÊTE : les biens montrés sont de VRAIES annonces
 *     Jamm (figées au build, comme /biens), classées par proximité avec la
 *     recherche — JAMAIS de bien inventé, JAMAIS de chiffre fabriqué. Si rien ne
 *     correspond, on le DIT et on propose quand même la mise en relation.
 *   • PUIS capture — UN SEUL champ : le WhatsApp (+ prénom optionnel) pour « la
 *     sélection complète + les nouveautés ».
 *
 * ISOLATION TIER-3 : île 100 % statique côté runtime. Les annonces arrivent en
 * PROP (sérialisées au BUILD par MatchContent.astro via supabase.build, exactement
 * comme ListingsView) — AUCUN fetch runtime, AUCUN secret, AUCUN endpoint. La
 * capture réutilise l'EXISTANT `POST /api/leads` (D1) + le deeplink WhatsApp.
 *
 * Analytics : réutilise UNIQUEMENT `lead.form.submitted` (allowlist). Aucun
 * nouveau nom d'event. Les CTA portent `data-track` (heatmap, free-form).
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
  BedDouble,
  Building2,
  Sparkles,
  Search,
} from 'lucide-react';
import { t, type Lang, localizedPath } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { SITE } from '@/lib/site-config';
import { filterPlaces, placeContext } from '@/lib/places';
import { formatRentalPrice } from '@/lib/format';
import type { PublicProperty } from '@/types/property';

interface Props {
  lang: Lang;
  properties: PublicProperty[];
  hrefByRef: Record<string, string>;
}

const TRANSACTIONS = ['acheter', 'louer'] as const;
type Transaction = (typeof TRANSACTIONS)[number];

/** Property types — `biens` is the exact capitalized value compared with p.type
 *  (and the /biens `type` filter). `key === ''` = "peu importe" (no filter). */
const PROPERTY_TYPES = [
  { key: 'appartement', biens: 'Appartement' },
  { key: 'villa', biens: 'Villa' },
  { key: 'maison', biens: 'Maison' },
  { key: 'terrain', biens: 'Terrain' },
  { key: 'bureau', biens: 'Bureau' },
  { key: 'commerce', biens: 'Magasin' },
] as const;
type PropertyTypeKey = (typeof PROPERTY_TYPES)[number]['key'];

/** Bedroom floor choices. '' = peu importe ; '0' = studio ; '4' = 4+. */
const BEDROOM_CHOICES = ['', '0', '1', '2', '3', '4'] as const;
type BedroomChoice = (typeof BEDROOM_CHOICES)[number];

const phoneSn = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const phoneLoose = /^\+?[\d\s().-]{7,20}$/;
const isValidPhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7) return false;
  return phoneSn.test(v) || phoneLoose.test(v);
};

const digitsOnly = (v: string) => v.replace(/\D/g, '');
const formatMoney = (digits: string) =>
  digits ? Number(digits).toLocaleString('fr-FR').replace(/ /g, ' ') : '';

/** Accent-insensitive contains, for the free-text zone match. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

type StepId = 'transaction' | 'type' | 'bedrooms' | 'budget' | 'zone';
const STEP_ORDER: StepId[] = ['transaction', 'type', 'bedrooms', 'budget', 'zone'];
const TOTAL_STEPS = STEP_ORDER.length; // stable denominator — always 5

interface FormState {
  transaction: Transaction | '';
  type: PropertyTypeKey | '';
  bedrooms: BedroomChoice;
  budget: string; // raw digits
  zone: string;
}
const INITIAL: FormState = { transaction: '', type: '', bedrooms: '', budget: '', zone: '' };

function transactionMatches(p: PublicProperty, tr: Transaction): boolean {
  if (tr === 'acheter') return p.transaction_type === 'Vente' || p.transaction_type === 'Vente & Location';
  return p.transaction_type === 'Location' || p.transaction_type === 'Vente & Location';
}

export default function MatchTool({ lang, properties, hrefByRef }: Props) {
  const [phase, setPhase] = useState<'wizard' | 'result' | 'capture' | 'done'>('wizard');
  const [form, setForm] = useState<FormState>(INITIAL);
  const [stepIndex, setStepIndex] = useState(0);

  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [touchedPhone, setTouchedPhone] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const currentStep = STEP_ORDER[Math.min(stepIndex, TOTAL_STEPS - 1)];
  const isLastStep = stepIndex >= TOTAL_STEPS - 1;
  const progress = Math.round(((stepIndex + 1) / TOTAL_STEPS) * 100);
  const budgetNumber = Number(form.budget) || 0;

  /** transaction is the only required step; the rest refine and are skippable. */
  const canAdvance = currentStep === 'transaction' ? !!form.transaction : true;

  function next() {
    if (!canAdvance) return;
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

  const typeMeta = PROPERTY_TYPES.find((p) => p.key === form.type);

  /**
   * Real listings ranked by FIT. transaction is a hard filter (you can't buy a
   * rental-only listing); type / bedrooms / budget / zone are soft (+points) so
   * we always surface the closest REAL matches rather than an empty screen.
   * Tiebreak: freshness (updated_at desc). Top 3.
   */
  const matches = useMemo(() => {
    if (!form.transaction) return [];
    const tr = form.transaction;
    const zoneQ = norm(form.zone);
    const scored = properties
      .filter((p) => transactionMatches(p, tr))
      .map((p) => {
        let score = 0;
        if (typeMeta && p.type === typeMeta.biens) score += 3;
        if (form.bedrooms && p.bedrooms >= Number(form.bedrooms)) score += 2;
        if (budgetNumber > 0 && p.price > 0 && p.price <= budgetNumber) score += 2;
        if (zoneQ && (norm(p.quartier).includes(zoneQ) || norm(p.city).includes(zoneQ))) score += 3;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score || (b.p.updated_at > a.p.updated_at ? 1 : -1));
    return scored.slice(0, 3).map((s) => s.p);
  }, [properties, form.transaction, typeMeta, form.bedrooms, budgetNumber, form.zone]);

  // Human labels.
  const transactionLabel = form.transaction ? t(`match.transaction.noun.${form.transaction}`, lang) : '';
  const typeLabel = form.type ? t(`match.type.${form.type}`, lang) : '';
  const bedroomsLabel = form.bedrooms
    ? form.bedrooms === '0'
      ? t('match.bedrooms.studio', lang)
      : form.bedrooms === '4'
        ? t('match.bedrooms.4plus', lang)
        : form.bedrooms
    : '';
  const budgetDisplay = formatMoney(form.budget);

  /** Recap reused as lead `message` + WhatsApp text. */
  const recap = useMemo(() => {
    const lines: string[] = [t('match.recap.header', lang)];
    lines.push(`- ${t('match.label.transaction', lang)}: ${transactionLabel}`);
    if (typeLabel) lines.push(`- ${t('match.label.type', lang)}: ${typeLabel}`);
    if (bedroomsLabel) lines.push(`- ${t('match.label.bedrooms', lang)}: ${bedroomsLabel}`);
    if (budgetNumber > 0) lines.push(`- ${t('match.label.budget', lang)}: ${budgetDisplay} FCFA`);
    if (form.zone.trim()) lines.push(`- ${t('match.label.zone', lang)}: ${form.zone.trim()}`);
    if (matches.length) {
      lines.push('', t('match.recap.matchesHeader', lang));
      for (const p of matches) lines.push(`• ${p.title} (${p.reference}) — ${p.quartier}, ${p.city}`);
    }
    return lines.join('\n');
  }, [lang, transactionLabel, typeLabel, bedroomsLabel, budgetNumber, budgetDisplay, form.zone, matches]);

  const waLink = useMemo(
    () => `${SITE.whatsappUrl}?text=${encodeURIComponent(`${t('match.wa.intro', lang)}\n\n${recap}`)}`,
    [lang, recap],
  );

  /** Link to the full filtered listing on /biens (same mapping as BudgetTool). */
  const biensLink = useMemo(() => {
    const params = new URLSearchParams();
    if (form.transaction) params.set('transaction', form.transaction === 'acheter' ? 'Vente' : 'Location');
    if (form.transaction === 'acheter' && budgetNumber > 0) params.set('priceMax', String(budgetNumber));
    if (typeMeta) params.set('type', typeMeta.biens);
    if (form.zone.trim()) params.set('q', form.zone.trim());
    return `${localizedPath('/biens', lang)}?${params.toString()}`;
  }, [lang, form.transaction, budgetNumber, typeMeta, form.zone]);

  const phoneValid = isValidPhone(phone.trim());

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setTouchedPhone(true);
    if (!phoneValid) return;
    setSubmitState('sending');
    setErrorMsg('');
    try {
      const fullName = firstName.trim() || t('match.lead.anonName', lang);
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone: phone.trim(), message: recap }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setPhase('done');
      track({
        name: 'lead.form.submitted',
        props: { subject: form.transaction || 'match', hasMessage: true, fromProperty: false },
      });
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
        <p className="font-serif text-2xl mb-2 text-foreground">{t('match.done.title', lang)}</p>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">{t('match.done.body', lang)}</p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          data-track="whatsapp.tapped"
          className="mt-6 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-emerald text-white font-semibold text-sm shadow-lg hover:translate-y-[-1px] transition-transform"
        >
          <WhatsAppIcon />
          {t('match.done.wa', lang)}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground rounded-3xl shadow-xl p-6 sm:p-9">
      <div className="mb-6">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary-strong mb-2">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          {t('match.eyebrow', lang)}
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl leading-tight">{t('match.title', lang)}</h2>
        <p className="text-muted-foreground text-sm mt-1.5">{t('match.subtitle', lang)}</p>
      </div>

      {/* ─────────────────────────── Wizard ─────────────────────────── */}
      {phase === 'wizard' && (
        <>
          <div className="mb-6" aria-hidden="true">
            <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              <span>
                {t('match.step', lang)} {stepIndex + 1}/{TOTAL_STEPS}
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
            {currentStep === 'transaction' && (
              <Fieldset icon={<Home className="w-5 h-5" />} legend={t('match.q.transaction', lang)}>
                <div className="grid grid-cols-2 gap-2.5">
                  {TRANSACTIONS.map((tr) => (
                    <ChoiceButton key={tr} selected={form.transaction === tr} onClick={() => update('transaction', tr)}>
                      {t(`match.transaction.${tr}`, lang)}
                    </ChoiceButton>
                  ))}
                </div>
              </Fieldset>
            )}

            {currentStep === 'type' && (
              <Fieldset icon={<Building2 className="w-5 h-5" />} legend={t('match.q.type', lang)}>
                <div className="grid grid-cols-2 gap-2.5">
                  <ChoiceButton selected={form.type === ''} onClick={() => update('type', '')}>
                    {t('match.type.any', lang)}
                  </ChoiceButton>
                  {PROPERTY_TYPES.map((p) => (
                    <ChoiceButton key={p.key} selected={form.type === p.key} onClick={() => update('type', p.key)}>
                      {t(`match.type.${p.key}`, lang)}
                    </ChoiceButton>
                  ))}
                </div>
                <p className="text-muted-foreground text-xs mt-2">{t('match.hint.optional', lang)}</p>
              </Fieldset>
            )}

            {currentStep === 'bedrooms' && (
              <Fieldset icon={<BedDouble className="w-5 h-5" />} legend={t('match.q.bedrooms', lang)}>
                <div className="grid grid-cols-3 gap-2.5">
                  <ChoiceButton selected={form.bedrooms === ''} onClick={() => update('bedrooms', '')}>
                    {t('match.bedrooms.any', lang)}
                  </ChoiceButton>
                  <ChoiceButton selected={form.bedrooms === '0'} onClick={() => update('bedrooms', '0')}>
                    {t('match.bedrooms.studio', lang)}
                  </ChoiceButton>
                  {(['1', '2', '3'] as BedroomChoice[]).map((b) => (
                    <ChoiceButton key={b} selected={form.bedrooms === b} onClick={() => update('bedrooms', b)}>
                      {b}
                    </ChoiceButton>
                  ))}
                  <ChoiceButton selected={form.bedrooms === '4'} onClick={() => update('bedrooms', '4')}>
                    {t('match.bedrooms.4plus', lang)}
                  </ChoiceButton>
                </div>
                <p className="text-muted-foreground text-xs mt-2">{t('match.hint.optional', lang)}</p>
              </Fieldset>
            )}

            {currentStep === 'budget' && (
              <Fieldset
                icon={<Wallet className="w-5 h-5" />}
                legend={t(form.transaction === 'louer' ? 'match.q.budget.louer' : 'match.q.budget.acheter', lang)}
              >
                <div className="relative">
                  <input
                    id="match-amount"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={budgetDisplay}
                    onChange={(e) => update('budget', digitsOnly(e.target.value))}
                    placeholder={form.transaction === 'louer' ? '350 000' : '50 000 000'}
                    className="w-full h-11 pl-3.5 pr-20 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    FCFA{form.transaction === 'louer' ? ` ${t('match.amount.perMonth', lang)}` : ''}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs mt-2">{t('match.hint.optional', lang)}</p>
              </Fieldset>
            )}

            {currentStep === 'zone' && (
              <Fieldset icon={<MapPin className="w-5 h-5" />} legend={t('match.q.zone', lang)}>
                <input
                  id="match-zone"
                  type="text"
                  list="match-zone-list"
                  autoComplete="off"
                  value={form.zone}
                  onChange={(e) => update('zone', e.target.value)}
                  placeholder={t('match.placeholder.zone', lang)}
                  className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <datalist id="match-zone-list">
                  {filterPlaces(form.zone, 50).map((p) => (
                    <option key={`${p.name}|${p.commune}`} value={p.name}>
                      {placeContext(p)}
                    </option>
                  ))}
                </datalist>
                <p className="text-muted-foreground text-xs mt-2">{t('match.hint.zone', lang)}</p>
              </Fieldset>
            )}
          </div>

          <div className="mt-7 flex items-center gap-3">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-full border border-input bg-card text-foreground font-semibold text-[15px] hover:bg-muted transition"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('match.back', lang)}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg disabled:opacity-50 hover:translate-y-[-1px] transition-transform"
            >
              {isLastStep ? t('match.seeResult', lang) : t('match.next', lang)}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* ─────────────────────────── Result (real listings) ─────────────────────────── */}
      {phase === 'result' && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary-strong mb-1.5">
            {t('match.result.eyebrow', lang)}
          </p>
          <p className="font-serif text-xl sm:text-2xl leading-snug">
            {matches.length
              ? t('match.result.title', lang)
              : t('match.result.emptyTitle', lang)}
          </p>
          <p className="text-muted-foreground text-sm mt-1.5">
            {matches.length ? t('match.result.sub', lang) : t('match.result.emptySub', lang)}
          </p>

          {matches.length > 0 && (
            <ul className="mt-5 space-y-3">
              {matches.map((p) => (
                <li key={p.reference}>
                  <a
                    href={hrefByRef[p.reference]}
                    data-track="match.openListing"
                    className="flex gap-3.5 items-center rounded-2xl border border-clay bg-card p-3 hover:border-secondary/60 transition group/card"
                  >
                    <span className="w-20 h-16 shrink-0 rounded-xl overflow-hidden bg-muted grid place-items-center">
                      {p.images[0] ? (
                        <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <Home className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-[15px] leading-snug truncate">{p.title}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                        {p.quartier}
                        {p.quartier && p.city ? ' · ' : ''}
                        {p.city}
                      </span>
                      <span className="block text-sm font-semibold text-primary mt-1">
                        {formatRentalPrice(p.price, p.transaction_type)}
                      </span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover/card:translate-x-0.5 transition shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {matches.length > 0 && (
            <a
              href={biensLink}
              data-track="match.seeAll"
              className="mt-5 w-full inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full border border-input bg-card text-foreground font-semibold text-[15px] hover:bg-muted transition"
            >
              <Search className="w-4 h-4" />
              {t('match.result.seeAll', lang)}
            </a>
          )}

          {/* The OFFER — full personalized shortlist + alerts. */}
          <div className="mt-6 rounded-2xl border border-secondary/30 bg-secondary/5 p-5">
            <p className="font-serif text-lg leading-snug">{t('match.result.offerTitle', lang)}</p>
            <p className="text-muted-foreground text-sm mt-1.5">{t('match.result.offerBody', lang)}</p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setPhase('capture')}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-primary text-primary-foreground font-semibold text-[15px] shadow-lg hover:translate-y-[-1px] transition-transform"
            >
              {t('match.result.cta', lang)}
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
              {t('match.result.edit', lang)}
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────── Capture (single field) ─────────────────────────── */}
      {phase === 'capture' && (
        <form onSubmit={submitLead} noValidate>
          <div className="rounded-2xl border border-clay bg-card p-5 mb-5">
            <p className="text-sm font-semibold mb-1">{t('match.capture.title', lang)}</p>
            <p className="text-muted-foreground text-sm">{t('match.capture.body', lang)}</p>
          </div>

          <div className="mb-3.5">
            <label
              htmlFor="match-firstname"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('match.capture.firstName', lang)}
            </label>
            <input
              id="match-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              placeholder="Awa"
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="mb-1">
            <label
              htmlFor="match-phone"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('match.capture.whatsapp', lang)}
            </label>
            <input
              id="match-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouchedPhone(true)}
              autoComplete="tel"
              placeholder="+221 77 ..."
              required
              aria-invalid={touchedPhone && !phoneValid}
              aria-describedby={touchedPhone && !phoneValid ? 'match-phone-err' : undefined}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
            />
            {touchedPhone && !phoneValid && (
              <p id="match-phone-err" role="alert" className="text-terra text-xs mt-1">
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
                {t('match.capture.submit', lang)}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-clay" aria-hidden="true" />
            <span className="text-muted-foreground text-xs uppercase tracking-wider">{t('match.capture.or', lang)}</span>
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
            {t('match.capture.wa', lang)}
          </a>

          <button
            type="button"
            onClick={() => setPhase('result')}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-muted-foreground text-sm hover:text-foreground transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('match.capture.back', lang)}
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
        <span className="w-9 h-9 rounded-xl bg-accent text-primary grid place-items-center shrink-0">{icon}</span>
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

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.3A10 10 0 1 0 12 2zm5.6 14.2c-.2.6-1.3 1.2-1.8 1.3-.5.1-1.1.1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.7-4-4.8-4.2-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5.2.5.7 1.7.7 1.8.1.1.1.3 0 .5l-.3.4-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.8 2.1 1.2 1.1 2.2 1.4 2.5 1.5.3.1.5.1.7-.1.2-.2.7-.9 1-1.2.2-.3.4-.2.7-.1.3.1 1.7.8 2 1 .3.1.5.2.6.3.1.2.1.7-.1 1.4z" />
    </svg>
  );
}
