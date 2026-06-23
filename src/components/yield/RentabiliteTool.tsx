/**
 * « Rentabilité locative » — calculateur d'investissement (lead-magnet
 * investisseurs). Même grammaire de funnel que les autres outils : valeur
 * d'abord (calcul instantané, honnête, déterministe), capture minimale ensuite.
 *
 *   • L'utilisateur saisit prix d'achat, loyer mensuel, charges, taxe, vacance.
 *   • Le résultat s'affiche EN DIRECT : rendement brut / net, revenu net annuel,
 *     retour sur investissement. Aucun chiffre inventé — `computeYield` est une
 *     fonction pure, unit-testée (src/lib/yield-calc.ts).
 *   • PUIS l'offre + cross-sell /biens + capture WhatsApp (1 champ).
 *
 * ISOLATION TIER-3 : île 100 % statique. Réutilise `POST /api/leads` (D1) +
 * l'event allowlisté `lead.form.submitted` (subject:'rentabilite', string libre
 * déjà accepté par l'union) + le deeplink WhatsApp. Aucun nouvel endpoint.
 */
import { useMemo, useState } from 'react';
import { Loader2, ArrowRight, ArrowLeft, Check, TrendingUp, Sparkles } from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { SITE } from '@/lib/site-config';
import { formatFCFA } from '@/lib/format';
import { buildBiensLink } from '@/lib/biens-filter';
import { computeYield } from '@/lib/yield-calc';

interface Props {
  lang: Lang;
}

const phoneSn = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const phoneLoose = /^\+?[\d\s().-]{7,20}$/;
const isValidPhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7) return false;
  return phoneSn.test(v) || phoneLoose.test(v);
};

const digitsOnly = (v: string) => v.replace(/\D/g, '');
const group = (digits: string) => (digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '');

