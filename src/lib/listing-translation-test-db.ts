// QA only: real Node22 SQLite, no product chat import and no SQL predicate mock.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { TranslationDatabase, TranslationStatement } from './listing-translation-server';
type Value = string | number | null | bigint | Uint8Array;
interface SQLiteDatabase {
  exec(sql: string): void; close(): void;
  prepare(sql: string): { run(...values: Value[]): { changes: number | bigint };
    get(...values: Value[]): Record<string, unknown> | undefined; all(...values: Value[]): Record<string, unknown>[] };
}
// Vite5's builtin list predates node:sqlite. Resolve the actual Node builtin,
// not an npm SQLite shim. This adapter is never imported by product source.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => SQLiteDatabase };
const parameters = (values: unknown[]): Value[] => values.map(value => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || value instanceof Uint8Array) return value;
  throw new Error('Unsupported SQLite binding');
});
export function listingTranslationTestDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../../d1/migrations/0010_listing_translations.sql', import.meta.url), 'utf8'));
  const statements = new WeakMap<TranslationStatement, { query: string; args: Value[] }>();
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => T): Promise<T> {
    const result = queue.then(operation); queue = result.then(() => undefined, () => undefined); return result;
  }
  function run(statement: TranslationStatement) {
    const data = statements.get(statement); if (!data) throw new Error('Foreign statement');
    return { success: true, meta: { changes: Number(sql.prepare(data.query).run(...data.args).changes) } };
  }
  function statement(query: string, args: Value[] = []): TranslationStatement {
    const result: TranslationStatement = {
      bind: (...values) => statement(query, parameters(values)),
      first: <T>() => enqueue(() => (sql.prepare(query).get(...args) ?? null) as T | null),
      all: <T>() => enqueue(() => ({ success: true, results: sql.prepare(query).all(...args) as T[] })),
      run: () => enqueue(() => run(result)),
    };
    statements.set(result, { query, args }); return result;
  }
  const db: TranslationDatabase = { prepare: statement, batch: items => enqueue(() => {
    sql.exec('BEGIN'); try { const result = items.map(run); sql.exec('COMMIT'); return result; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  }) };
  return { sql, db };
}
