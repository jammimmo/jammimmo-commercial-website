import { useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { t, getDir, type Lang } from '@/lib/i18n';
import { buildQualificationCatalogueLink } from '@/lib/biens-filter';
import {
  parsePublicLeadQualification, PUBLIC_LEAD_QUALIFICATION_OPERATIONS as OPERATIONS,
  PUBLIC_LEAD_QUALIFICATION_PROPERTY_TYPES as TYPES, PUBLIC_LEAD_QUALIFICATION_URGENCIES as URGENCIES,
  PUBLIC_LEAD_QUALIFICATION_FINANCING_AVAILABILITIES as AVAILABILITY, PUBLIC_LEAD_QUALIFICATION_FINANCING_METHODS as METHODS,
  PUBLIC_LEAD_QUALIFICATION_FEATURES as FEATURES, PUBLIC_LEAD_QUALIFICATION_ADDITIONAL_NEEDS as NEEDS,
  type PublicLeadQualificationV1 as Qualification,
} from '@/lib/public-lead-qualification';
import { PublicLeadIdentitySchema, isQualifiedLeadStorageText } from '@/lib/qualified-lead-wire';
import { sealQualifiedSubmission, sendQualifiedSubmission, QualifiedSubmissionValidationError, type QualifiedSubmission } from '@/lib/qualified-lead-submit';
import LeadPrivacyNotice from './LeadPrivacyNotice';

export type QualificationPrefill = Partial<Pick<Qualification, 'operation' | 'propertyType' | 'zone'>> & {
  budgetMax?: number; bedrooms?: number; fullName?: string; phone?: string;
};
const control = 'w-full min-w-0 min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const button = 'min-h-11 min-w-11 rounded-xl border border-input px-4 py-2 text-sm font-semibold whitespace-normal break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const empty = (p: QualificationPrefill): Omit<Qualification, 'operation'> & { operation: Qualification['operation'] | '' } => ({
  version: 1, operation: p.operation ?? '', propertyType: p.propertyType ?? null, propertyTypeOther: null, city: null, zone: p.zone ?? null,
  budget: { min: null, max: p.budgetMax ?? null, currency: 'XOF', basis: p.operation === 'rent' ? 'monthly' : p.operation === 'buy' ? 'total' : null },
  urgency: null, financing: { availability: null, method: null, other: null },
  criteria: { bedrooms: p.bedrooms ?? null, features: [], other: null }, additionalNeeds: [],
});

export default function PublicQualificationForm({ lang, prefill = {}, propertyReference, onBack, onPendingChange, active = true }: {
  lang: Lang; prefill?: QualificationPrefill; propertyReference?: string; onBack: () => void; onPendingChange?: (pending: boolean) => void; active?: boolean;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const flight = useRef(false);
  const [draft, setDraft] = useState(() => empty(prefill));
  const [contact, setContact] = useState(() => ({ full_name: prefill.fullName ?? '', phone: prefill.phone ?? '', email: '' }));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<QualifiedSubmission | null>(null);
  const [state, setState] = useState<'editing' | 'sending' | 'unknown' | 'rate_limited' | 'accepted'>('editing');
  const q = (key: string) => t(`qualification.${key}`, lang);
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const clearFieldErrors = (key: string) => {
    const affected = key === 'operation' ? ['operation', 'budget.basis']
      : key === 'propertyType' ? ['propertyType', 'propertyTypeOther'] : key === 'financing.method' ? ['financing.method', 'financing.other'] : [key];
    setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([path]) => path !== '$'
      && !(path === 'budget' && (key === 'budget.min' || key === 'budget.max'))
      && !affected.some(field => path === field || path.startsWith(field + '.') || path.startsWith(field + '[')))));
  };
  const move = (next: number) => { setStep(next); requestAnimationFrame(() => heading.current?.focus()); };
  const locked = state !== 'editing';
  const validate = (stage: 0 | 1 | 'all') => {
    const identity = stage === 'all';
    const belongs = (path: string) => stage === 'all' || (stage === 0
      ? ['operation', 'propertyType', 'propertyTypeOther', 'city', 'zone', 'budget', 'urgency'].some(key => path === key || path.startsWith(key + '.'))
      : ['financing', 'criteria', 'additionalNeeds'].some(key => path === key || path.startsWith(key + '.') || path.startsWith(key + '[')));
    const found: Record<string, string> = {};
    const parsed = parsePublicLeadQualification({ ...draft,
      propertyTypeOther: draft.propertyType === 'other' ? draft.propertyTypeOther : null,
      financing: { ...draft.financing, other: draft.financing.method === 'other' ? draft.financing.other : null },
    });
    if (!parsed.ok) for (const issue of parsed.issues) if (belongs(issue.path)) found[issue.path] = q(issue.code === 'invalid_range' ? 'budgetError' : issue.code === 'too_long' || issue.code === 'too_large' ? 'textLong' : 'required');
    const texts = { city: draft.city, zone: draft.zone, propertyTypeOther: draft.propertyType === 'other' ? draft.propertyTypeOther : null, 'financing.other': draft.financing.method === 'other' ? draft.financing.other : null, 'criteria.other': draft.criteria.other, ...(identity ? contact : {}) };
    for (const [path, text] of Object.entries(texts)) if (belongs(path) && typeof text === 'string' && !isQualifiedLeadStorageText(text)) found[path] = q('required');
    const person = PublicLeadIdentitySchema.safeParse({ ...contact, property_reference: propertyReference });
    if (identity && !person.success) for (const issue of person.error.issues) found[String(issue.path[0])] = q('required');
    setErrors(found);
    return { parsed, person, valid: Object.keys(found).length === 0 };
  };
  const send = async (original: QualifiedSubmission, mode: 'submit' | 'recover') => {
    if (flight.current) return;
    flight.current = true; setState('sending'); onPendingChange?.(true);
    try { const result = await sendQualifiedSubmission(original, mode); setState(result.status); onPendingChange?.(result.status !== 'accepted'); }
    finally { flight.current = false; }
  };
  const submit = () => {
    if (submission || flight.current) return;
    const result = validate('all');
    if (!result.valid || !result.parsed.ok || !result.person.success) return;
    try {
      const sealed = sealQualifiedSubmission({ ...result.person.data, qualification: result.parsed.value });
      setSubmission(sealed); void send(sealed, 'submit');
    } catch (error) {
      const found: Record<string, string> = {};
      if (error instanceof QualifiedSubmissionValidationError) for (const issue of error.issues) found[issue.path.replace(/^qualification\./, '')] = q('required');
      setErrors(Object.keys(found).length ? found : { $: q('invalid') });
    }
  };
  const field = (key: string, label: string, child: ReactNode) => <div className="min-w-0 space-y-1.5">
    <label htmlFor={`${id}-${key}`} className="block text-sm font-medium">{label}</label>{child}
    {errors[key] && <p id={`${id}-${key}-error`} role="alert" className="text-sm text-terra">{errors[key]}</p>}
  </div>;
  const input = (key: string, label: string, value: string | number | null, change: (value: string) => void, type = 'text') => field(key, label,
    <input id={`${id}-${key}`} name={key} type={type} inputMode={type === 'number' ? 'numeric' : undefined} value={value ?? ''}
      onChange={e => { clearFieldErrors(key); change(e.target.value); }} className={control} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
      data-rrweb-mask data-clarity-mask="true" autoComplete={key === 'phone' ? 'tel' : key === 'full_name' ? 'name' : key === 'email' ? 'email' : 'off'} />);
  const select = (key: string, label: string, value: string | null, options: readonly string[], group: string, change: (value: string) => void) => field(key, label,
    <div className="relative"><select id={`${id}-${key}`} name={key} value={value ?? ''} onChange={e => { clearFieldErrors(key); change(e.target.value); }}
      className={`${control} appearance-none pe-10`} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}>
      <option value="">{q('undecided')}</option>{options.map(option => <option key={option} value={option}>{q(`${group}.${option}`)}</option>)}
    </select><ChevronDown aria-hidden="true" className="pointer-events-none absolute end-3 top-3.5 h-4 w-4" /></div>);
  const number = (value: string) => value === '' ? null : Number(value);

  return <section dir={getDir(lang)} className="space-y-5 rounded-2xl border border-input bg-background p-4 text-foreground sm:p-6" data-qualification-open={active ? 'true' : undefined} data-chat-private data-rrweb-mask data-clarity-mask="true">
    <header className="space-y-2"><h2 ref={heading} tabIndex={-1} className="font-serif text-2xl leading-tight outline-none">{q('title')}</h2><p className="text-sm text-muted-foreground">{q('intro')}</p></header>
    <ol className="grid grid-cols-3 gap-2 text-sm" aria-label={q('title')}>{[0, 1, 2].map(index => <li key={index} aria-current={step === index ? 'step' : undefined} className={`min-w-0 break-words border-b-2 pb-2 ${step === index ? 'border-primary font-semibold' : 'border-input text-muted-foreground'}`}>{index + 1}. {q(`step${index}`)}</li>)}</ol>
    {state === 'accepted' ? <div className="space-y-3">
      <p role="status" className="rounded-xl border border-emerald/30 bg-emerald/10 p-4">{q('accepted')}</p>
      {submission && <a href={buildQualificationCatalogueLink(submission.qualification, lang)}
        className={`${button} inline-flex max-w-full items-center bg-primary text-primary-foreground`}>
        {t('error.browseListings', lang)}
      </a>}
    </div> : <form noValidate onSubmit={e => { e.preventDefault(); if (!locked) { if (step < 2) { if (validate(step === 0 ? 0 : 1).valid) move(step + 1); } else submit(); } }}>
      {locked && <p role="status" className="mb-4 rounded-xl border border-input p-4 text-sm">{q(state === 'sending' ? 'sending' : state === 'rate_limited' ? 'rateLimited' : 'unknown')}</p>}
      <fieldset disabled={locked} className="min-w-0 space-y-4">
        {step === 0 && <>
          {select('operation', q('operation'), draft.operation, OPERATIONS, 'operation', value => {
            const operation = OPERATIONS.find(x => x === value) ?? '';
            setDraft(old => ({ ...old, operation, budget: { ...old.budget, basis: operation === 'buy' ? 'total' : operation === 'rent' ? 'monthly' : null } }));
          })}
          {select('propertyType', q('propertyType'), draft.propertyType, TYPES, 'propertyType', value => set('propertyType', TYPES.find(x => x === value) ?? null))}
          {draft.propertyType === 'other' && input('propertyTypeOther', q('propertyOther'), draft.propertyTypeOther, value => set('propertyTypeOther', value))}
          <div className="grid gap-4 sm:grid-cols-2">{input('city', q('city'), draft.city, value => set('city', value))}{input('zone', q('zone'), draft.zone, value => set('zone', value))}</div>
          <div className="grid gap-4 sm:grid-cols-2">{input('budget.min', q('min'), draft.budget.min, value => set('budget', { ...draft.budget, min: number(value) }), 'number')}{input('budget.max', q('max'), draft.budget.max, value => set('budget', { ...draft.budget, max: number(value) }), 'number')}</div>
          {errors.budget && <p role="alert" className="text-sm text-terra">{errors.budget}</p>}
          {draft.operation === 'buy' || draft.operation === 'rent' ? <p className="text-sm">{q(`basis.${draft.budget.basis}`)}</p> : select('budget.basis', q('basis'), draft.budget.basis, ['total', 'monthly'], 'basis', value => set('budget', { ...draft.budget, basis: value === 'total' || value === 'monthly' ? value : null }))}
          {select('urgency', q('urgency'), draft.urgency, URGENCIES, 'urgency', value => set('urgency', URGENCIES.find(x => x === value) ?? null))}
        </>}
        {step === 1 && <>
          {select('financing.availability', q('availability'), draft.financing.availability, AVAILABILITY, 'availability', value => set('financing', { ...draft.financing, availability: AVAILABILITY.find(x => x === value) ?? null }))}
          {select('financing.method', q('method'), draft.financing.method, METHODS, 'method', value => set('financing', { ...draft.financing, method: METHODS.find(x => x === value) ?? null }))}
          {draft.financing.method === 'other' && input('financing.other', q('financeOther'), draft.financing.other, value => set('financing', { ...draft.financing, other: value }))}
          {input('criteria.bedrooms', q('bedrooms'), draft.criteria.bedrooms, value => set('criteria', { ...draft.criteria, bedrooms: number(value) }), 'number')}
          <fieldset><legend className="mb-2 text-sm font-medium">{q('features')}</legend><div className="grid gap-2 sm:grid-cols-2">{FEATURES.map(feature => <label key={feature} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-input px-3 py-2 text-sm"><input type="checkbox" checked={draft.criteria.features.includes(feature)} onChange={e => { clearFieldErrors('criteria.features'); set('criteria', { ...draft.criteria, features: e.target.checked ? [...draft.criteria.features, feature] : draft.criteria.features.filter(x => x !== feature) }); }} />{q(`feature.${feature}`)}</label>)}</div></fieldset>
          {field('criteria.other', q('otherCriteria'), <textarea id={`${id}-criteria.other`} value={draft.criteria.other ?? ''} onChange={e => { clearFieldErrors('criteria.other'); set('criteria', { ...draft.criteria, other: e.target.value }); }} rows={3} className={control} data-rrweb-mask data-clarity-mask="true" />)}
          <fieldset><legend className="mb-2 text-sm font-medium">{q('needs')}</legend><div className="grid gap-2 sm:grid-cols-2">{NEEDS.map(need => <label key={need} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-input px-3 py-2 text-sm"><input type="checkbox" checked={draft.additionalNeeds.includes(need)} onChange={e => { clearFieldErrors('additionalNeeds'); set('additionalNeeds', e.target.checked ? [...draft.additionalNeeds, need] : draft.additionalNeeds.filter(x => x !== need)); }} />{q(`need.${need}`)}</label>)}</div></fieldset>
        </>}
        {step === 2 && <>
          <div className="rounded-xl border border-input p-4 text-sm"><h3 className="mb-2 font-semibold">{q('review')}</h3><p>{draft.operation && q(`operation.${draft.operation}`)} · {draft.propertyType ? q(`propertyType.${draft.propertyType}`) : q('undecided')}{draft.propertyType === 'other' && draft.propertyTypeOther ? ` · ${draft.propertyTypeOther}` : ''}</p><p className="break-words">{[draft.city, draft.zone].filter(Boolean).join(' · ') || q('undecided')}</p><p>{draft.budget.min ?? '—'} – {draft.budget.max ?? '—'} · {draft.budget.basis ? q(`basis.${draft.budget.basis}`) : q('undecided')}</p><p>{q('urgency')} : {draft.urgency ? q(`urgency.${draft.urgency}`) : q('undecided')}</p><p>{q('availability')} : {draft.financing.availability ? q(`availability.${draft.financing.availability}`) : q('undecided')}</p><p>{q('method')} : {draft.financing.method ? q(`method.${draft.financing.method}`) : q('undecided')}{draft.financing.method === 'other' && draft.financing.other ? ` · ${draft.financing.other}` : ''}</p><p>{q('bedrooms')} : {draft.criteria.bedrooms ?? q('undecided')}</p><p className="break-words">{q('features')} : {[...draft.criteria.features.map(feature => q(`feature.${feature}`)), draft.criteria.other].filter(Boolean).join(' · ') || q('undecided')}</p><p>{q('needs')} : {draft.additionalNeeds.map(need => q(`need.${need}`)).join(' · ') || q('undecided')}</p></div>
          {input('full_name', q('name'), contact.full_name, value => setContact(old => ({ ...old, full_name: value })))}
          {input('phone', q('phone'), contact.phone, value => setContact(old => ({ ...old, phone: value })), 'tel')}
          {input('email', q('email'), contact.email, value => setContact(old => ({ ...old, email: value })), 'email')}
          <LeadPrivacyNotice lang={lang} />
        </>}
      </fieldset>
      {errors.$ && <p role="alert" className="mt-4 text-sm text-terra">{errors.$}</p>}
      {Object.keys(errors).length > 0 && <p role="alert" className="mt-4 text-sm text-terra">{q('invalid')}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className={button} onClick={() => { if (!locked && step > 0) move(step - 1); else onBack(); }}>{q('back')}</button>
        {!locked && <button type="submit" className={`${button} flex-1 bg-primary text-primary-foreground`}>{q(step < 2 ? 'next' : 'submit')}</button>}
        {state === 'rate_limited' && submission && <button type="button" className={`${button} flex-1 bg-primary text-primary-foreground`} onClick={() => void send(submission, 'submit')}>{q('retrySame')}</button>}
        {state === 'unknown' && submission && <button type="button" className={`${button} flex-1 bg-primary text-primary-foreground`} onClick={() => void send(submission, 'recover')}>{q('recover')}</button>}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{q('noStorage')}</p>
    </form>}
    <button type="button" data-qualification-help className={button} onClick={event => {
      const launcher = document.querySelector<HTMLButtonElement>('.jamm-chat-launcher');
      if (launcher) { event.currentTarget.focus({ preventScroll: true }); launcher.click(); }
    }}>{q('help')}</button>
    {state === 'accepted' && <button type="button" className={button} onClick={onBack}>{q('back')}</button>}
  </section>;
}

/** Keep the mounted form (including uncertain intent) when returning to the
 * existing quiz/contact flow. Hidden is a view change, never a new submission. */
export function QualificationEntry({ lang, prefill, propertyReference, onOpenChange, onPendingChange }: { lang: Lang; prefill?: QualificationPrefill; propertyReference?: string; onOpenChange?: (open: boolean) => void; onPendingChange?: (pending: boolean) => void }) {
  const [opened, setOpened] = useState(false);
  const [visited, setVisited] = useState(false);
  const [pending, setPending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="mt-5">
    <button ref={trigger} type="button" hidden={opened} className={`${button} w-full`} onClick={() => { setVisited(true); setOpened(true); onOpenChange?.(true); }}>{t(pending ? 'qualification.resume' : 'qualification.entry', lang)}</button>
    {pending && !opened && <p role="status" className="mt-2 text-sm">{t('qualification.unknown', lang)}</p>}
    {visited && <div hidden={!opened}><PublicQualificationForm active={opened} onPendingChange={value => { setPending(value); onPendingChange?.(value); }} lang={lang} prefill={prefill} propertyReference={propertyReference} onBack={() => { setOpened(false); onOpenChange?.(false); requestAnimationFrame(() => trigger.current?.focus()); }} /></div>}
  </div>;
}
