export type RateLimitDecision = 'allowed' | 'limited' | 'unavailable';
export const INTAKE_RATE_LIMIT_RETENTION_SECONDS = 24 * 60 * 60;
export const INTAKE_RATE_LIMIT_CLEANUP_LIMIT = 100;

/** Opportunistic bounded cleanup when a short window starts.
 * Uses the existing 24h threshold, never an active counter. No traffic
 * means no scheduled-second purge guarantee; lead/ACK retention is unaffected.
 */
async function pruneExpiredIntakeRateLimits(db: D1Database): Promise<boolean> {
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
/** Atomic SQLite fixed window; capped requests leave the stored counter unchanged. */
export async function consumeD1FixedWindow(
  db: D1Database | undefined,
  key: string,
  limit: number,
  seconds: number,
  options?: { pruneOnNewWindow: boolean },
): Promise<RateLimitDecision> {
  if (!db || !/^[a-z0-9:-]{8,160}$/i.test(key) || !Number.isInteger(limit) || limit < 1 || limit > 10000
    || !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) return 'unavailable';
  try {
    const row = await db.prepare(`INSERT INTO intake_rate_limits (rate_key, window_started_at, count)
      VALUES (?, unixepoch(), 1) ON CONFLICT(rate_key) DO UPDATE SET
      window_started_at = CASE WHEN intake_rate_limits.window_started_at <= unixepoch() - ? THEN unixepoch() ELSE intake_rate_limits.window_started_at END,
      count = CASE WHEN intake_rate_limits.window_started_at <= unixepoch() - ? THEN 1 ELSE intake_rate_limits.count + 1 END
      WHERE intake_rate_limits.window_started_at <= unixepoch() - ? OR intake_rate_limits.count < ?
      RETURNING count`).bind(key, seconds, seconds, seconds, limit).first<{ count: number }>();
    if (row === null) return 'limited';
    if (!row || !Number.isInteger(row.count) || row.count < 1 || row.count > limit) return 'unavailable';
    if (row.count === 1 && options?.pruneOnNewWindow && !(await pruneExpiredIntakeRateLimits(db))) return 'unavailable';
    return 'allowed';
  } catch { return 'unavailable'; }
}
