export type ConversationStatus = 'bot' | 'waiting' | 'assigned' | 'waiting_visitor' | 'closed';
export interface Citation { id: string; title: string; url: string; quote: string; }
export interface ChatMessage { id: string; role: 'visitor' | 'assistant' | 'operator' | 'system'; content: string; citations?: Citation[]; created_at?: string; }
export interface Receipt { id: string; state: 'recorded' | 'available' | 'claimed'; notification: 'pending' | 'sent' | 'failed' | 'unknown' | 'unconfigured'; }
export interface Conversation { id: string; status: ConversationStatus; version: number; messages: ChatMessage[]; receipt?: Receipt; }
export interface Attachment { id: string; name: string; size: number; state: 'uploading' | 'quarantined' | 'scanning' | 'clean' | 'rejected' | 'scan_error' | 'expired'; countsTowardsQuota?: boolean; }
export interface ChatPolicy { enabled: boolean; welcome: string; retentionDays: number; files: { enabled: boolean; maxCount: number; maxBytes: number; totalBytes: number; types: string[]; retentionHours: number }; }
export interface SessionResponse { csrf: string; conversation: Conversation; policy: ChatPolicy; contacts: { whatsapp?: string; url?: string; email?: string }; attachments?: Attachment[]; }
export interface MessageRequest { requestId: string; text: string; page?: { path: string; title?: string; propertyReference?: string }; }
export interface HandoffRequest { requestId: string; name: string; channel: 'email' | 'phone' | 'chat'; contact: string; summary: string; consent: true; topic: 'property' | 'tools' | 'services' | 'other'; }
export interface MessageResponse { conversation: Conversation; message: ChatMessage; mode: 'sources' | 'ai' | 'human'; handoffSuggested?: boolean; }
export interface HandoffResponse { conversation: Conversation; receipt: Receipt; }

export class ChatError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}

/** Cookies carry the capability. Neither it nor conversation content enters URLs/storage. */
export class ChatClient {
  private csrf = '';
  constructor(private readonly request: typeof fetch = fetch) {}
  private async send<T>(path: string, method = 'GET', body?: unknown, binary = false): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.request(`/api/chat/${path}`, {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { ...(method === 'GET' ? {} : { 'Content-Type': binary ? (body as Blob).type || 'application/octet-stream' : 'application/json' }), ...(this.csrf ? { 'X-Chat-CSRF': this.csrf } : {}) },
        ...(body === undefined ? {} : { body: binary ? body as Blob : JSON.stringify(body) }),
      });
      if (!response.ok) {
        let fileDailyBudget = false;
        if (response.status === 429) {
          const body: unknown = await response.json().catch(() => null);
          fileDailyBudget = typeof body === 'object' && body !== null && 'code' in body && body.code === 'chat_file_daily_budget';
        }
        const detail = response.status === 429 ? fileDailyBudget
          ? 'Le quota quotidien de pièces jointes est atteint. Vous pouvez envoyer votre message sans fichier.'
          : 'Une limite temporaire est atteinte. Réessayez plus tard. Votre texte reste ici.'
          : response.status === 401 || response.status === 403 ? 'La session doit être réouverte. Votre texte reste ici.'
          : response.status === 413 ? 'Le fichier dépasse la taille autorisée.'
          : response.status === 503 ? 'L’assistant est momentanément indisponible. Votre texte reste ici.'
          : 'La réponse n’a pas été confirmée. Votre texte reste ici.';
        throw new ChatError(detail, response.status);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ChatError) throw error;
      throw new ChatError('La connexion a été interrompue. Réessayez le même envoi pour retrouver son résultat.');
    } finally { clearTimeout(timer); }
  }
  async session() { const result = await this.send<SessionResponse>('session', 'POST', {}); this.csrf = result.csrf; return result; }
  conversation() { return this.send<{ conversation: Conversation; attachments: Attachment[] }>('conversation'); }
  message(body: MessageRequest) { return this.send<MessageResponse>('message', 'POST', body); }
  handoff(body: HandoffRequest) { return this.send<HandoffResponse>('handoff', 'POST', body); }
  async attachment(file: File, requestId: string): Promise<Attachment> {
    const reservation = await this.send<unknown>('attachments', 'POST', { requestId, name: file.name, type: file.type, size: file.size });
    if (!reservation || typeof reservation !== 'object' || !('id' in reservation) || typeof reservation.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservation.id)
      || !('uploadUrl' in reservation) || typeof reservation.uploadUrl !== 'string') {
      throw new ChatError('La réservation du fichier n’a pas pu être vérifiée. Réessayez le même envoi.');
    }
    const target = new URL(reservation.uploadUrl, window.location.origin);
    // The server cannot direct a visitor's file or CSRF token to another origin.
    if (target.origin !== window.location.origin || target.pathname !== `/api/chat/attachments/${encodeURIComponent(reservation.id)}` || target.search || target.hash) throw new ChatError('La destination du fichier n’a pas pu être vérifiée.');
    const result = await this.send<unknown>(`attachments/${encodeURIComponent(reservation.id)}`, 'PUT', file, true);
    if (!result || typeof result !== 'object' || !('id' in result) || result.id !== reservation.id || !('state' in result)
      || typeof result.state !== 'string' || !['uploading', 'quarantined', 'scanning', 'clean', 'rejected', 'scan_error', 'expired'].includes(result.state)) {
      throw new ChatError('Le résultat du fichier n’a pas pu être vérifié. Réessayez le même envoi.');
    }
    // Upload responses only acknowledge identity/state. Keep the local selected
    // file metadata, and charge its reservation until the server says deleted.
    return { id: reservation.id, name: file.name, size: file.size, state: result.state as Attachment['state'], countsTowardsQuota: true };
  }
  async clear() { await this.send('session', 'DELETE', {}); this.csrf = ''; }
}

