import { db, journalEntries } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Next `JE-000001` style number = max existing JE-* + 1 (any status). Ignores CE-*, drafts with other prefixes, etc. */
export async function nextJournalEntryNumber(companyId: string): Promise<string> {
  const rows = await db
    .select({ entryNumber: journalEntries.entryNumber })
    .from(journalEntries)
    .where(eq(journalEntries.companyId, companyId));

  let max = 0;
  for (const r of rows) {
    const m = String(r.entryNumber ?? "").match(/^JE-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `JE-${String(max + 1).padStart(6, "0")}`;
}
