import { useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { t, type Lang } from '@/lib/i18n';
import { COMPARE_KEY, MAX_COMPARE, readCompare, writeCompare } from '@/lib/compare';
import { track } from '@/lib/analytics';

interface Props {
  reference: string;
  title: string;
  lang: Lang;
}

export default function CompareToggle({ reference, title, lang }: Props) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(readCompare().some((p) => p.reference === reference));
    const onUpdate = () => setActive(readCompare().some((p) => p.reference === reference));
    window.addEventListener(`${COMPARE_KEY}:update`, onUpdate);
    return () => window.removeEventListener(`${COMPARE_KEY}:update`, onUpdate);
  }, [reference]);

  function toggle() {
    const list = readCompare();
    if (active) {
      writeCompare(list.filter((p) => p.reference !== reference));
      track({ name: 'compare.removed', props: { ref: reference } });
    } else {
      if (list.length >= MAX_COMPARE) return;
      writeCompare([...list, { reference, title }]);
      track({ name: 'compare.added', props: { ref: reference } });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      className={
        'mt-2 inline-flex items-center justify-center gap-1.5 self-start px-3 py-1.5 rounded-full text-[12px] font-semibold transition ' +
        (active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground')
      }
    >
      {active ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
      {active ? t('property.compare.remove', lang) : t('property.compare.add', lang)}
    </button>
  );
}
