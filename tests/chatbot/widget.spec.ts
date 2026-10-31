import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourceFiles = ['src/components/chat/ChatWidget.tsx', 'src/components/chat/ChatWidgetFixture.tsx',
  'src/components/chat/chat.css', 'src/components/chat/chat-client.ts', 'src/lib/site-config.ts',
  'src/pages/qa/chatbot.astro', 'src/styles/globals.css', 'tests/chatbot/widget.spec.ts', 'playwright.chatbot.config.ts'];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
let frozenInputs: Record<string, string>;

let externalRequests: string[] = [];
let localChatRequests: string[] = [];
let scrollInputSequence = 0;
test.beforeEach(async ({ context, baseURL }) => {
  scrollInputSequence = 0;
  frozenInputs = sourceHashes();
  await test.info().attach('selected-source-before.json', { body: JSON.stringify({ sourceHashes: frozenInputs,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', env: { ...process.env, GH_CONFIG_DIR: '/Users/solutionmakers/.config/gh-jammimmo' } }).trim(),
    node: process.version, selectedInputsOnly: true, transitiveInventory: false,
    expectedMotion: process.env.CHAT_UI_MOTION === 'reduce' ? 'reduce' : 'no-preference' }), contentType: 'application/json' });
  externalRequests = [];
  localChatRequests = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/chat/')) localChatRequests.push(url.pathname);
  });
  const localOrigin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== localOrigin) {
      externalRequests.push(url.origin + url.pathname);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/chat/')) return route.abort();
    return route.continue();
  });
});
test.afterEach(async () => {
  expect(externalRequests, 'UI fixture must never attempt a provider or Auth request').toEqual([]);
  expect(localChatRequests, 'Every fixture case must prove zero attempted local chat API calls').toEqual([]);
  const after = sourceHashes();
  await test.info().attach('selected-source-after.json', { body: JSON.stringify(after), contentType: 'application/json' });
  expect(after, 'No source/style edit may occur during recording').toEqual(frozenInputs);
});

async function openChat(page: Page, files = false) {
  await page.route('**/api/chat/**', route => route.abort());
  const response = await page.goto(files ? '/qa/chatbot?files=simulated' : '/qa/chatbot');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('RECETTE LOCALE · DONNÉES FICTIVES · AUCUN ENVOI')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir l’assistant Jamm Immo' }).click();
  await expect(page.getByRole('button', { name: 'Parler à un conseiller', exact: true })).toBeEnabled();
  await expect(page.locator('.jamm-chat-dialog')).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(process.env.CHAT_UI_MOTION === 'reduce');
}

async function dialogStyle(page: Page) {
  return page.locator('.jamm-chat-dialog').evaluate(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    const parents: Array<{ tag: string; opacity: string }> = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) parents.push({ tag: parent.tagName, opacity: getComputedStyle(parent).opacity });
    return { open: (element as HTMLDialogElement).open, opacity: Number(style.opacity), background: style.backgroundColor,
      palette: style.getPropertyValue('--chat-sand'), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      modal: element.matches(':modal'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, parents };
  });
}
async function capture(page: Page, name: string) {
  const before = await dialogStyle(page);
  if (before.open) {
    await page.locator('.jamm-chat-dialog').evaluate(async element => {
      await document.fonts.ready;
      await Promise.all(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => undefined)));
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    const after = await dialogStyle(page);
    await test.info().attach(name + '-resting-style.json', { body: JSON.stringify({ before, after }), contentType: 'application/json' });
    expect(after.opacity, 'Capture the resting product without changing its normal animation').toBe(1);
    expect(after.parents.every(parent => Number(parent.opacity) === 1), 'No transparent ancestor may hide the panel').toBe(true);
    expect(after.background, 'Resting reading surface must be opaque').toMatch(/^rgb\(|^rgba\([^,]+,[^,]+,[^,]+,\s*1\)$/);
  }
  const file = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
}

async function latestExchangeInViewport(page: Page) {
  await expect.poll(async () => page.locator('.jamm-chat-messages').evaluate(group => {
    const region = group.closest('.jamm-chat-transcript')!;
    const frame = region.getBoundingClientRect(), style = getComputedStyle(region);
    const top = frame.top + region.clientTop + parseFloat(style.paddingTop);
    const bottom = Math.min(innerHeight, frame.top + region.clientTop + region.clientHeight - parseFloat(style.paddingBottom));
    const last = group.lastElementChild;
    if (!last) return false;
    const rect = last.getBoundingClientRect();
    const start = group.querySelector('[data-chat-exchange-start]')?.getBoundingClientRect().top ?? rect.top;
    if (rect.bottom - start <= bottom - top) return start >= top - 1 && rect.bottom <= bottom + 1;
    const text = last.querySelector('p')?.firstChild;
    if (!text) return false;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(12, text.textContent?.length ?? 0));
    const first = range.getBoundingClientRect();
    return first.top >= top - 1 && first.bottom <= bottom + 1;
  }), { message: 'Latest question/reply, or first reply line when long, must be painted in the transcript viewport' }).toBe(true);
}

