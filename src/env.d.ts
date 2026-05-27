/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly INTAKE_SUPABASE_URL: string;
  readonly INTAKE_SUPABASE_ANON_KEY: string;
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
