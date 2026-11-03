import { test, expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { selection, root, origin } from '../../qa/public-qualification/selection.mjs';
import type { SessionResponse } from '../../src/components/chat/chat-client';

const selected = selection();
const qualification = (page: Page) => page.locator('section[data-chat-private][data-rrweb-mask][data-clarity-mask="true"]:visible');
const button = (page: Page, name: string) => qualification(page).getByRole('button', { name, exact: true });
const submitted: Record<string, unknown>[] = [];
const blocked: { origin: string; path: string }[] = [];
const forbidden: string[] = [];
const pageErrors: string[] = [];
let permitAnonymousSession = false;
let anonymousSessionRequests = 0;
const anonymousSession: SessionResponse = {
  csrf: 'qa-model-only-anonymous-session',
  conversation: { id: 'fa000000-0000-4000-8000-000000000005', status: 'bot', version: 1, messages: [] },
  policy: { enabled: true, welcome: 'Session entièrement fictive de recette locale.', retentionDays: 30,
    files: { enabled: false, maxCount: 3, maxBytes: 5_242_880, totalBytes: 15_728_640,
      types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], retentionHours: 24 } },
  contacts: {}, attachments: [],
};
const hashes = () => Object.fromEntries(Object.keys(selected.pins).map(path =>
  [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));

test.beforeEach(async ({ context, page }) => {
  expect(hashes()).toEqual(selected.pins);
  await test.info().attach('frozen-source-before.json', { body: JSON.stringify({ provenance: selected.provenance,
    profile: selected.profile, flow: selected.flow, lang: selected.lang, pins: selected.pins }), contentType: 'application/json' });
  submitted.length = blocked.length = forbidden.length = pageErrors.length = 0;
  permitAnonymousSession = false; anonymousSessionRequests = 0;
  page.on('pageerror', error => pageErrors.push(error.name));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      blocked.push({ origin: url.origin, path: url.pathname });
      // ContactSection's real agency map may request its ordinary map style;
      // these stay blocked and blank. Every other external attempt is a failure.
      if (url.origin !== 'https://tiles.openfreemap.org') forbidden.push('unexpected-external-origin');
      return route.abort();
    }
    if (url.pathname === '/api/chat/session') {
      anonymousSessionRequests++;
      if (selected.profile !== 'desktop' || !permitAnonymousSession || anonymousSessionRequests !== 1
        || request.method() !== 'POST' || request.postData() !== '{}' || url.search
        || request.headers()['content-type'] !== 'application/json' || request.headers()['x-chat-csrf'] !== undefined
        || !(await page.locator('#jamm-chat-dialog').evaluate(node => (node as HTMLDialogElement).open))) {
        forbidden.push('unexpected-anonymous-session'); return route.abort();
      }
      permitAnonymousSession = false;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(anonymousSession) });
    }
    if (url.pathname === '/api/leads' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      submitted.push(body);
      if (!body.qualification || !body.submission_id || !['submit', 'recover'].includes(String(body.delivery_mode))) {
        forbidden.push('unexpected-lead-shape'); return route.abort();
      }
      // Closed transport port: first request has ambiguous delivery only in the
      // landscape selection. This models no server, commit or database result.
      if (selected.flow === 'unknown-recover' && submitted.length === 1) return route.abort('failed');
      return route.fulfill({ status: body.delivery_mode === 'recover' ? 200 : 201, contentType: 'application/json',
        body: JSON.stringify({ ok: true, submission_id: body.submission_id, qualification_version: 1 }) });
    }
    if (url.pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method())) {
      forbidden.push(request.method() + ' ' + url.pathname); return route.abort();
    }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  await test.info().attach('closed-ports.json', { body: JSON.stringify({ externalBlockedBeforeDelivery: blocked,
    forbiddenLocalAttempts: forbidden, leadRequestCount: submitted.length, anonymousSessionRequests, pageErrors,
    limitation: 'Fictitious qualified POST and one explicit anonymous chat-session port only; no server/provider proof. No POST body is attached.' }), contentType: 'application/json' });
  expect(forbidden).toEqual([]); expect(pageErrors).toEqual([]);
  const after = hashes(); await test.info().attach('frozen-source-after.json', { body: JSON.stringify(after), contentType: 'application/json' });
  expect(after).toEqual(selected.pins);
  if (!page.isClosed()) {
    expect(new URL(page.url()).search).toBe('');
    const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).not.toContain('Personne fictive'); expect(storage).not.toContain('+221000000003');
  }
});