export default function RentabiliteTool({ lang }: Props) {
  const [price, setPrice] = useState('');
  const [rent, setRent] = useState('');
  const [charges, setCharges] = useState('');
  const [tax, setTax] = useState('');
  const [vacancy, setVacancy] = useState('0');

  const [phase, setPhase] = useState<'tool' | 'capture' | 'done'>('tool');
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [touchedPhone, setTouchedPhone] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const priceN = Number(price) || 0;
  const rentN = Number(rent) || 0;
  const result = useMemo(
    () =>
      computeYield({
        price: priceN,
        monthlyRent: rentN,
        monthlyCharges: Number(charges) || 0,
        annualTax: Number(tax) || 0,
        vacancyWeeks: Number(vacancy) || 0,
      }),
    [priceN, rentN, charges, tax, vacancy],
  );
  const hasResult = priceN > 0 && rentN > 0;

  /** Recap reused as the lead `message` + WhatsApp text. */
  const recap = useMemo(() => {
    const lines = [t('rentabilite.recap.header', lang)];
    lines.push(`- ${t('rentabilite.input.price', lang)}: ${group(price)} FCFA`);
    lines.push(`- ${t('rentabilite.input.rent', lang)}: ${group(rent)} FCFA`);
    if (Number(charges) > 0) lines.push(`- ${t('rentabilite.input.charges', lang)}: ${group(charges)} FCFA`);
    if (Number(tax) > 0) lines.push(`- ${t('rentabilite.input.tax', lang)}: ${group(tax)} FCFA`);
    if (hasResult) {
      lines.push('');
      lines.push(`- ${t('rentabilite.result.grossYield', lang)}: ${result.grossYieldPct}%`);
      lines.push(`- ${t('rentabilite.result.netYield', lang)}: ${result.netYieldPct}%`);
      if (result.paybackYears != null) {
        lines.push(`- ${t('rentabilite.result.payback', lang)}: ${result.paybackYears} ${t('rentabilite.result.paybackUnit', lang)}`);
      }
    }
    return lines.join('\n');
  }, [lang, price, rent, charges, tax, hasResult, result]);

  const waLink = useMemo(
    () => `${SITE.whatsappUrl}?text=${encodeURIComponent(`${t('rentabilite.wa.intro', lang)}\n\n${recap}`)}`,
    [lang, recap],
  );

  /** Cross-sell: properties for sale (investment targets). */
  const biensLink = useMemo(() => buildBiensLink({ transaction: 'acheter' }, lang), [lang]);

  const phoneValid = isValidPhone(phone.trim());

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    setTouchedPhone(true);
    if (!phoneValid) return;
    setSubmitState('sending');
    setErrorMsg('');
    try {
      const fullName = firstName.trim() || t('rentabilite.lead.anonName', lang);
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
      track({ name: 'lead.form.submitted', props: { subject: 'rentabilite', hasMessage: true, fromProperty: false } });
      void import('@/lib/replay-recorder').then((m) => m.forceReplay()).catch(() => {});
    } catch (err: any) {
      setSubmitState('error');
      setErrorMsg(err?.message ?? 'Unknown error');
    }
  }

  if (phase === 'done') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-emerald/10 border border-emerald/30 text-emerald rounded-3xl p-8 sm:p-10 text-center"
      >
        <Check className="w-9 h-9 mx-auto mb-3" aria-hidden="true" />
        <p className="font-serif text-2xl mb-2 text-foreground">{t('rentabilite.done.title', lang)}</p>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">{t('rentabilite.done.body', lang)}</p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          data-track="whatsapp.tapped"
          className="mt-6 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-emerald text-white font-semibold text-sm shadow-lg hover:translate-y-[-1px] transition-transform"
        >
          <WhatsAppIcon />
          {t('rentabilite.done.wa', lang)}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground rounded-3xl shadow-xl p-6 sm:p-9">
      <div className="mb-6">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary-strong mb-2">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          {t('rentabilite.eyebrow', lang)}
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl leading-tight">{t('rentabilite.title', lang)}</h2>
        <p className="text-muted-foreground text-sm mt-1.5">{t('rentabilite.subtitle', lang)}</p>
      </div>

      {phase === 'tool' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <MoneyField id="ry-price" label={t('rentabilite.input.price', lang)} value={price} onChange={setPrice} required />
            <MoneyField id="ry-rent" label={t('rentabilite.input.rent', lang)} value={rent} onChange={setRent} required />
            <MoneyField id="ry-charges" label={t('rentabilite.input.charges', lang)} value={charges} onChange={setCharges} />
            <MoneyField id="ry-tax" label={t('rentabilite.input.tax', lang)} value={tax} onChange={setTax} />
            <div className="sm:col-span-2">
              <label htmlFor="ry-vacancy" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {t('rentabilite.input.vacancy', lang)}
              </label>
              <input
                id="ry-vacancy"
                type="number"
                inputMode="numeric"
                min={0}
                max={52}
                value={vacancy}
                onChange={(e) => setVacancy(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Live result */}
          {hasResult ? (
            <div className="mt-6 rounded-2xl border border-secondary/30 bg-secondary/5 p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-secondary-strong mb-3 inline-flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                {t('rentabilite.result.title', lang)}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Stat label={t('rentabilite.result.grossYield', lang)} value={`${result.grossYieldPct ?? '—'} %`} big />
                <Stat label={t('rentabilite.result.netYield', lang)} value={`${result.netYieldPct ?? '—'} %`} big accent />
                <Stat label={t('rentabilite.result.netAnnual', lang)} value={formatFCFA(result.netAnnualIncome)} />
                <Stat
                  label={t('rentabilite.result.payback', lang)}
                  value={result.paybackYears != null ? `${result.paybackYears} ${t('rentabilite.result.paybackUnit', lang)}` : '—'}
                />
              </div>
              <p className="text-muted-foreground text-[11px] mt-4 leading-relaxed">{t('rentabilite.disclaimer', lang)}</p>
            </div>
          ) : (
            <p className="mt-6 text-muted-foreground text-sm text-center py-6 rounded-2xl border border-dashed border-clay">
              {t('rentabilite.empty', lang)}
            </p>
          )}

          {/* Offer + cross-sell + capture entry */}
          <div className="mt-6 rounded-2xl border border-clay bg-card p-5">
            <p className="font-serif text-lg leading-snug">{t('rentabilite.offer.title', lang)}</p>
            <p className="text-muted-foreground text-sm mt-1.5">{t('rentabilite.offer.body', lang)}</p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setPhase('capture')}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg hover:translate-y-[-1px] transition-transform"
            >
              {t('rentabilite.cta.help', lang)}
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href={biensLink}
              data-track="rentabilite.seeListings"
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full border border-input bg-card text-foreground font-semibold text-[15px] hover:bg-muted transition"
            >
              {t('rentabilite.cta.listings', lang)}
            </a>
          </div>
        </>
      )}

      {phase === 'capture' && (
        <form onSubmit={submitLead} noValidate>
          <div className="rounded-2xl border border-clay bg-card p-5 mb-5">
            <p className="text-sm font-semibold mb-1">{t('rentabilite.capture.title', lang)}</p>
            <p className="text-muted-foreground text-sm">{t('rentabilite.capture.body', lang)}</p>
          </div>

          <div className="mb-3.5">
            <label htmlFor="ry-firstname" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              {t('rentabilite.capture.firstName', lang)}
            </label>
            <input
              id="ry-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="mb-1">
            <label htmlFor="ry-phone" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              {t('rentabilite.capture.whatsapp', lang)}
            </label>
            <input
              id="ry-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouchedPhone(true)}
              autoComplete="tel"
              placeholder="+221 77 ..."
              required
              aria-invalid={touchedPhone && !phoneValid}
              aria-describedby={touchedPhone && !phoneValid ? 'ry-phone-err' : undefined}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
            />
            {touchedPhone && !phoneValid && (
              <p id="ry-phone-err" role="alert" className="text-terra text-xs mt-1">
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
                {t('rentabilite.capture.submit', lang)}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-clay" aria-hidden="true" />
            <span className="text-muted-foreground text-xs uppercase tracking-wider">{t('rentabilite.capture.or', lang)}</span>
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
            {t('rentabilite.capture.wa', lang)}
          </a>

          <button
            type="button"
            onClick={() => setPhase('tool')}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-muted-foreground text-sm hover:text-foreground transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('rentabilite.capture.back', lang)}
          </button>
        </form>
      )}
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function MoneyField({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
        {required && <span className="text-terra"> *</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={group(value)}
          onChange={(e) => onChange(digitsOnly(e.target.value))}
          placeholder="0"
          className="w-full h-11 pl-3.5 pr-14 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">FCFA</span>
      </div>
    </div>
  );
}

function Stat({ label, value, big, accent }: { label: string; value: string; big?: boolean; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={(big ? 'font-serif text-2xl sm:text-[26px] ' : 'text-base font-semibold ') + (accent ? 'text-secondary-strong' : 'text-foreground')}>
        {value}
      </p>
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
