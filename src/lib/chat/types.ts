export const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const MAX_FILE = 5 * 1024 * 1024;
export const MAX_FILES = 3;
export const MAX_TOTAL = 15 * 1024 * 1024;
export interface ChatStatement {
  bind(...values: unknown[]): ChatStatement;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ success: boolean; results: T[] }>;
}
export interface ChatDatabase {
  prepare(sql: string): ChatStatement;
  batch(statements: ChatStatement[]): Promise<Array<{ success: boolean; meta?: { changes?: number } }>>;
}
export interface ChatFiles {
  head(key: string): Promise<ChatObject | null>;
  put(key: string, value: Uint8Array, options: { onlyIf: { etagDoesNotMatch: '*' }; httpMetadata: { contentType: string; contentDisposition: string }; customMetadata: Record<string, string> }): Promise<ChatObject | null>;
  delete(key: string): Promise<void>;
}
export interface ChatObject { key: string; size: number; customMetadata?: Record<string, string> }
export interface ChatEnv {
  INTAKE_DB?: ChatDatabase;
  CHAT_ALLOWED_ORIGINS?: string;
  CHAT_IP_HASH_SALT?: string;
  CHAT_TEST_MODE?: string;
  CHAT_AI_FREE_VERIFIED?: string;
  CHAT_SCANNER_OPERATIONAL?: string;
  CHAT_FILES?: ChatFiles;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}
export interface ChatConfig {
  enabled: boolean; welcome: string; operatorIds: string[];
  routing: Record<'property' | 'tools' | 'services' | 'other', string[]>;
  schedule: { timezone: string; days: number[]; start: string; end: string };
  notificationEmailEnabled: boolean;
  files: { enabled: boolean; maxCount: number; maxBytes: number; totalBytes: number };
  retentionDays: number; aiEnabled: boolean; dailyNeurons: number; sourceIds: string[];
}
export interface Citation { id: string; title: string; url: string; quote: string }
export interface ChatSource { id: string; title: string; url: string; text: string; lang: string; revision: string }
export interface Conversation {
  id: string; session_id: string; status: 'bot' | 'waiting' | 'assigned' | 'waiting_visitor' | 'closed';
  version: number; receipt_id: string | null; inbox_available_at: string | null; assigned_to: string | null;
  expires_at: string;
}
export interface Session { id: string; cap_hash: string; expires_at: string }
export interface ChatRequest {
  id: string; conversation_id: string; request_id: string; kind: string; body_hash: string;
  state: string; result_json: string | null; created_at: string; ai_state: string;
}
/** Durable idempotence points to immutable messages/receipts, never a growing transcript. */
export type ChatResult = { kind: 'message'; messageId: string; mode: 'sources' | 'ai' | 'human'; handoffSuggested: boolean }
  | { kind: 'handoff'; receiptId: string } | { kind: 'attachment'; attachmentId: string };
export interface Attachment {
  id: string; conversation_id: string; request_id: string; name: string; content_type: string;
  size: number; actual_size: number | null; state: string; object_key: string; sha256: string | null;
  expires_at: string;
}
