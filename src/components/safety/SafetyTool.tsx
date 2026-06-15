/**
 * « Sécurité foncière » — auto-diagnostic anti-arnaque pour ACHETEURS de terrain /
 * bien au Sénégal. Miroir d'EstimateTool / BudgetTool (même grammaire de funnel
 * et mêmes garde-fous d'isolation).
 *
 * RÈGLE FUNNEL (calibrage non négociable, identique aux autres outils) : valeur
 * d'abord, demande minimale au pic d'intention.
 *   • AUCUN gate / formulaire AVANT l'outil — l'utilisateur répond librement à un
 *     questionnaire court (6 questions, tout est gratuit et SANS contact).
 *   • À la fin on affiche tout de suite un RÉSULTAT honnête : un niveau de
 *     vigilance (vert / orange / rouge) calculé de façon DÉTERMINISTE à partir
 *     des réponses, PLUS la liste concrète des points de vigilance détectés
 *     (« document = papier simple → exigez un titre », « coxeur sans mandat →
 *     risque de vente multiple »…). C'est la vraie valeur : des conseils précis.
 *   • HONNÊTETÉ ABSOLUE : aucun chiffre/score inventé affiché comme une vérité,
 *     aucun verdict juridique définitif. Le résultat se présente EXPLICITEMENT
 *     comme un auto-diagnostic indicatif — seule une vérification à la
 *     conservation foncière confirme l'authenticité d'un titre.
 *   • PUIS l'offre : une vérification GRATUITE par un expert Jamm (on contrôle
 *     l'authenticité des documents, on alerte sur les pièges). Capture : UN SEUL
 *     champ — le WhatsApp (+ prénom optionnel).
 *
 * ISOLATION TIER-3 : île 100 % statique côté runtime. AUCUN import
 * supabase.build, AUCUN secret, AUCUN nouvel endpoint, AUCUN scoring serveur.
 * Tout le barème vit dans CE fichier (constantes pures). La capture réutilise
 * l'EXISTANT `POST /api/leads` (D1) — `message` = récap complet du diagnostic —
 * et propose en alternative un deeplink WhatsApp (`SITE.whatsappUrl`) prérempli.
 *
 * Analytics : réutilise UNIQUEMENT l'event déjà allowlisté `lead.form.submitted`
 * (cf. AnalyticsEvent dans src/lib/analytics.ts). Aucun nouveau nom d'event. Les
 * CTA portent `data-track` ramassé globalement par src/lib/click-capture.ts.
 *
 * Conventions design-system : calquées sur BudgetTool / EstimateTool (champs
 * `h-11 rounded-xl`, focus-ring, validation `aria-invalid` + bloc `role="alert"`
 * terra, panneau succès emerald `aria-live`, bouton pill `bg-secondary`).
 * Mobile-first.
 */
import { useMemo, useState } from 'react';
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Eye,
  UserCheck,
  Users,
  TrendingDown,
  MapPin,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { SITE } from '@/lib/site-config';

interface Props {
  lang: Lang;
}

/**
 * The quiz. Each question has weighted options: risk 0 = reassuring, 1 = minor
 * caution, 2 = caution, 3 = red flag. The weights encode real Senegalese land
 * fraud patterns (vente multiple, coxeur sans mandat, papier simple vs titre
 * foncier, prix anormalement bas…). The TEXT of every question/option/flag
 * lives in i18n (`safety.q.*`, `safety.opt.*`, `safety.flag.*`) — this array is
 * the pure scoring model only.
 *
 * `icon` is rendered in the question legend. `flag` (when present) is shown on
 * the result screen as a concrete point de vigilance for that answer; risk-0
 * options have no flag (nothing to warn about).
 */