export const DEFAULT_POLICY: ChatPolicy = { enabled: true, welcome: 'Bonjour, je vous aide à trouver une information sur Jamm Immo.', retentionDays: 30, files: { enabled: false, maxCount: 3, maxBytes: 5 * 1024 * 1024, totalBytes: 15 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], retentionHours: 24 } };
export function validateFiles(files: File[], existing: Pick<Attachment, 'size' | 'state' | 'countsTowardsQuota'>[], policy: ChatPolicy['files']): string | null {
  if (!policy.enabled) return 'Les pièces jointes ne sont pas disponibles pour le moment. Vous pouvez envoyer votre demande sans fichier.';
  const retained = existing.filter(file => file.countsTowardsQuota !== false);
  if (retained.length + files.length > Math.min(3, policy.maxCount)) return `Vous pouvez joindre ${Math.min(3, policy.maxCount)} fichiers au maximum.`;
  const extensions: Record<string, RegExp> = { 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i, 'image/webp': /\.webp$/i, 'application/pdf': /\.pdf$/i };
  if (files.some(file => !policy.types.includes(file.type) || !extensions[file.type]?.test(file.name) || /[\u202a-\u202e\u2066-\u2069]/.test(file.name))) return 'Choisissez un fichier JPEG, PNG, WebP ou PDF avec une extension correspondant à son format.';
  if (files.some(file => file.size === 0 || file.size > Math.min(5 * 1024 * 1024, policy.maxBytes))) return `Chaque fichier doit contenir des données et peser au maximum ${formatFileLimit(Math.min(5 * 1024 * 1024, policy.maxBytes))}.`;
  if (retained.some(file => !Number.isFinite(file.size) || file.size < 0)) return 'Le quota des fichiers n’a pas pu être vérifié. Vous pouvez envoyer votre message sans fichier.';
  if (retained.reduce((sum, file) => sum + file.size, 0) + files.reduce((sum, file) => sum + file.size, 0) > Math.min(15 * 1024 * 1024, policy.totalBytes)) return 'Le poids total des fichiers dépasse la limite autorisée.';
  return null;
}
export function formatFileLimit(bytes: number): string { return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} Mio`; }
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} octets`;
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bytes / 1024)} Kio`;
  return formatFileLimit(bytes);
}
export function safeSourceUrl(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    const trustedSite = url.protocol === 'https:' && ['jammimmo.com', 'www.jammimmo.com'].includes(url.hostname) && !url.port;
    if ((url.origin !== origin && !trustedSite) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.origin === origin ? url.pathname + url.search + url.hash : url.href;
  } catch { return null; }
}
export function attachmentLabel(state: Attachment['state']): string {
  return { uploading: 'Envoi en cours', quarantined: 'En attente d’analyse', scanning: 'Analyse antivirus en cours', clean: 'Aucun logiciel malveillant détecté', rejected: 'Fichier refusé', scan_error: 'Analyse indisponible · fichier non transmis', expired: 'Fichier expiré' }[state];
}
