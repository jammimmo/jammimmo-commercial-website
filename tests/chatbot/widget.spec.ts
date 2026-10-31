import { expect, test, type Page } from '@playwright/test';

let externalRequests: string[] = [];
test.beforeEach(async ({ context, baseURL }) => {
  externalRequests = [];
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
test.afterEach(() => { expect(externalRequests, 'UI fixture must never attempt a provider or Auth request').toEqual([]); });

async function openChat(page: Page, files = false) {
  await page.route('**/api/chat/**', route => route.abort());
  const response = await page.goto(files ? '/qa/chatbot?files=simulated' : '/qa/chatbot');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('RECETTE LOCALE · DONNÉES FICTIVES · AUCUN ENVOI')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir l’assistant Jamm Immo' }).click();
  await expect(page.getByRole('button', { name: 'Parler à un conseiller', exact: true })).toBeEnabled();
  await expect(page.locator('.jamm-chat-dialog')).toBeVisible();
}

async function capture(page: Page, name: string) {
  const file = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await test.info().attach(name, { path: file, contentType: 'image/png' });
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
  await capture(page, '02-grounded-answer');
  await page.getByRole('button', { name: 'Parler à un conseiller', exact: true }).click();
  await page.getByLabel('Votre prénom').fill('Visiteur de recette');
  await page.getByLabel('Ce que vous souhaitez savoir').fill('Je souhaite préciser mon projet avec l’équipe.');
  await page.getByLabel(/J’accepte de transmettre/).check();
  await page.getByRole('button', { name: 'Transmettre ma demande', exact: true }).scrollIntoViewIfNeeded();
  await capture(page, '03-handoff-form');
  await page.getByRole('button', { name: 'Transmettre ma demande', exact: true }).click();
  await expect(page.getByText('Votre demande est enregistrée. Sa transmission à l’équipe est en attente.')).toBeVisible();
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
  await first.scrollIntoViewIfNeeded(); await capture(page, 'files-01-name-size-quarantine');
  await input.setInputFiles({ name: 'SIMULATION-accuse-perdu.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(64 * 1024, 0x41) });
  await expect(page.getByRole('alert')).toContainText('même envoi');
  await capture(page, 'files-02-uncertain-upload');
  await page.getByRole('button', { name: 'Réessayer le même envoi' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').filter({ hasText: 'SIMULATION-accuse-perdu.pdf' })).toContainText('64 Kio · En attente d’analyse');
  await input.setInputFiles({ name: 'SIMULATION-refus-antivirus.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(64 * 1024, 0x41) });
  const rejected = list.getByRole('listitem').filter({ hasText: 'SIMULATION-refus-antivirus.pdf' });
  await expect(rejected).toContainText('64 Kio · Fichier refusé');
  await rejected.scrollIntoViewIfNeeded(); await capture(page, 'files-03-simulated-rejection');
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
  await capture(page, 'files-05-continue-message');
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
  await capture(page, '07-text-200-percent');
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
