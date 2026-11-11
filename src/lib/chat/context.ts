/** Context consists only of bounded, same-session visitor questions. Assistant
 * replies/page titles are never evidence and never become retrieval authority. */
export function elliptical(value: string): boolean {
  const text = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return text.length <= 220 && /^(?:et\b|mais\b|aussi\b|alors\b|pour\b|a\s|moins\b|max\b|<|combien\b|cela\b|ca\b|ce\s+(?:cas|bien)|and\b|what about\b|under\b)/.test(text);
}
export function contextualQuestion(current: string, recentNewestFirst: readonly unknown[]): string {
  const parts = [current];
  let last = current;
  for (const previous of recentNewestFirst.slice(0, 3)) {
    if (!elliptical(last)) break;
    if (typeof previous !== 'string' || !previous.trim() || previous.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(previous)) break;
    if (parts.reduce((sum, part) => sum + part.length + 1, 0) + previous.length > 4000) break;
    parts.unshift(previous); last = previous;
  }
  return parts.join('\n');
}

/** A property page provides context, not permission to invent its live facts.
 * It must not prevent an unrelated question about a guide or calculator. */
export function generalInformationQuestion(question: string): boolean {
  const words = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(outils?|simulateurs?|calculateurs?|calculer|estimer|comprendre|methodes?|guides?|articles?|demarches?|taxes?|notaire|fiscal[a-z]*|procuration|mandat)\b/.test(words)
    || /(?:verifier|securiser|obtenir|comprendre).*titre foncier/.test(words);
}
export function explicitCatalogueSearch(question: string): boolean {
  const words = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const intent = /\b(cherche|recherche|trouve|trouvez|montre|montrez|proposez|looking|search|find|show)\b/.test(words)
    || (/\bje (?:veux|souhaite|voudrais|aimerais)\b/.test(words) && /\b(appartements?|appart|villas?|maisons?|terrains?|logements?|studios?)\b/.test(words));
  return intent
    && !/\b(?:cherche|recherche|trouve|veux|souhaite|voudrais|aimerais)\s+(?:connaitre )?(?:le |un )?(?:prix|loyer|surface|disponibilite)\b/.test(words)
    && !/\b(ce bien|cet appartement|cette annonce|this property)\b/.test(words);
}
export function requestsListingFacts(question: string, hasPropertyContext: boolean): boolean {
  if (generalInformationQuestion(question) || explicitCatalogueSearch(question)) return false;
  if (/\bJI-[A-Z0-9-]{3,}\b/i.test(question)) return true;
  if (!hasPropertyContext) return false;
  const words = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/\b(outils?|simulateurs?|calculateurs?|calculer|estimer|comprendre|methodes?|guides?|articles?|demarches?|taxes?)\b/.test(words)
    || /frais (?:de |du )?notaire/.test(words)) return false;
  return /\b(prix|loyer|disponib[a-z]*|surface|adresse|localisation|chambres?|piscine|toilettes?|etage|salles? de bain|ce bien|cet appartement|cette annonce|description|decris|decrivez|details|price|rent|bedrooms?|available|availability|address|describe|this property)\b/.test(words);
}
