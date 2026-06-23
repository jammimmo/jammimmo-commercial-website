import { ArrowRight } from 'lucide-react';
import { t, type Lang, localizedPath } from '@/lib/i18n';
import { SITE } from '@/lib/site-config';

interface Props {
  lang: Lang;
  /** The selected properties to mention in the prefilled message. */
  items: Array<{ reference: string; title: string }>;
  /** i18n key prefix, e.g. 'page.favorites.recall' or 'page.compare.recall'.
   *  Expects .title .body .wa .contact .waIntro under it. */
  keyPrefix: string;
}

/**
 * Conversion CTA for the /favoris and /comparer pages, which previously
 * dead-ended (a saved/compared selection with no next step). Opens WhatsApp
 * prefilled with the selection (so a Jamm advisor can call back, organize
 * visits, negotiate) and offers the contact page as an alternative. Reuses the
 * existing WhatsApp deeplink pattern + the free-form `data-track` heatmap; no
 * new analytics event, no new endpoint.
 */
export default function RecallCta({ lang, items, keyPrefix }: Props) {
  if (items.length === 0) return null;
  const lines = items.map((i) => `• ${i.title} — ${i.reference}`).join('\n');
  const msg = `${t(`${keyPrefix}.waIntro`, lang)}\n\n${lines}`;
  const waLink = `${SITE.whatsappUrl}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="mt-8 sm:mt-10 rounded-2xl border border-secondary/30 bg-secondary/5 p-6 sm:p-7 text-center">
      <p className="font-serif text-xl sm:text-2xl mb-1.5">{t(`${keyPrefix}.title`, lang)}</p>
      <p className="text-muted-foreground text-sm mb-5 max-w-md mx-auto">{t(`${keyPrefix}.body`, lang)}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          data-track="whatsapp.tapped"
          className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-emerald text-white font-semibold text-[15px] shadow-lg hover:translate-y-[-1px] transition-transform"
        >
          <WhatsAppIcon />
          {t(`${keyPrefix}.wa`, lang)}
        </a>
        <a
          href={localizedPath('/contact', lang)}
          data-track="recall.contact"
          className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full border border-input bg-card text-foreground font-semibold text-[15px] hover:bg-muted transition"
        >
          {t(`${keyPrefix}.contact`, lang)}
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
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
