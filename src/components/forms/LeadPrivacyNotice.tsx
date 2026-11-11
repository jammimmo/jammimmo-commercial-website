import { t, type Lang } from '@/lib/i18n';
import { SITE } from '@/lib/site-config';

/** Same privacy destination as the public site's existing footer. */
export default function LeadPrivacyNotice({ lang }: { lang: Lang }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">
    {t('qualification.privacyNotice', lang)}{' '}
    <a href={SITE.legal.privacy} hrefLang="fr" className="inline-flex min-h-11 items-center underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('footer.privacy', lang)}</a>
  </p>;
}
