/**
 * Normalize Drizzle `db.execute()` results: some drivers return `{ rows }`, others a plain array.
 */
export function sqlRows(result: unknown): Record<string, unknown>[] {
  if (result == null) return [];
  const o = result as { rows?: unknown[] };
  if (Array.isArray(o.rows)) return o.rows as Record<string, unknown>[];
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (typeof (result as Iterable<unknown>)[Symbol.iterator] === "function" && typeof result !== "string") {
    return Array.from(result as Iterable<Record<string, unknown>>);
  }
  return [];
}

export function firstSqlRow(result: unknown): Record<string, unknown> | undefined {
  return sqlRows(result)[0];
}
