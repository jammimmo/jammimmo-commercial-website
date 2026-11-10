// @vitest-environment happy-dom
import { createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { act, Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContactForm from '../components/forms/ContactForm';
import MatchTool from '../components/match/MatchTool';
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
function change(label: string, value: string, scope: ParentNode = host) { const node = [...scope.querySelectorAll('label')].find(node => node.textContent === label); if (!node) throw new Error(`Missing field ${label}`); const input = document.getElementById(node.htmlFor) as HTMLInputElement | HTMLSelectElement; act(() => { input.value = value; Simulate.change(input); }); }
async function contactStep(operation = 'invest') { change('Votre projet', operation); await click('Continuer'); await click('Continuer'); change('Nom et prénom', 'Personne fictive Awa'); change('Numéro WhatsApp', '+221000000003'); }
function fakeFetch(lost = false) { vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); calls.push(body); if (lost && calls.length === 1) throw new Error('lost response'); return new Response(JSON.stringify({ ok: true, submission_id: body.submission_id, qualification_version: 1 }), { status: 201 }); })); }
describe('optional public qualification', () => {
  it('keeps the actual SSR launcher hidden and mounted before any geometry measurement or request', () => {
    const requests = vi.fn(async () => { throw new Error('SSR must not open a chat session'); });
    const markup = renderToString(createElement(ChatWidget, { client: new ChatClient(requests) }));
    const parsed = document.createElement('div'); parsed.innerHTML = markup;
    const launcher = parsed.querySelector<HTMLButtonElement>('.jamm-chat-launcher');
    expect(launcher).not.toBeNull(); expect(launcher!.style.visibility).toBe('hidden');
    expect(launcher!.disabled).toBe(false); expect(parsed.querySelector('#jamm-chat-dialog')).not.toBeNull();
    expect(requests).not.toHaveBeenCalled();
  });
  it.each(['data-property-contact', 'data-chat-keep-clear'])('hides the launcher over %s and restores it after scrolling away without opening a session', async marker => {
    vi.stubGlobal('innerHeight', 844);
    let contactTop = 730;
    const rectangles = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute(marker)) return new DOMRect(0, contactTop, 390, 100);
      if (this.classList.contains('jamm-chat-launcher')) return new DOMRect(20, 772, 170, 52);
      return new DOMRect();
    });
    const requests = vi.fn(async () => { throw new Error('A geometry change must not open a chat session'); });
    const client = new ChatClient(requests);
    try {
      act(() => root.render(createElement(Fragment, null, createElement('section', { [marker]: true }, 'Zone fictive à garder lisible'), createElement(ChatWidget, { client }))));
      const launcher = host.querySelector<HTMLButtonElement>('.jamm-chat-launcher')!;
      expect(launcher.style.visibility).toBe('hidden'); expect(requests).not.toHaveBeenCalled();
      contactTop = 300;
      await act(async () => { window.dispatchEvent(new Event('scroll')); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
      expect(launcher.style.visibility).toBe(''); expect(requests).not.toHaveBeenCalled();
      contactTop = 730;
      await act(async () => { window.dispatchEvent(new Event('resize')); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); });
      expect(launcher.style.visibility).toBe('hidden'); expect(requests).not.toHaveBeenCalled();
    } finally { rectangles.mockRestore(); }
  });
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
    expect(host.querySelector('a[href="/biens"]')?.textContent).toBe(t('error.browseListings', 'fr'));
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
    await click('Préciser mon projet');
    change(t('qualification.propertyType', 'fr'), 'warehouse');
    change(t('qualification.zone', 'fr'), 'Lieu privé fictif');
    change(t('qualification.max', 'fr'), '300000');
    await contactStep('rent'); await click('Envoyer ma demande'); expect(calls).toHaveLength(1);
    expect(host.querySelector('a[href^="/biens"]')).toBeNull();
    await click('Retour'); expect(host.textContent).toContain('La réception n’est pas confirmée'); expect(calls).toHaveLength(1);
    await click('Reprendre le même envoi'); expect(button('Vérifier le même envoi')).toBeTruthy(); expect(calls).toHaveLength(1);
    await click('Vérifier le même envoi'); expect(calls).toHaveLength(2); expect(calls[1]).toEqual({ ...calls[0], delivery_mode: 'recover' });
    expect(host.textContent).toContain('Votre demande a été reçue');
    expect(host.querySelector('a[href="/biens?transaction=Location&type=Hangar"]')?.textContent).toBe(t('error.browseListings', 'fr'));
  });
  it('suspends the mounted contact form until the qualified request is confirmed', async () => {
    let loseResponse: (() => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (calls.length === 1) return new Promise<Response>((_resolve, reject) => { loseResponse = () => reject(new Error('lost response')); });
      return new Response(JSON.stringify({ ok: true, submission_id: body.submission_id, qualification_version: 1 }));
    }));
    act(() => root.render(createElement(ContactForm, { lang: 'fr', propertyId: 'c9000000-0000-4000-8000-000000000001', propertyReference: 'JA-FICTIF-001' })));
    const legacyForm = host.querySelector('form')!;
    const legacySubmit = legacyForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    change(t('form.firstName', 'fr'), 'Awa');
    change(t('form.lastName', 'fr'), 'Fictive');
    change(t('form.phone', 'fr'), '+221000000004');

    await click('Préciser mon projet');
    const qualifiedForm = host.querySelector<HTMLFormElement>('[data-qualification-open="true"] form')!;
    change(t('qualification.operation', 'fr'), 'buy', qualifiedForm);
    await act(async () => { qualifiedForm.requestSubmit(); });
    expect(qualifiedForm.querySelector('[name="financing.availability"]')).not.toBeNull();
    await act(async () => { qualifiedForm.requestSubmit(); });
    change(t('qualification.name', 'fr'), 'Personne fictive Awa', qualifiedForm);
    change(t('qualification.phone', 'fr'), '+221000000003', qualifiedForm);
    await act(async () => { qualifiedForm.requestSubmit(); });
    await click('Retour');
    expect(legacyForm.isConnected).toBe(true);
    expect(legacyForm.closest('[hidden]')).not.toBeNull();
    expect(legacySubmit.disabled).toBe(true);
    await act(async () => { Simulate.submit(legacyForm); });
    expect(calls).toHaveLength(1);

    await act(async () => { loseResponse!(); });
    expect(legacyForm.closest('[hidden]')).not.toBeNull();
    expect(legacySubmit.disabled).toBe(true);
    expect(host.textContent).toContain('La réception n’est pas confirmée');
    await click('Reprendre le même envoi'); await click('Vérifier le même envoi');
    expect(calls).toEqual([calls[0], { ...calls[0], delivery_mode: 'recover' }]);
    await click('Retour');
    expect(host.querySelector('form')).toBe(legacyForm);
    expect(legacyForm.closest('[hidden]')).toBeNull();
    expect(legacySubmit.disabled).toBe(false);
    expect(legacyForm.querySelector<HTMLInputElement>('#first_name')?.value).toBe('Awa');
    expect(legacyForm.querySelector<HTMLInputElement>('#phone')?.value).toBe('+221000000004');
  });
  it('keeps MatchTool results but suspends its alternate lead capture during recovery', async () => {
    fakeFetch(true);
    act(() => root.render(createElement(MatchTool, { lang: 'fr', properties: [], hrefByRef: {} })));
    await click(t('match.transaction.acheter', 'fr'));
    for (let step = 0; step < 4; step++) await click(t('match.next', 'fr'));
    await click(t('match.seeResult', 'fr'));
    const alternateCapture = t('match.result.cta', 'fr');
    await click(alternateCapture);
    change(t('match.capture.firstName', 'fr'), 'Awa');
    change(t('match.capture.whatsapp', 'fr'), '+221000000004');
    await click(t('match.capture.back', 'fr'));

    await click('Préciser mon projet'); await contactStep('buy'); await click('Envoyer ma demande');
    await click('Retour');
    expect(host.textContent).not.toContain(alternateCapture);
    expect(button(t('match.result.edit', 'fr'))).toBeTruthy();
    expect(calls).toHaveLength(1);
    await click('Reprendre le même envoi'); await click('Vérifier le même envoi');
    expect(calls).toEqual([calls[0], { ...calls[0], delivery_mode: 'recover' }]);
    await click('Retour'); await click(alternateCapture);
    expect(host.querySelector<HTMLInputElement>('#match-firstname')?.value).toBe('Awa');
    expect(host.querySelector<HTMLInputElement>('#match-phone')?.value).toBe('+221000000004');
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
