/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly REVALIDATE_HMAC_SECRET: string;
  readonly GH_DISPATCH_TOKEN: string;
  readonly GH_REPO: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ success: boolean; meta?: Record<string, unknown> }>;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<{ count: number; duration: number }>;
}
