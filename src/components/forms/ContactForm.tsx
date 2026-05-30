import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, ArrowRight, Check } from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import { track } from '@/lib/analytics';

interface Props {
  lang: Lang;
  propertyId?: string;
  propertyTitle?: string;
  compact?: boolean;
}

const phoneSn = /^(\+?221|00221)?\s*7[05678]\s*\d{3}\s*\d{2}\s*\d{2}\s*\d{0,2}$/;
const phoneLoose = /^\+?[\d\s().-]{7,20}$/;

const makeSchema = (lang: Lang) =>
  z.object({
    first_name: z.string().min(1, t('form.validation.fullName', lang)).max(100),
    last_name: z.string().min(1, t('form.validation.fullName', lang)).max(100),
    phone: z
      .string()
      .min(4, t('form.validation.phone', lang))
      .max(32)
      .refine((v) => phoneSn.test(v) || phoneLoose.test(v), t('form.validation.phone', lang)),
    email: z.string().email(t('form.validation.email', lang)).optional().or(z.literal('')),
    subject: z.string().max(200).optional(),
    message: z.string().max(2000, t('form.validation.message', lang)).optional(),
  });

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function ContactForm({ lang, propertyId, propertyTitle, compact = false }: Props) {
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(makeSchema(lang)) });

  async function onSubmit(values: FormValues) {
    setSubmitState('sending');
    setErrorMsg('');
    try {
      const fullName = `${values.first_name} ${values.last_name}`.trim();
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone: values.phone.trim(),
          email: values.email || undefined,
          message: [
            values.subject ? `[${values.subject}]` : '',
            propertyTitle ? `À propos de : ${propertyTitle}` : '',
            values.message || '',
          ].filter(Boolean).join('\n\n'),
          property_id: propertyId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setSubmitState('ok');
      track({
        name: 'lead.form.submitted',
        props: {
          subject: values.subject || undefined,
          hasMessage: !!values.message,
          fromProperty: !!propertyId,
        },
      });
    } catch (e: any) {
      setSubmitState('error');
      setErrorMsg(e?.message ?? 'Unknown error');
    }
  }

  if (submitState === 'ok') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-emerald/10 border border-emerald/30 text-emerald rounded-2xl p-6 text-center"
      >
        <Check className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
        <p className="font-semibold">{t('form.success', lang)}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={
        'bg-background text-foreground rounded-3xl shadow-xl ' +
        (compact ? 'p-6' : 'p-7 sm:p-9')
      }
    >
      <h3 className="font-serif text-2xl mb-1">{t('form.title', lang)}</h3>
      <p className="text-muted-foreground text-sm mb-6">{t('form.subtitle', lang)}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div>
          <label htmlFor="first_name" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {t('form.firstName', lang)}
          </label>
          <input
            id="first_name"
            {...register('first_name')}
            autoComplete="given-name"
            placeholder="Aïcha"
            aria-invalid={!!errors.first_name}
            aria-describedby={errors.first_name ? 'first_name-err' : undefined}
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
          />
          {errors.first_name && (
            <p id="first_name-err" role="alert" className="text-terra text-xs mt-1">
              {errors.first_name.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="last_name" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {t('form.lastName', lang)}
          </label>
          <input
            id="last_name"
            {...register('last_name')}
            autoComplete="family-name"
            placeholder="Diop"
            aria-invalid={!!errors.last_name}
            aria-describedby={errors.last_name ? 'last_name-err' : undefined}
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
          />
          {errors.last_name && (
            <p id="last_name-err" role="alert" className="text-terra text-xs mt-1">
              {errors.last_name.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="phone" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {t('form.phone', lang)}
          </label>
          <input
            id="phone"
            type="tel"
            {...register('phone')}
            autoComplete="tel"
            placeholder="+221 77 ..."
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'phone-err' : undefined}
            required
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
          />
          {errors.phone && (
            <p id="phone-err" role="alert" className="text-terra text-xs mt-1">
              {errors.phone.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="email" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {t('form.email', lang)}
          </label>
          <input
            id="email"
            type="email"
            {...register('email')}
            autoComplete="email"
            placeholder="vous@email.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-err' : undefined}
            className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-terra"
          />
          {errors.email && (
            <p id="email-err" role="alert" className="text-terra text-xs mt-1">
              {errors.email.message}
            </p>
          )}
        </div>

        {!propertyId && (
          <div className="sm:col-span-2">
            <label htmlFor="subject" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              {t('form.subject', lang)}
            </label>
            <select
              id="subject"
              {...register('subject')}
              className="w-full h-11 px-3.5 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">—</option>
              <option>Acheter un bien</option>
              <option>Vendre un bien</option>
              <option>Louer un bien</option>
              <option>Mettre en gestion</option>
              <option>Conseil / accompagnement</option>
            </select>
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="message" className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {t('form.message', lang)}
          </label>
          <textarea
            id="message"
            {...register('message')}
            placeholder={t('form.messagePlaceholder', lang)}
            rows={4}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? 'message-err' : undefined}
            className="w-full px-3.5 py-3 rounded-xl border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-vertical aria-[invalid=true]:border-terra"
          />
          {errors.message && (
            <p id="message-err" role="alert" className="text-terra text-xs mt-1">
              {errors.message.message}
            </p>
          )}
        </div>
      </div>

      {submitState === 'error' && (
        <p role="alert" aria-live="assertive" className="mt-3 text-terra text-sm">
          {t('form.error', lang)}
          {errorMsg && <span className="block opacity-60 text-xs mt-0.5">{errorMsg}</span>}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || submitState === 'sending'}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-secondary text-secondary-foreground font-semibold text-[15px] shadow-lg disabled:opacity-50 hover:translate-y-[-1px] transition-transform"
      >
        {submitState === 'sending' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            ...
          </>
        ) : (
          <>
            {t('form.submit', lang)}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </form>
  );
}