const QUESTIONS = [
  {
    id: 'doc',
    icon: FileText,
    options: [
      { key: 'tf', risk: 0 },
      { key: 'bail', risk: 1 },
      { key: 'delib', risk: 2 },
      { key: 'papier', risk: 3 },
      { key: 'aucun', risk: 3 },
    ],
  },
  {
    id: 'original',
    icon: Eye,
    options: [
      { key: 'oui', risk: 0 },
      { key: 'copie', risk: 2 },
      { key: 'non', risk: 3 },
    ],
  },
  {
    id: 'vendeur',
    icon: UserCheck,
    options: [
      { key: 'verifie', risk: 0 },
      { key: 'pas', risk: 2 },
      { key: 'different', risk: 3 },
    ],
  },
  {
    id: 'interlocuteur',
    icon: Users,
    options: [
      { key: 'proprio', risk: 0 },
      { key: 'mandataire', risk: 1 },
      { key: 'coxeur', risk: 3 },
    ],
  },
  {
    id: 'prix',
    icon: TrendingDown,
    options: [
      { key: 'marche', risk: 0 },
      { key: 'bas', risk: 1 },
      { key: 'tropbas', risk: 3 },
    ],
  },
  {
    id: 'visite',
    icon: MapPin,
    options: [
      { key: 'bornage', risk: 0 },
      { key: 'visite', risk: 1 },
      { key: 'non', risk: 2 },
    ],
  },
] as const;

type QuestionId = (typeof QUESTIONS)[number]['id'];
const TOTAL_STEPS = QUESTIONS.length; // stable denominator — always 6

type RiskLevel = 'vert' | 'orange' | 'rouge';

/** Per-level result styling — tokens confirmed in tailwind.config (emerald /
 *  ochre / terra). Kept honest: the label is a *vigilance* level, not a verdict. */
const LEVEL_STYLE: Record<
  RiskLevel,
  { ring: string; chip: string; icon: typeof ShieldCheck }
> = {
  vert: {
    ring: 'border-emerald/30 bg-emerald/10',
    chip: 'bg-emerald text-emerald-foreground',
    icon: ShieldCheck,
  },
  orange: {
    ring: 'border-ochre/40 bg-ochre/10',
    chip: 'bg-ochre text-ochre-foreground',
    icon: ShieldAlert,
  },
  rouge: {
    ring: 'border-terra/40 bg-terra/10',
    chip: 'bg-terra text-terra-foreground',
    icon: AlertTriangle,
  },
};

/**
 * Phone validation — accepts the Senegalese pattern (shared with ContactForm /
 * BudgetTool / the /api/leads server schema) OR a loose international format,
 * but in BOTH branches we additionally require ≥7 ACTUAL digits so junk is
 * rejected.
 */
const phoneSn = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const phoneLoose = /^\+?[\d\s().-]{7,20}$/;
const isValidPhone = (v: string) => {
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7) return false;
  return phoneSn.test(v) || phoneLoose.test(v);
};

type Answers = Partial<Record<QuestionId, string>>;

