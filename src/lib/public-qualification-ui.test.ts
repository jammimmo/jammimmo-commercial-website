// @vitest-environment happy-dom
import { createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContactForm from '../components/forms/ContactForm';
vi.mock('@/lib/analytics', () => ({ track: () => { throw new Error('Analytics outside qualification UI test'); } }));
import PublicQualificationForm, { QualificationEntry } from '../components/forms/PublicQualificationForm';
import ChatWidget from '../components/chat/ChatWidget';
import { ChatClient, DEFAULT_POLICY } from '../components/chat/chat-client';
import { t } from './i18n';
let host: HTMLDivElement, root: Root;
const calls: Record<string, unknown>[] = [];
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); calls.length = 0; });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function button(text: string) { const found = [...host.querySelectorAll('button')].find(node => !node.closest('[hidden]') && node.textContent === text); if (!found) throw new Error(`Missing button ${text}`); return found; }
async function click(text: string) { await act(async () => { button(text).click(); }); }
function change(label: string, value: string) { const node = [...host.querySelectorAll('label')].find(node => node.textContent === label); if (!node) throw new Error(`Missing field ${label}`); const input = document.getElementById(node.htmlFor) as HTMLInputElement | HTMLSelectElement; act(() => { input.value = value; Simulate.change(input); }); }
async function contactStep(operation = 'invest') { change('Votre projet', operation); await click('Continuer'); await click('Continuer'); change('Nom et prénom', 'Personne fictive Awa'); change('Numéro WhatsApp', '+221000000003'); }
function fakeFetch(lost = false) { vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); calls.push(body); if (lost && calls.length === 1) throw new Error('lost response'); return new Response(JSON.stringify({ ok: true, submission_id: body.submission_id, qualification_version: 1 }), { status: 201 }); })); }
describe('optional public qualification', () => {
  it('allows uncertain funding and missing optional criteria without a document gate', async () => {
    fakeFetch(); act(() => root.render(createElement(PublicQualificationForm, { lang: 'fr', onBack: vi.fn() })));
    change('Votre projet', 'invest'); await click('Continuer'); change('Financement disponible ?', 'no'); await click('Continuer');
    await click('Envoyer ma demande');
    expect(host.querySelector('input[name="full_name"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('input[name="phone"]')?.getAttribute('aria-invalid')).toBe('true');
    change('Nom et prénom', 'Personne fictive Awa');
    expect(host.querySelector('input[name="full_name"]')?.getAttribute('aria-invalid')).toBe('false');
    expect(host.querySelector('input[name="phone"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.textContent).toContain('Vérifiez les champs indiqués avant de continuer.');
    change('Numéro WhatsApp', '+221000000003');
    expect(host.querySelector('[role="alert"]')).toBeNull(); expect(calls).toHaveLength(0);
    await click('Envoyer ma demande');
    expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ qualification: { operation: 'invest', financing: { availability: 'no' }, budget: { basis: null }, criteria: { features: [] } } });
    expect(host.textContent).toContain('Votre demande a été reçue'); expect(host.querySelector('input[type="file"]')).toBeNull();
  });
  it('shows the range error and preserves the project when moving back', async () => {
    fakeFetch(); act(() => root.render(createElement(PublicQualificationForm, { lang: 'fr', onBack: vi.fn() })));
    change('Votre projet', 'lease_management'); change('Ville recherchée · facultatif', 'Localité fictive'); change('Budget minimum · facultatif', '400'); change('Budget maximum · facultatif', '200'); await click('Continuer');
    expect(host.textContent).toContain('Le budget minimum ne peut pas dépasser le maximum.'); expect(calls).toHaveLength(0);
    change('Budget maximum · facultatif', '600');
    expect(host.textContent).not.toContain('Le budget minimum ne peut pas dépasser le maximum.');
    change('Budget minimum · facultatif', '-1'); await click('Continuer');
    change('Budget maximum · facultatif', '650');
    expect(host.querySelector('input[name="budget.min"]')?.getAttribute('aria-invalid')).toBe('true');
    change('Budget minimum · facultatif', '700'); await click('Continuer');
    expect(host.textContent).toContain('Le budget minimum ne peut pas dépasser le maximum.');
    change('Budget minimum · facultatif', '400');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    await click('Continuer'); await click('Retour');
    expect((host.querySelector('input[name="city"]') as HTMLInputElement).value).toBe('Localité fictive');
  });
  it('keeps Unknown visible on return and resumes the same request without an automatic POST', async () => {
    fakeFetch(true); act(() => root.render(createElement(QualificationEntry, { lang: 'fr' })));
    await click('Préciser mon projet'); await contactStep('rent'); await click('Envoyer ma demande'); expect(calls).toHaveLength(1);
    await click('Retour'); expect(host.textContent).toContain('La réception n’est pas confirmée'); expect(calls).toHaveLength(1);
    await click('Reprendre le même envoi'); expect(button('Vérifier le même envoi')).toBeTruthy(); expect(calls).toHaveLength(1);
    await click('Vérifier le même envoi'); expect(calls).toHaveLength(2); expect(calls[1]).toEqual({ ...calls[0], delivery_mode: 'recover' });
    expect(host.textContent).toContain('Votre demande a été reçue');
  });
  it('keeps unsupported storage text local instead of throwing or sending it', async () => {
    fakeFetch(); act(() => root.render(createElement(PublicQualificationForm, { lang: 'fr', onBack: vi.fn() })));
    change('Votre projet', 'buy'); change('Ville recherchée · facultatif', 'Localité\u0000fictive'); await click('Continuer');
    expect(host.querySelector('input[name="city"]')).not.toBeNull(); expect(host.textContent).toContain('Ce champ est requis ou invalide.'); expect(calls).toHaveLength(0);
  });
  it('sends only an explicitly provided public reference and never the legacy property UUID', async () => {
    fakeFetch();
    for (const [index, reference] of [undefined, 'JA-FICTIF-001'].entries()) {
      act(() => root.render(createElement(ContactForm, { key: index, lang: 'fr', propertyId: 'c9000000-0000-4000-8000-000000000001', propertyReference: reference })));
      await click('Préciser mon projet'); await contactStep('buy'); await click('Envoyer ma demande');
      expect(calls[index].property_reference).toBe(reference); expect(calls[index]).not.toHaveProperty('property_id');
      expect(JSON.stringify(calls[index])).not.toContain('c9000000-0000-4000-8000-000000000001');
    }
  });
  it('returns through an earlier step to correct invalid later fields and shows the complete recap', async () => {
    fakeFetch(); act(() => root.render(createElement(PublicQualificationForm, { lang: 'fr', onBack: vi.fn() })));
    change('Votre projet', 'buy'); change('Type de bien', 'other'); change('Précisez le type · facultatif', 'Habitat entièrement fictif'); await click('Continuer');
    change('Chambres · si pertinent', '-1'); change('Autres critères · facultatif', 'x'.repeat(501)); await click('Continuer');
    expect(host.textContent).toContain('Cette réponse est trop longue.'); await click('Retour'); await click('Continuer');
    expect((host.querySelector('input[name="criteria.bedrooms"]') as HTMLInputElement).value).toBe('-1');
    await click('Continuer'); change('Chambres · si pertinent', '2');
    expect(host.querySelector('input[name="criteria.bedrooms"]')?.getAttribute('aria-invalid')).toBe('false');
    expect(host.textContent).toContain('Cette réponse est trop longue.');
    change('Autres critères · facultatif', 'Critère fictif');
    expect(host.querySelector('[role="alert"]')).toBeNull(); await click('Continuer');
    expect(host.textContent).toContain('Habitat entièrement fictif'); expect(host.textContent).toContain('Chambres · si pertinent : 2'); expect(calls).toHaveLength(0);
  });
  it('offers a same-request submit retry only until an ambiguous response is observed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (calls.length === 1 || calls.length === 3) return new Response('{"error":"limited"}', { status: 429 });
      if (calls.length === 2) return new Response('{"ok":true}');
      return new Response(JSON.stringify({ ok: true, submission_id: body.submission_id, qualification_version: 1 }));
    }));
    act(() => root.render(createElement(PublicQualificationForm, { lang: 'fr', onBack: vi.fn() })));
    await contactStep('buy'); await click('Envoyer ma demande'); expect(calls).toHaveLength(1);
    expect(button('Réessayer le même envoi')).toBeTruthy(); await click('Réessayer le même envoi');
    expect(calls[1]).toEqual(calls[0]); expect(host.textContent).not.toContain('Réessayer le même envoi');
    await click('Vérifier le même envoi'); expect(calls[2]).toEqual({ ...calls[0], delivery_mode: 'recover' }); expect(host.textContent).not.toContain('Réessayer le même envoi');
    await click('Vérifier le même envoi'); expect(calls[3]).toEqual(calls[2]); expect(host.textContent).toContain('Votre demande a été reçue');
  });
  it('uses RTL and blocks the private form from the existing replay recorder', async () => {
    const sessionReads = vi.fn();
    const client = new ChatClient(async (input, init) => {
      expect(String(input)).toBe('/api/chat/session'); expect(init?.method).toBe('POST'); expect(init?.body).toBe('{}'); sessionReads();
      return new Response(JSON.stringify({ csrf: 'fictional-ui-token', conversation: { id: 'fictional-help', status: 'bot', version: 1, messages: [] }, attachments: [], policy: DEFAULT_POLICY, contacts: {} }));
    });
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    // Native dialog primitives only; the real widget and its explicit-open client remain mounted.
    const methods = ['show', 'showModal', 'close'] as const;
    const originals = methods.map(method => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method));
    methods.forEach(method => Object.defineProperty(HTMLDialogElement.prototype, method, { configurable: true, value: function(this: HTMLDialogElement) { this.open = method !== 'close'; } }));
    try {
      act(() => root.render(createElement(Fragment, null, createElement(QualificationEntry, { lang: 'ar' }), createElement(ChatWidget, { client }))));
      expect(sessionReads).not.toHaveBeenCalled();
      await click(t('qualification.entry', 'ar'));
      expect(host.querySelector('section')?.dir).toBe('rtl'); expect(host.querySelector('[data-chat-private][data-clarity-mask]')).not.toBeNull();
      expect(host.textContent).toContain('بحثك'); expect(host.querySelector('[data-qualification-open="true"]')).not.toBeNull();
      const help = button(t('qualification.help', 'ar')); await click(t('qualification.help', 'ar'));
      expect(sessionReads).toHaveBeenCalledTimes(1); expect(calls).toHaveLength(0);
      expect(host.querySelector('#jamm-chat-dialog')?.hasAttribute('open')).toBe(true);
      const close = host.querySelector<HTMLButtonElement>('button[aria-label="Fermer la conversation"]');
      if (!close) throw new Error('Missing real assistant close button');
      await act(async () => { close.click(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
      expect(document.activeElement).toBe(help);
      await click(t('qualification.back', 'ar'));
      expect(host.querySelector('[data-qualification-open="true"]')).toBeNull(); expect(sessionReads).toHaveBeenCalledTimes(1);
    } finally {
      methods.forEach((method, index) => { const original = originals[index]; if (original) Object.defineProperty(HTMLDialogElement.prototype, method, original); else Reflect.deleteProperty(HTMLDialogElement.prototype, method); });
    }
  });
});
