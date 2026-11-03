import { describe, expect, it } from 'vitest';
import { contextualQuestion } from './context';
import { propertySearch, searchCitationFromId } from './navigation';
import { CHAT_SOURCES, publicCitations, retrieve, sourceAnswer, wantsHuman } from './sources';

describe('bounded grounded retrieval, no provider', () => {
  it('opens the actual public search with criteria instead of a legal article', () => {
    const question = 'Je cherche un appartement 2 chambres à Ngor à louer, budget 300000 FCFA';
    const result = propertySearch(question, question, 'fr')!;
    expect(Object.fromEntries(new URL(result.url).searchParams)).toEqual({ type: 'Appartement', transaction: 'Location', q: 'Ngor', bedsMin: '2', priceMax: '300000' });
    expect(result.quote).toContain('au moins 2');
    expect(searchCitationFromId(result.id)).toEqual(result);
    expect(publicCitations(JSON.stringify([{ ...result, url: 'https://evil.example', title: 'forged' }]))).toEqual([result]);
  });
  it('retains recent visitor criteria for two successive elliptical refinements', () => {
    const first = 'Je cherche un appartement 2 chambres à Ngor à louer';
    const context = contextualQuestion('moins de 250000 FCFA', ['Et à Ouakam ?', first]);
    expect(Object.fromEntries(new URL(propertySearch(context, 'moins de 250000 FCFA', 'fr')!.url).searchParams))
      .toEqual({ type: 'Appartement', transaction: 'Location', q: 'Ouakam', bedsMin: '2', priceMax: '250000' });
    expect(contextualQuestion('Comment vérifier un titre foncier ?', [first])).toBe('Comment vérifier un titre foncier ?');
  });
  it('does not turn a legal followup into another property search or repeat the previous intro', () => {
    const first = 'Peut-on acheter au Sénégal depuis la diaspora ?';
    const question = contextualQuestion('Et le mandat ?', [first]);
    const sources = retrieve(question, 'fr', [], 'Et le mandat ?');
    expect(sources[0].text).toMatch(/mandataire|procuration/i);
    expect(propertySearch(contextualQuestion('Et les frais de notaire ?', ['Je cherche un appartement à Ngor']), 'Et les frais de notaire ?', 'fr')).toBeNull();
    expect(sourceAnswer(sources).length).toBeLessThanOrEqual(4000);
  });
  it('drops invalid/oversized context and cannot import assistant or another thread data', () => {
    expect(contextualQuestion('Et le mandat ?', ['x'.repeat(2001), 'private'])).toBe('Et le mandat ?');
    expect(contextualQuestion('Et le mandat ?', [{ role: 'assistant', content: 'private' }])).toBe('Et le mandat ?');
    expect(contextualQuestion('Et le mandat ?', ['x\u0000private'])).toBe('Et le mandat ?');
    expect(contextualQuestion('Et le mandat ?', ['Et le budget ?', 'Et à distance ?', 'first', 'older private'])).not.toContain('older private');
  });
  it('reconstructs only canonical navigation and exact published excerpts', () => {
    expect(searchCitationFromId('search:fr:q=https%3A%2F%2Fevil.example')).toBeNull();
    expect(searchCitationFromId('search:fr:type=Appartement&type=Terrain')).toBeNull();
    expect(searchCitationFromId('search:fr:redirect=evil')).toBeNull();
    const source = CHAT_SOURCES.find(s => s.id === 'tool:fr:securite-fonciere:1')!;
    expect(publicCitations(JSON.stringify([{ ...source, quote: 'a fact that is not in this article' }]))).toEqual([]);
    expect(publicCitations(JSON.stringify([{ id: source.id, quote: source.text, url: 'https://evil.example' }]))[0].url).toBe(source.url);
  });
  it('keeps currency ambiguity honest and never claims a listing is available', () => {
    const question = 'Je cherche un appartement à Ngor, moins de 500 euros';
    const result = propertySearch(question, question, 'fr')!;
    expect(new URL(result.url).searchParams.has('priceMax')).toBe(false);
    expect(result.quote).not.toMatch(/disponible|500/);
  });
  it('requires actual human intent and has a deterministic unknown-source fallback', () => {
    expect(wantsHuman('Je veux parler à un conseiller')).toBe(true);
    expect(wantsHuman('Je veux parler à quelqu’un')).toBe(true);
    expect(wantsHuman('une vraie personne')).toBe(true);
    expect(wantsHuman('talk to someone')).toBe(true);
    expect(wantsHuman('Je suis agent immobilier')).toBe(false);
    expect(wantsHuman('Quels sont les frais d’un agent ?')).toBe(false);
    expect(wantsHuman('Je veux vendre, quels sont les frais d’un agent ?')).toBe(false);
    expect(retrieve('photocopieuse intergalactique', 'fr', [])).toEqual([]);
    expect(retrieve('Et ?', 'fr', [])).toEqual([]);
    expect(sourceAnswer([])).toContain('Je ne trouve pas');
  });
});
