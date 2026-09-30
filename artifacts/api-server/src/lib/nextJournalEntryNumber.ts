import { db, journalEntries } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serializes journal-entry-number allocation (and whatever entry creation follows
 * it) per company, using a Postgres transaction-scoped advisory lock. Two
 * concurrent requests for the same company block on the lock instead of both
 * reading the same "max entry number" and computing the same next value.
 *
 * Callers MUST do their number lookup and their journal_entries insert inside
 * `fn`, using the `tx` client it receives — reaching back out to the module-level
 * `db` from inside `fn` would run outside the lock's transaction and defeat it.
 */
export async function withCompanyJournalLock<T>(
  companyId: string,
  fn: (tx: DbOrTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // hashtextextended gives a stable 64-bit key from the companyId string; the
    // second argument namespaces it so it can't collide with unrelated advisory locks.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${companyId}, 42))`);
    return fn(tx);
  });
}

/** Next `{prefix}-000001` style number = max existing {prefix}-* + 1. Call inside withCompanyJournalLock. */
export async function nextNumberForPrefix(
  companyId: string,
  prefix: string,
  padLength: number,
  executor: DbOrTx = db,
): Promise<string> {
  const rows = await executor
    .select({ entryNumber: journalEntries.entryNumber })
    .from(journalEntries)
    .where(eq(journalEntries.companyId, companyId));

  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const r of rows) {
    const m = String(r.entryNumber ?? "").match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(padLength, "0")}`;
}

/** Next `JE-000001` style number = max existing JE-* + 1 (any status). Call inside withCompanyJournalLock. */
export async function nextJournalEntryNumber(companyId: string, executor: DbOrTx = db): Promise<string> {
  return nextNumberForPrefix(companyId, "JE", 6, executor);
}