async function fullToolbar(page: Page) {
  await page.locator('.jamm-chat-dialog').evaluate(async element => {
    await document.fonts.ready;
    await Promise.all(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => undefined)));
  });
  const toolbar = page.locator('.jamm-chat-tools');
  for (const name of ['Parler à un conseiller', 'WhatsApp', 'Effacer']) {
    const target = name === 'WhatsApp' ? toolbar.getByRole('link', { name: /WhatsApp/ }) : toolbar.getByRole('button', { name, exact: true });
    await expect(target).toBeInViewport({ ratio: 1 });
    const geometry = await target.evaluate(element => ({ width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height, inner: element.clientWidth, scroll: element.scrollWidth,
      layoutHeight: (element as HTMLElement).offsetHeight, layoutWidth: (element as HTMLElement).offsetWidth }));
    await test.info().attach(`toolbar-${name}.json`, { body: JSON.stringify(geometry), contentType: 'application/json' });
    // WebKit rect subtraction can report 43.9999847 for a 44px layout box.
    // Keep the 44px layout contract and compare rendered geometry at 0.001px precision.
    expect(geometry.layoutHeight).toBeGreaterThanOrEqual(44); expect(geometry.layoutWidth).toBeGreaterThanOrEqual(44);
    expect(Math.round(geometry.height * 1000) / 1000).toBeGreaterThanOrEqual(44);
    expect(Math.round(geometry.width * 1000) / 1000).toBeGreaterThanOrEqual(44);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.inner + 1);
  }
}

async function receiptBeginningInViewport(page: Page) {
  await expect.poll(async () => page.locator('.jamm-chat-receipt p').first().evaluate(paragraph => {
    const region = paragraph.closest('.jamm-chat-transcript')!;
    const frame = region.getBoundingClientRect(), style = getComputedStyle(region);
    const top = frame.top + region.clientTop + parseFloat(style.paddingTop);
    const bottom = frame.top + region.clientTop + region.clientHeight - parseFloat(style.paddingBottom);
    const text = paragraph.firstChild;
    if (!text) return false;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(12, text.textContent?.length ?? 0));
    const first = range.getBoundingClientRect();
    return first.top >= top - 1 && first.bottom <= Math.min(innerHeight, bottom) + 1;
  }), { message: 'The handoff receipt must start inside the visible transcript, not beyond old attachments' }).toBe(true);
}

