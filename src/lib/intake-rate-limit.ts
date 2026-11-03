export interface NativeRateLimitBinding { limit(options: { key: string }): Promise<{ success: boolean }> }
export type RateLimitDecision = 'allowed' | 'limited' | 'unavailable';
export const INTAKE_RATE_LIMIT_RETENTION_SECONDS = 24 * 60 * 60;
export const INTAKE_RATE_LIMIT_CLEANUP_LIMIT = 100;

/** Opportunistic bounded cleanup before a valid new write's quota consumption.
 * Uses the existing24h threshold, never an active hourly counter. No traffic
 * means no scheduled-second purge guarantee; lead/ACK retention is unaffected.
 */
export async function pruneExpiredIntakeRateLimits(db: D1Database): Promise<boolean> {
  try {
    const result = await db.prepare(`DELETE FROM intake_rate_limits WHERE rate_key IN (
      SELECT rate_key FROM intake_rate_limits WHERE window_started_at < unixepoch() - ?
      ORDER BY window_started_at, rate_key LIMIT ?)`)
      .bind(INTAKE_RATE_LIMIT_RETENTION_SECONDS, INTAKE_RATE_LIMIT_CLEANUP_LIMIT).run();
    const changes = result.meta?.changes;
    return result.success === true && typeof changes === 'number' && Number.isSafeInteger(changes)
      && changes >= 0 && changes <= INTAKE_RATE_LIMIT_CLEANUP_LIMIT;
  } catch { return false; }
}
export async function checkRequiredRateLimit(binding: NativeRateLimitBinding | undefined, key: string): Promise<RateLimitDecision> {
  if (!binding) return 'unavailable';
  try {
    const result = await binding.limit({ key });
    return result?.success === true ? 'allowed' : result?.success === false ? 'limited' : 'unavailable';
  } catch { return 'unavailable'; }
}
/** Atomic SQLite fixed window replaces unsafe KV read/increment writes. */
export async function consumeD1FixedWindow(db: D1Database | undefined, key: string, limit: number, seconds: number): Promise<RateLimitDecision> {
  if (!db || !/^[a-z0-9:-]{8,160}$/i.test(key) || !Number.isInteger(limit) || limit < 1 || limit > 10000
    || !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) return 'unavailable';
  try {
    const row = await db.prepare(`INSERT INTO intake_rate_limits (rate_key, window_started_at, count)
      VALUES (?, unixepoch(), 1) ON CONFLICT(rate_key) DO UPDATE SET
      window_started_at = CASE WHEN intake_rate_limits.window_started_at <= unixepoch() - ? THEN unixepoch() ELSE intake_rate_limits.window_started_at END,
      count = CASE WHEN intake_rate_limits.window_started_at <= unixepoch() - ? THEN 1 ELSE min(intake_rate_limits.count + 1, ?) END
      RETURNING count`).bind(key, seconds, seconds, limit + 1).first<{ count: number }>();
    if (!row || !Number.isInteger(row.count) || row.count < 1) return 'unavailable';
    return row.count <= limit ? 'allowed' : 'limited';
  } catch { return 'unavailable'; }
}