async function resting(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)));
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
  });
}
async function painted(target: Locator) {
  return target.evaluate(node => {
    const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    let opaque = true;
    for (let p: Element | null = node; p; p = p.parentElement) if (Number(getComputedStyle(p).opacity) < .99 || getComputedStyle(p).visibility !== 'visible') opaque = false;
    const top = document.elementFromPoint(x, y);
    return { fits: r.top >= 80 && r.bottom <= innerHeight - 3 && r.left >= 0 && r.right <= innerWidth,
      painted: opaque && !!top && (node === top || node.contains(top)),
      y: r.top, width: r.width, height: r.height, layoutWidth: (node as HTMLElement).offsetWidth,
      layoutHeight: (node as HTMLElement).offsetHeight, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
  });
}
async function reach(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  if (selected.mobile) {
    // Acquire native focus first; pending focus-scroll must not restart Tab.
    // Then use real wheel input in the page gutter, sized from viewport edges.
    // This is keyboard + wheel emulation, with no injected scroll/touch claim.
    for (let i = 0; i < 110; i++) {
      if (await target.evaluate(node => node === document.activeElement)) break;
      await page.keyboard.press('Alt+Tab');
    }
    await resting(page);
    for (let i = 0; i < 24; i++) {
      const state = await painted(target); if (state.fits) break;
      const distance = state.y < 80 ? -Math.ceil(80 - state.y)
        : Math.max(0, Math.ceil(state.y + state.height - selected.height + 3));
      await page.mouse.move(8, selected.height / 2);
      await page.mouse.wheel(0, distance);
      await resting(page);
    }
    await expect(target).toBeFocused();
  } else {
    for (let i = 0; i < 24; i++) {
      const state = await painted(target); if (state.fits) break;
      await page.mouse.move(selected.width / 2, selected.height / 2);
      await page.mouse.wheel(0, state.y < 80 ? -400 : 400);
      await resting(page);
    }
  }
  await resting(page);
  const state = await painted(target);
  expect(state.fits, 'The whole action must fit in the real viewport below the existing header').toBe(true);
  expect(state.painted, 'The action must be opaque and pass a real center-point hit test').toBe(true);
  return state;
}
async function action(page: Page, name: string) { const target = button(page, name); await reach(page, target); await target.click(); }
async function launcherHidden(page: Page) {
  const launcher = page.locator('.jamm-chat-launcher');
  await expect(launcher).toHaveCount(1);
  await expect(launcher).toBeHidden();
  expect(await launcher.evaluate(node => getComputedStyle(node).visibility)).toBe('hidden');
}
async function unobstructedActions(page: Page, forward: string, label: string) {
  await launcherHidden(page);
  const rows = [];
  for (const name of ['Retour', forward]) {
    const target = button(page, name), state = await painted(target);
    expect(state.fits, name + ' must fit entirely').toBe(true); expect(state.painted).toBe(true);
    const clearPoints = await target.evaluate(node => {
      const r = node.getBoundingClientRect(), inset = Math.min(8, r.width / 4, r.height / 4);
      return [[r.left + inset, r.top + inset], [r.right - inset, r.top + inset],
        [r.left + inset, r.bottom - inset], [r.right - inset, r.bottom - inset], [r.left + r.width / 2, r.top + r.height / 2]]
        .map(([x, y]) => { const hit = document.elementFromPoint(x, y); return !!hit && (hit === node || node.contains(hit)); });
    });
    expect(clearPoints.every(Boolean), name + ' must be unobstructed at all four inset corners and center').toBe(true);
    rows.push({ name, state, clearPoints });
  }
  await test.info().attach(label + '-action-hit-tests.json', { body: JSON.stringify(rows), contentType: 'application/json' });
}
async function readStatus(page: Page) {
  const status = qualification(page).getByRole('status');
  const journal: { iteration: number | 'final'; state: Awaited<ReturnType<typeof painted>>;
    input: { method: 'wheel'; x: number; y: number; deltaX: number; deltaY: number } | null }[] = [];
  for (let i = 0; i < 50; i++) {
    const state = await painted(status);
    if (state.fits) {
      if (selected.mobile) journal.push({ iteration: i, state, input: null });
      break;
    }
    if (selected.mobile) {
      const distance = state.y < 80 ? -Math.ceil(80 - state.y)
        : Math.max(0, Math.ceil(state.y + state.height - selected.height + 3));
      const input = { method: 'wheel' as const, x: 8, y: selected.height / 2, deltaX: 0, deltaY: distance };
      journal.push({ iteration: i, state, input });
      // Native gutter wheel only: no focus/DOM scroll injection or touch claim.
      await page.mouse.move(input.x, input.y);
      await page.mouse.wheel(input.deltaX, input.deltaY);
      await resting(page);
    } else await page.mouse.wheel(0, state.y < 80 ? -200 : 200);
  }
  await resting(page);
  const state = await painted(status);
  if (selected.mobile) {
    journal.push({ iteration: 'final', state, input: null });
    const sequence = test.info().attachments.filter(item => item.name.startsWith('status-scroll-journal-')).length + 1;
    await test.info().attach(`status-scroll-journal-${sequence}.json`, { body: JSON.stringify({ profile: selected.profile,
      flow: selected.flow, viewport: { width: selected.width, height: selected.height }, journal }), contentType: 'application/json' });
  }
  expect(state.fits).toBe(true); expect(state.painted).toBe(true);
}
async function capture(page: Page, name: string) {
  await resting(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(selected.width + 1);
  const file = test.info().outputPath(name + '.png');
  // All film input is explicitly fictitious. Screenshots additionally mask
  // editable free values; no CSS or product animation is altered for capture.
  await page.screenshot({ path: file, fullPage: false, mask: [page.locator('input:not([type="checkbox"]):not([type="radio"]), textarea')] });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
}
async function field(page: Page, name: string, value: string) {
  const target = qualification(page).getByLabel(name, { exact: true });
  await reach(page, target); await target.fill(value);
}
async function choose(page: Page, name: string, value: string) {
  const target = qualification(page).getByLabel(name, { exact: true });
  await reach(page, target); await target.selectOption(value);
}
async function next(page: Page) {
  await action(page, 'Continuer');
  await expect(qualification(page).getByRole('heading', { name: 'Préciser mon projet', exact: true })).toBeFocused();
}
async function checkControls(page: Page) {
  const measurements = await qualification(page).locator('button, select, input:not([type="checkbox"]), textarea, label:has(input[type="checkbox"])').evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(); return { tag: node.tagName, width: r.width, height: r.height,
      layoutWidth: (node as HTMLElement).offsetWidth, layoutHeight: (node as HTMLElement).offsetHeight };
  }));
  for (const item of measurements) { expect(item.layoutWidth).toBeGreaterThanOrEqual(44); expect(item.layoutHeight).toBeGreaterThanOrEqual(44);
    expect(Math.round(item.height * 1000) / 1000).toBeGreaterThanOrEqual(44); }
  await test.info().attach('44px-' + (await qualification(page).locator('[aria-current="step"]').innerText()).slice(0, 1) + '.json',
    { body: JSON.stringify(measurements), contentType: 'application/json' });
}
async function identity(page: Page) {
  await field(page, 'Nom et prénom', 'Personne fictive de recette');
  await field(page, 'Numéro WhatsApp', '+221000000003');
  expect(await qualification(page).locator('input[name="full_name"]').getAttribute('data-rrweb-mask')).not.toBeNull();
  expect(await qualification(page).locator('input[name="phone"]').getAttribute('data-clarity-mask')).toBe('true');
}