async function transcriptScrollInput(page: Page, direction: number, step: number, target?: ReturnType<Page['locator']>) {
  const region = page.locator('.jamm-chat-transcript');
  const beforeFocus = await region.evaluate(element => element.scrollTop);
  const documentBefore = await page.evaluate(() => scrollY);
  let before = beforeFocus;
  let keyCount = 0;
  const keyboard = test.info().project.use.browserName === 'webkit' && test.info().project.use.isMobile;
  if (keyboard) {
    let focused = await region.evaluate(owner => document.activeElement === owner);
    // The product log is a named, keyboard-focusable scroll region. Reach it
    // through native Tab order, including when only read-only files are visible.
    for (let attempt = 0; !focused && attempt < 24; attempt++) {
      await page.keyboard.press('Tab');
      focused = await region.evaluate(owner => document.activeElement === owner);
    }
    expect(focused, 'The conversation log must be reachable by native keyboard Tab').toBe(true);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    before = await region.evaluate(element => element.scrollTop);
    // Tab can itself scroll a later form control into view before cycling to
    // the log. Do not demand an impossible further ArrowDown at the bottom.
    if (target && (await transcriptTargetState(target)).fits) {
      let lastGeometry = '', stableTarget = 0;
      await expect.poll(async () => {
        const state = await transcriptTargetState(target), geometry = JSON.stringify(state.geometry);
        if (!state.fits || geometry !== lastGeometry) { lastGeometry = geometry; stableTarget = 0; return false; }
        return ++stableTarget >= 2;
      }, { timeout: 3_000, intervals: [50], message: 'Native Tab must leave the whole action stably painted' }).toBe(true);
      await test.info().attach(`scroll-input-${++scrollInputSequence}.json`, { body: JSON.stringify({ beforeFocus, before,
        after: await region.evaluate(element => element.scrollTop), keyCount: 0, method: 'native Tab reached the complete action before Arrow input',
        target: await transcriptTargetState(target), domScrollInjected: false }), contentType: 'application/json' });
      expect(await page.evaluate(() => scrollY), 'Native Tab must not scroll the page behind the chat').toBe(documentBefore);
      return;
    }
    const pageStep = step >= 1000;
    keyCount = pageStep ? 1 : Math.max(1, Math.min(8, Math.floor(step / 40)));
    for (let index = 0; index < keyCount; index++) {
      await page.keyboard.press(direction < 0 ? pageStep ? 'PageUp' : 'ArrowUp' : pageStep ? 'PageDown' : 'ArrowDown', { delay: 60 });
    }
  } else {
    const frame = await region.boundingBox();
    await page.mouse.move(frame!.x + frame!.width / 2, frame!.y + frame!.height / 2);
    await page.mouse.wheel(0, direction * step);
  }
  let previous = -1, stable = 0;
  try { await expect.poll(async () => {
    const next = await region.evaluate(element => element.scrollTop);
    if ((next - before) * direction <= 1) { previous = next; stable = 0; return false; }
    if (next !== previous) { previous = next; stable = 0; return false; }
    return ++stable >= 2;
  }, { timeout: 3_000, intervals: [50], message: 'Real transcript input must settle before measuring' }).toBe(true); }
  catch (failure) {
    await test.info().attach(`scroll-input-${++scrollInputSequence}-failed.json`, { body: JSON.stringify({ beforeFocus, before,
      direction, step, keyCount, documentBefore, documentAfter: await page.evaluate(() => scrollY),
      region: await region.evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight, focused: document.activeElement === element, overflowY: getComputedStyle(element).overflowY })),
      target: target ? await transcriptTargetState(target) : null, domScrollInjected: false }), contentType: 'application/json' });
    throw failure;
  }
  const after = await region.evaluate(element => element.scrollTop);
  await test.info().attach(`scroll-input-${++scrollInputSequence}.json`, { body: JSON.stringify({ beforeFocus, before, after, keyCount, keyDwellMs: keyboard ? 60 : null, requestedStep: step, documentBefore, documentAfter: await page.evaluate(() => scrollY),
    method: keyboard ? 'native Tab to named log, then Arrow/Page input in mobile WebKit emulation; no touch/swipe claim' : 'native mouse wheel',
    domScrollInjected: false }), contentType: 'application/json' });
  expect((after - before) * direction, 'The real input must move the transcript in the requested direction after focus').toBeGreaterThan(1);
  expect(await page.evaluate(() => scrollY), 'Transcript input must not scroll the page behind the chat').toBe(documentBefore);
}

async function transcriptTargetState(target: ReturnType<Page['locator']>) {
  return target.evaluate(element => {
    const owner = element.closest('.jamm-chat-transcript')!;
    const box = owner.getBoundingClientRect(), rect = element.getBoundingClientRect(), style = getComputedStyle(owner);
    const top = Math.max(0, box.top + owner.clientTop + parseFloat(style.paddingTop));
    const bottom = Math.min(innerHeight, box.top + owner.clientTop + owner.clientHeight - parseFloat(style.paddingBottom));
    const left = Math.max(0, box.left + owner.clientLeft + parseFloat(style.paddingLeft));
    const right = Math.min(innerWidth, box.left + owner.clientLeft + owner.clientWidth - parseFloat(style.paddingRight));
    return { fits: rect.width > 0 && rect.height > 0 && rect.top >= top && rect.bottom <= bottom && rect.left >= left && rect.right <= right,
      direction: rect.top < top ? -1 : 1, step: Math.max(50, owner.clientHeight * .55),
      geometry: [rect.top, rect.bottom, rect.left, rect.right, top, bottom, left, right, owner.scrollTop, owner.clientHeight] };
  });
}

async function reachTranscript(page: Page, target: ReturnType<Page['locator']>) {
  await expect(target).toBeVisible();
  for (let attempt = 0; attempt < 16; attempt++) {
    const state = await transcriptTargetState(target);
    if (state.fits) return;
    await transcriptScrollInput(page, state.direction, state.step, target);
  }
  throw new Error('Important chat action remains unreachable by bounded user scrolling');
}

