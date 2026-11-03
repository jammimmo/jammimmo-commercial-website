import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { ChatDatabase, ChatStatement } from './types';
// Only the builtin surface this harness uses; the app has no direct Node22
// typings dependency. These declarations do not replace any SQLite operation.
type SQLiteValue = null | string | number | bigint | Uint8Array;
interface SQLiteDatabase {
  exec(query: string): void;
  close(): void;
  prepare(query: string): {
    run(...values: SQLiteValue[]): { changes: number | bigint };
    get(...values: SQLiteValue[]): Record<string, unknown> | undefined;
    all(...values: SQLiteValue[]): Record<string, unknown>[];
  };
}
// Vite5 predates node:sqlite in its builtin list; load the real Node22 builtin
// without resolving it as an npm package. This is not a SQL/mock replacement.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => SQLiteDatabase };

/** Local SQLite oracle, no network and no mocked SQL predicates. Every operation
 * joins one queue; a D1 batch is a single SQLite transaction without JS yields. */
export function chatTestDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../../../d1/migrations/0002_chat.sql', import.meta.url), 'utf8'));
  const statements = new WeakMap<ChatStatement, { query: string; args: unknown[] }>();
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(operation: () => T): Promise<T> {
    const result = queue.then(operation); queue = result.then(() => undefined, () => undefined); return result;
  }
  function run(statement: ChatStatement) {
    const data = statements.get(statement); if (!data) throw new Error('foreign statement');
    return { success: true, meta: { changes: Number(sql.prepare(data.query).run(...data.args as never[]).changes) } };
  }
  function statement(query: string, args: unknown[] = []): ChatStatement {
    const result: ChatStatement = {
      bind: (...values) => statement(query, values),
      first: <T>() => enqueue(() => (sql.prepare(query).get(...args as never[]) ?? null) as T | null),
      all: <T>() => enqueue(() => ({ success: true, results: sql.prepare(query).all(...args as never[]) as T[] })),
      run: () => enqueue(() => run(result)),
    };
    statements.set(result, { query, args }); return result;
  }
  const db: ChatDatabase = { prepare: statement, batch: (items) => enqueue(() => {
    sql.exec('BEGIN');
    try { const values = items.map(run); sql.exec('COMMIT'); return values; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  }) };
  return { sql, db };
}