// One selected test, never a generated orientation/operation matrix.
test(`${selected.profile} · ${selected.flow} · ${selected.lang}`, async ({ page }) => {
  expect((await page.goto(selected.path))?.status()).toBe(200);
  await resting(page);
  if (selected.profile === 'desktop') {
    const buy = page.getByRole('button', { name: 'Acheter', exact: true }); await reach(page, buy); await buy.click();
    for (let step = 0; step < 4; step++) { const advance = page.getByRole('button', { name: 'Continuer', exact: true }); await reach(page, advance); await advance.click(); }
    const result = page.getByRole('button', { name: 'Voir mes biens', exact: true }); await reach(page, result); await result.click();
    await expect(page.getByRole('link', { name: /Appartement FICTIF de recette/ })).toHaveCount(3);
    expect(submitted).toHaveLength(0); await capture(page, '01-free-match-three-fictitious-properties');
  }
  const entry = page.getByRole('button', { name: 'Préciser mon projet', exact: true });
  await reach(page, entry); await entry.click(); await expect(qualification(page)).toBeVisible();
  await launcherHidden(page); expect(anonymousSessionRequests).toBe(0);
  if (selected.profile === 'desktop') await expect(qualification(page).getByLabel('Votre projet', { exact: true })).toHaveValue('buy');
  else await choose(page, 'Votre projet', selected.profile === 'portrait' ? 'lease_management' : 'rent');
  await checkControls(page); await capture(page, '02-qualification-project');
  if (selected.profile === 'desktop') {
    const help = qualification(page).getByRole('button', { name: 'Besoin d’aide ?', exact: true });
    await reach(page, help); expect(anonymousSessionRequests).toBe(0);
    permitAnonymousSession = true; await help.click();
    const dialog = page.locator('#jamm-chat-dialog');
    await expect(dialog).toBeVisible(); await expect(dialog).toHaveJSProperty('open', true);
    await expect.poll(() => anonymousSessionRequests).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Parler à un conseiller', exact: true })).toBeEnabled();
    expect(submitted).toHaveLength(0); await capture(page, '02b-explicit-inline-help-open');
    await dialog.getByRole('button', { name: 'Fermer la conversation', exact: true }).click();
    await expect(dialog).toBeHidden(); await expect(help).toBeFocused();
    await launcherHidden(page);
    const helpView = await painted(help); expect(helpView.fits).toBe(true); expect(helpView.painted).toBe(true);
    expect(anonymousSessionRequests).toBe(1); expect(submitted).toHaveLength(0);
    await capture(page, '02c-inline-help-return-focus');
  }
  if (selected.profile === 'portrait') {
    await field(page, 'Ville recherchée · facultatif', 'Ville fictive');
    await field(page, 'Budget minimum · facultatif', '400'); await field(page, 'Budget maximum · facultatif', '200');
    await action(page, 'Continuer');
    const rangeError = qualification(page).getByText('Le budget minimum ne peut pas dépasser le maximum.', { exact: true });
    await expect(rangeError).toBeVisible();
    expect(submitted).toHaveLength(0); await reach(page, button(page, 'Continuer'));
    const rangeView = await painted(rangeError);
    expect(rangeView.fits, 'The actual range error must fit in the viewport before capture03').toBe(true);
    expect(rangeView.painted, 'The actual range error must be opaque and pass its center hit test').toBe(true);
    await capture(page, '03-budget-error');
    await field(page, 'Budget maximum · facultatif', '600'); await next(page);
    await field(page, 'Chambres · si pertinent', '-1');
    await action(page, 'Retour'); await expect(qualification(page).getByLabel('Ville recherchée · facultatif', { exact: true })).toHaveValue('Ville fictive');
    await capture(page, '04-back-preserves-draft'); await next(page);
    await expect(qualification(page).getByLabel('Chambres · si pertinent', { exact: true })).toHaveValue('-1');
    await action(page, 'Continuer');
    await expect(qualification(page).getByLabel('Chambres · si pertinent', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    expect(submitted).toHaveLength(0); await reach(page, qualification(page).getByLabel('Chambres · si pertinent', { exact: true }));
    await capture(page, '04b-criteria-error-after-return');
    await field(page, 'Chambres · si pertinent', '2');
  } else await next(page);
  await choose(page, 'Financement disponible ?', 'no');
  await checkControls(page); await reach(page, button(page, 'Continuer')); await unobstructedActions(page, 'Continuer', 'criteria'); await capture(page, '05-criteria-last-action');
  await next(page); await checkControls(page);
  if (selected.profile === 'portrait') {
    await action(page, 'Envoyer ma demande');
    await expect(qualification(page).locator('input[name="full_name"]')).toHaveAttribute('aria-invalid', 'true');
    expect(submitted).toHaveLength(0); await reach(page, qualification(page).getByLabel('Nom et prénom', { exact: true }));
    await capture(page, '06-identity-error');
  }
  await identity(page);
  const submit = button(page, 'Envoyer ma demande'); await reach(page, submit);
  await unobstructedActions(page, 'Envoyer ma demande', 'submit');
  if (selected.mobile) {
    const ring = await submit.evaluate(node => getComputedStyle(node).boxShadow);
    expect(ring).not.toBe('none'); await expect(submit).toBeFocused();
  }
  await capture(page, '07-review-submit-visible'); await submit.click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0]).not.toHaveProperty('property_id');
  expect(submitted[0]).toMatchObject({ delivery_mode: 'submit', qualification: { financing: { availability: 'no' } } });
  if (selected.flow === 'unknown-recover') {
    await expect(qualification(page).getByRole('status')).toContainText('La réception n’est pas confirmée');
    await reach(page, button(page, 'Vérifier le même envoi')); await unobstructedActions(page, 'Vérifier le même envoi', 'recover'); await capture(page, '08a-unknown-last-action');
    await readStatus(page); await capture(page, '08b-unknown-no-ack');
    await action(page, 'Retour'); expect(submitted).toHaveLength(1);
    const resume = page.getByRole('button', { name: 'Reprendre le même envoi', exact: true });
    await reach(page, resume); await expect(resume).toBeFocused(); await capture(page, '09-closed-unknown-resume');
    await resume.click(); expect(submitted).toHaveLength(1);
    await expect(qualification(page).locator('input[name="full_name"]')).toBeDisabled();
    await action(page, 'Vérifier le même envoi'); await expect.poll(() => submitted.length).toBe(2);
    expect(submitted[1]).toEqual({ ...submitted[0], delivery_mode: 'recover' });
  }
  await expect(qualification(page).getByRole('status')).toContainText('Votre demande a été reçue');
  await reach(page, button(page, 'Retour')); await readStatus(page); await capture(page, '10-exact-ack-accepted');
  expect(submitted).toHaveLength(selected.flow === 'unknown-recover' ? 2 : 1);
  expect(anonymousSessionRequests).toBe(selected.profile === 'desktop' ? 1 : 0);
});