test('integrated conversation, precise sources, handoff and private controls', async ({ page }) => {
  const network: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/chat/')) network.push(request.url()); });
  await openChat(page);
  await capture(page, '01-welcome');
  await expect(page.locator('[data-chat-private]')).toHaveAttribute('data-clarity-mask', 'true');
  await expect(page.locator('[data-chat-private]')).toHaveClass(/rr-block/);
  const bounds = await page.locator('.jamm-chat-dialog').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.getByRole('textbox', { name: 'Votre question à Jamm Immo' }).fill('Quels outils peuvent m’aider ?');
  await page.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(page.getByRole('link', { name: /Les outils pour votre projet/ })).toHaveAttribute('href', '/outils');
  await latestExchangeInViewport(page);
  await capture(page, '02-grounded-answer');
  const sourceLink = page.getByRole('link', { name: /Les outils pour votre projet/ });
  await reachTranscript(page, sourceLink); await expect(sourceLink).toBeInViewport({ ratio: 1 });
  await capture(page, '02b-citation-reached');
  await page.getByRole('button', { name: 'Parler à un conseiller', exact: true }).click();
  await page.getByLabel('Votre prénom').fill('Visiteur de recette');
  await page.getByLabel('Ce que vous souhaitez savoir').fill('Je souhaite préciser mon projet avec l’équipe.');
  await page.getByLabel(/J’accepte de transmettre/).check();
  await reachTranscript(page, page.getByRole('button', { name: 'Transmettre ma demande', exact: true }));
  await expect(page.getByRole('button', { name: 'Fermer la conversation' })).toBeInViewport({ ratio: 1 });
  await capture(page, '03-handoff-form');
  await page.getByRole('button', { name: 'Transmettre ma demande', exact: true }).click();
  await expect(page.getByText('Votre demande est enregistrée. Sa transmission à l’équipe est en attente.')).toBeVisible();
  await receiptBeginningInViewport(page);
  await expect(page.getByRole('button', { name: 'Fermer la conversation' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByText(/email envoyé/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Joindre un fichier' })).toHaveCount(0);
  await capture(page, '04-recorded-not-notified');
  await page.getByRole('button', { name: 'Fermer la conversation' }).click();
  await expect(page.getByRole('button', { name: 'Ouvrir l’assistant Jamm Immo' })).toBeFocused();
  expect(network).toEqual([]); // fixture never contacts the production or local API
});

test('SIMULATED files retain selected metadata, retry the same upload and charge rejected files', async ({ page }) => {
  await openChat(page, true);
  await page.getByRole('button', { name: 'Fermer la conversation' }).click();
  await expect(page.getByText('PIÈCES JOINTES SIMULÉES · AUCUN SCAN ANTIVIRUS · AUCUN FICHIER TRANSMIS')).toBeVisible();
  await capture(page, 'files-00-explicit-simulation');
  await page.getByRole('button', { name: 'Ouvrir l’assistant Jamm Immo' }).click();
  await page.getByRole('button', { name: 'Parler à un conseiller', exact: true }).click();
  const input = page.locator('input[type=file]');
  const list = page.getByRole('list', { name: 'Pièces jointes' });
  await input.setInputFiles({ name: 'SIMULATION-plan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(512 * 1024, 0x41) });
  const first = list.getByRole('listitem').filter({ hasText: 'SIMULATION-plan.pdf' });
  await expect(first).toContainText('512 Kio · En attente d’analyse');
  await reachTranscript(page, first); await capture(page, 'files-01-name-size-quarantine');
  await input.setInputFiles({ name: 'SIMULATION-accuse-perdu.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(64 * 1024, 0x41) });
  await expect(page.getByRole('alert')).toContainText('même envoi');
  await capture(page, 'files-02-uncertain-upload');
  await page.getByRole('button', { name: 'Réessayer le même envoi' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').filter({ hasText: 'SIMULATION-accuse-perdu.pdf' })).toContainText('64 Kio · En attente d’analyse');
  await input.setInputFiles({ name: 'SIMULATION-refus-antivirus.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(64 * 1024, 0x41) });
  const rejected = list.getByRole('listitem').filter({ hasText: 'SIMULATION-refus-antivirus.pdf' });
  await expect(rejected).toContainText('64 Kio · Fichier refusé');
  await reachTranscript(page, rejected); await capture(page, 'files-03-simulated-rejection');
  await input.setInputFiles({ name: 'SIMULATION-quatrieme.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(16, 0x41) });
  await expect(page.getByRole('alert')).toContainText('3 fichiers au maximum');
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('Aucun logiciel malveillant détecté')).toHaveCount(0);
  await capture(page, 'files-04-rejected-still-charged');
  await page.getByRole('button', { name: 'Continuer sans ajouter de fichier' }).click();
  await page.getByRole('textbox', { name: 'Votre question à Jamm Immo' }).fill('Ma question sans autre fichier');
  await page.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(page.locator('.jamm-chat-message-visitor').filter({ hasText: 'Ma question sans autre fichier' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Votre question à Jamm Immo' })).toHaveValue('');
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await latestExchangeInViewport(page);
  await capture(page, 'files-05-continue-message');
  await page.getByRole('textbox', { name: 'Votre question à Jamm Immo' }).fill('Réponse différée de recette');
  await page.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __jammChatQA?: { held: boolean } }).__jammChatQA?.held)).toBe(true);
  const region = page.locator('.jamm-chat-transcript');
  for (let attempt = 0; attempt < 16 && await region.evaluate(element => element.scrollTop) >= 20; attempt++) await transcriptScrollInput(page, -1, 1500);
  await expect.poll(() => region.evaluate(element => element.scrollTop)).toBeLessThan(20);
  const readingTop = await region.evaluate(element => element.scrollTop);
  await page.evaluate(() => (window as unknown as { __jammChatQA: { releaseReply: () => void } }).__jammChatQA.releaseReply());
  const newMessage = page.getByRole('button', { name: 'Nouveau message', exact: true });
  await expect(newMessage).toBeInViewport({ ratio: 1 });
  expect(Math.abs(await region.evaluate(element => element.scrollTop) - readingTop)).toBeLessThanOrEqual(1);
  await capture(page, 'files-06-reading-position-kept');
  await newMessage.click(); await latestExchangeInViewport(page);
  await capture(page, 'files-07-new-message-revealed');
});

test('draft survives rotation and repeated open; keyboard and narrow viewport remain usable', async ({ page }) => {
  await openChat(page);
  const input = page.getByRole('textbox', { name: 'Votre question à Jamm Immo' });
  await input.fill('Brouillon à garder après rotation');
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.height, height: original.width });
  await expect(input).toHaveValue('Brouillon à garder après rotation');
  await expect(page.getByRole('button', { name: 'Envoyer le message', exact: true })).toBeInViewport();
  // Short visible viewport approximates the space left above a mobile keyboard.
  await page.setViewportSize({ width: 844, height: 240 });
  await expect(input).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Envoyer le message', exact: true })).toBeInViewport();
  await capture(page, '08-short-keyboard-viewport');
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator('.jamm-chat-dialog')).toHaveJSProperty('scrollWidth', 320);
  const fontSize = await input.evaluate(element => getComputedStyle(element).fontSize);
  expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16);
  await capture(page, '05-320px-draft');
  await input.press('Escape');
  await expect(page.locator('.jamm-chat-dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir l’assistant Jamm Immo' }).click();
  await expect(input).toHaveValue('Brouillon à garder après rotation');
  const overflow = await page.locator('.jamm-chat-shell').evaluate(element => element.scrollWidth > element.clientWidth);
  expect(overflow).toBe(false);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByRole('button', { name: 'Fermer la conversation' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Envoyer le message', exact: true })).toBeInViewport();
  await fullToolbar(page);
  await capture(page, '07-text-200-percent');
  const finalPrompt = page.getByRole('button', { name: 'Acheter, louer ou confier un bien', exact: true });
  await reachTranscript(page, finalPrompt); await expect(finalPrompt).toBeInViewport({ ratio: 1 });
  await expect(input).toHaveValue('Brouillon à garder après rotation');
  await capture(page, '07b-text200-last-prompt-reached');
});

test('outage is explicit and the uncertain request can be retried without losing its text', async ({ page }) => {
  await openChat(page);
  await page.getByRole('textbox', { name: 'Votre question à Jamm Immo' }).fill('Erreur réseau');
  await page.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('momentanément indisponible');
  await expect(page.getByRole('textbox', { name: 'Votre question à Jamm Immo' })).toHaveValue('Erreur réseau');
  await expect(page.getByRole('button', { name: 'Réessayer le même envoi' })).toBeVisible();
  await capture(page, '06-network-failure-preserves-draft');
});