export default function SafetyTool({ lang }: Props) {
  // `phase` drives the whole experience: the quiz, then the honest result, then
  // the (single-field) contact capture, then the success panel.
  const [phase, setPhase] = useState<'wizard' | 'result' | 'capture' | 'done'>('wizard');
  const [answers, setAnswers] = useState<Answers>({});
  const [stepIndex, setStepIndex] = useState(0);

  // Contact capture (shown ONLY after the result — pic d'intention).
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [touchedPhone, setTouchedPhone] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const currentQuestion = QUESTIONS[Math.min(stepIndex, TOTAL_STEPS - 1)];
  const isLastStep = stepIndex >= TOTAL_STEPS - 1;
  const progress = Math.round(((stepIndex + 1) / TOTAL_STEPS) * 100);

  /** A question is answerable only when one of its options is picked (all
   *  questions are required — there is no "skip" on a safety diagnostic). */
  const canAdvance = !!answers[currentQuestion.id];

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

  function pick(qid: QuestionId, optKey: string) {
    setAnswers((a) => ({ ...a, [qid]: optKey }));
  }

  /**
   * DETERMINISTIC scoring. sum = Σ option weights; dangerCount = number of
   * red-flag (weight-3) answers. Two or more red flags, OR a high cumulative
   * score → rouge; one red flag OR a moderate score → orange; otherwise vert.
   * Pure function of the answers — no server, no randomness, no invented number.
   */
  const { level, flags, answeredLabels } = useMemo(() => {
    let sum = 0;
    let dangerCount = 0;
    const fl: string[] = [];
    const labels: Array<{ q: string; a: string }> = [];
    for (const q of QUESTIONS) {
      const optKey = answers[q.id];
      const opt = q.options.find((o) => o.key === optKey);
      if (!opt) continue;
      sum += opt.risk;
      if (opt.risk === 3) dangerCount += 1;
      labels.push({
        q: t(`safety.q.${q.id}`, lang),
        a: t(`safety.opt.${q.id}.${opt.key}`, lang),
      });
      // risk-0 answers are reassuring → no point de vigilance to surface.
      if (opt.risk > 0) fl.push(t(`safety.flag.${q.id}.${opt.key}`, lang));
    }
    const lvl: RiskLevel =
      dangerCount >= 2 || sum >= 9 ? 'rouge' : dangerCount >= 1 || sum >= 4 ? 'orange' : 'vert';
    return { level: lvl, flags: fl, answeredLabels: labels };
  }, [answers, lang]);

  /** Full diagnostic recap — REUSED as the lead `message` AND the WhatsApp text. */
  const recap = useMemo(() => {
    const lines: string[] = [t('safety.recap.header', lang)];
    lines.push(`- ${t('safety.recap.level', lang)}: ${t(`safety.result.${level}.chip`, lang)}`);
    for (const { q, a } of answeredLabels) lines.push(`- ${q} ${a}`);
    if (flags.length) {
      lines.push('', t('safety.recap.flagsHeader', lang));
      for (const f of flags) lines.push(`• ${f}`);
    }
    return lines.join('\n');
  }, [lang, level, answeredLabels, flags]);

  /** WhatsApp deeplink — greeting + recap, URL-encoded (wa.me ?text=). */
  const waLink = useMemo(() => {
    const msg = `${t('safety.wa.intro', lang)}\n\n${recap}`;
    return `${SITE.whatsappUrl}?text=${encodeURIComponent(msg)}`;
  }, [lang, recap]);

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
      const fullName = firstName.trim() || t('safety.lead.anonName', lang);
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
      // Reuse the EXISTING allowlisted conversion event. `subject` carries a
      // short non-PII tag accepted by the union. No new event name introduced.
      track({
        name: 'lead.form.submitted',
        props: {
          subject: 'securite-fonciere',
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
        <p className="font-serif text-2xl mb-2 text-foreground">{t('safety.done.title', lang)}</p>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">{t('safety.done.body', lang)}</p>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          data-track="whatsapp.tapped"
          className="mt-6 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-emerald text-white font-semibold text-sm shadow-lg hover:translate-y-[-1px] transition-transform"
        >
          <WhatsAppIcon />
          {t('safety.done.wa', lang)}
        </a>
      </div>
    );
  }

  const QIcon = currentQuestion.icon;
  const ResultIcon = LEVEL_STYLE[level].icon;

  return (
    <div className="bg-background text-foreground rounded-3xl shadow-xl p-6 sm:p-9">
      {/* Header — eyebrow + title + subtitle (same on every phase). */}
      <div className="mb-6">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary-strong mb-2">
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          {t('safety.eyebrow', lang)}
        </p>
        <h2 className="font-serif text-2xl sm:text-3xl leading-tight">{t('safety.title', lang)}</h2>
        <p className="text-muted-foreground text-sm mt-1.5">{t('safety.subtitle', lang)}</p>
      </div>

      {/* ─────────────────────────── Wizard ─────────────────────────── */}
      {phase === 'wizard' && (
        <>
          {/* Progress bar — free, no contact gate. */}
          <div className="mb-6" aria-hidden="true">
            <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              <span>
                {t('safety.step', lang)} {stepIndex + 1}/{TOTAL_STEPS}
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

          <div className="min-h-[300px]">
            <fieldset>
              <legend className="flex items-center gap-2.5 font-serif text-xl mb-4">
                <span className="w-9 h-9 rounded-xl bg-accent text-primary grid place-items-center shrink-0">
                  <QIcon className="w-5 h-5" />
                </span>
                {t(`safety.q.${currentQuestion.id}`, lang)}
              </legend>
              <div className="flex flex-col gap-2.5">
                {currentQuestion.options.map((o) => (
                  <ChoiceButton
                    key={o.key}
                    selected={answers[currentQuestion.id] === o.key}
                    onClick={() => pick(currentQuestion.id, o.key)}
                  >
                    {t(`safety.opt.${currentQuestion.id}.${o.key}`, lang)}
                  </ChoiceButton>
                ))}
              </div>
            </fieldset>
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
                {t('safety.back', lang)}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg disabled:opacity-50 hover:translate-y-[-1px] transition-transform"
            >
              {isLastStep ? t('safety.seeResult', lang) : t('safety.next', lang)}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* ─────────────────────────── Result (honest) ─────────────────────────── */}
      {phase === 'result' && (
        <div>
          {/* Vigilance level — honest label, NOT a legal verdict. */}
          <div className={`rounded-2xl border p-5 sm:p-6 ${LEVEL_STYLE[level].ring}`}>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${LEVEL_STYLE[level].chip}`}
              >
                <ResultIcon className="w-4 h-4" aria-hidden="true" />
                {t(`safety.result.${level}.chip`, lang)}
              </span>
            </div>
            <p className="font-serif text-xl sm:text-2xl leading-snug mt-3">
              {t(`safety.result.${level}.title`, lang)}
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              {t(`safety.result.${level}.body`, lang)}
            </p>
          </div>

          {/* Points de vigilance détectés — the concrete, personalized value. */}
          <div className="mt-5">
            <p className="text-sm font-semibold mb-2.5">{t('safety.result.flagsTitle', lang)}</p>
            {flags.length ? (
              <ul className="space-y-2.5">
                {flags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-terra/15 text-terra grid place-items-center">
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-emerald/15 text-emerald grid place-items-center">
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <span>{t('safety.result.noFlags', lang)}</span>
              </p>
            )}
          </div>

          {/* HONESTY: explicit disclaimer — this is indicative, not a verdict. */}
          <p className="mt-5 text-xs text-muted-foreground rounded-xl border border-clay bg-card p-3.5">
            {t('safety.result.disclaimer', lang)}
          </p>

          {/* The OFFER — free expert verification. */}
          <div className="mt-6 rounded-2xl border border-secondary/30 bg-secondary/5 p-5">
            <p className="font-serif text-lg leading-snug">{t('safety.result.offerTitle', lang)}</p>
            <p className="text-muted-foreground text-sm mt-1.5">
              {t('safety.result.offerBody', lang)}
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setPhase('capture')}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-primary text-primary-foreground font-semibold text-[15px] shadow-lg hover:translate-y-[-1px] transition-transform"
            >
              {t('safety.result.cta', lang)}
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
              {t('safety.result.edit', lang)}
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────── Capture (single field) ─────────────────────────── */}
      {phase === 'capture' && (
        <form onSubmit={submitLead} noValidate>
          <div className="rounded-2xl border border-clay bg-card p-5 mb-5">
            <p className="text-sm font-semibold mb-1">{t('safety.capture.title', lang)}</p>
            <p className="text-muted-foreground text-sm">{t('safety.capture.body', lang)}</p>
          </div>

          {/* Prénom — OPTIONAL */}
          <div className="mb-3.5">
            <label
              htmlFor="saf-firstname"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('safety.capture.firstName', lang)}
            </label>
            <input
              id="saf-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              placeholder="Moussa"
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* WhatsApp — THE single required field */}
          <div className="mb-1">
            <label
              htmlFor="saf-phone"
              className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
            >
              {t('safety.capture.whatsapp', lang)}
            </label>
            <input
              id="saf-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setTouchedPhone(true)}
              autoComplete="tel"
              placeholder="+221 77 ..."
              required
              aria-invalid={touchedPhone && !phoneValid}
              aria-describedby={touchedPhone && !phoneValid ? 'saf-phone-err' : undefined}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
            />
            {touchedPhone && !phoneValid && (
              <p id="saf-phone-err" role="alert" className="text-terra text-xs mt-1">
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
                {t('safety.capture.submit', lang)}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          {/* Alternative — prefilled WhatsApp deeplink. */}
          <div className="mt-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-clay" aria-hidden="true" />
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              {t('safety.capture.or', lang)}
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
            {t('safety.capture.wa', lang)}
          </a>

          <button
            type="button"
            onClick={() => setPhase('result')}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-muted-foreground text-sm hover:text-foreground transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('safety.capture.back', lang)}
          </button>
        </form>
      )}
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

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
        'w-full text-left min-h-11 px-4 py-3 rounded-xl border text-sm font-medium transition ' +
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
