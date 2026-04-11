/**
 * backfill-je-gl-entries.ts
 *
 * One-time backfill: regenerates missing GL entries for every POSTED journal entry.
 *
 * Background: a prior bug used the `accounts` table instead of `chart_of_accounts`
 * when posting JEs. Because JE lines store chart_of_accounts IDs, the lookup
 * always returned undefined and every GL entry was silently skipped.
 *
 * This script is SAFE to run multiple times — it checks for existing GL entries
 * before inserting, so it will never create duplicates.
 *
 * Run directly:
 *   npx tsx src/seeds/backfill-je-gl-entries.ts
 *
 * Or trigger via the master-admin API endpoint:
 *   POST /api/master-admin/backfill-gl-entries  (requires master-admin Bearer token)
 */

import {
  db,
  journalEntries,
  journalEntryLines,
  chartOfAccounts,
  glEntries,
  funds,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

export async function backfillJeGlEntries(): Promise<{
  checked: number;
  skipped: number;
  backfilled: number;
  errors: number;
  details: string[];
}> {
  const details: string[] = [];
  let checked = 0;
  let skipped = 0;
  let backfilled = 0;
  let errors = 0;

  // 1. Load all POSTED journal entries (across all companies)
  const postedEntries = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.status, "POSTED"));

  details.push(`Found ${postedEntries.length} POSTED journal entries.`);
  checked = postedEntries.length;

  for (const entry of postedEntries) {
    try {
      // 2. Check if GL entries already exist for this JE
      const existing = await db
        .select({ id: glEntries.id })
        .from(glEntries)
        .where(eq(glEntries.journalEntryId, entry.id))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue; // Already has GL entries — skip
      }

      // 3. Fetch JE lines
      const lines = await db
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, entry.id));

      if (!lines.length) {
        details.push(`JE ${entry.entryNumber} (${entry.id}): no lines found, skipping.`);
        skipped++;
        continue;
      }

      // 4. Load account map from chart_of_accounts for this company
      const accountIds = [...new Set(lines.map((l) => l.accountId))];
      const coaRows = await db
        .select()
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.companyId, entry.companyId),
            inArray(chartOfAccounts.id, accountIds)
          )
        );
      const accountMap = Object.fromEntries(coaRows.map((a) => [a.id, a]));

      // 5. Load fund map for this company
      const fundIds = [...new Set(lines.map((l) => l.fundId).filter(Boolean))] as string[];
      const fundMap: Record<string, { id: string; name: string }> = {};
      if (fundIds.length > 0) {
        const fundRows = await db
          .select()
          .from(funds)
          .where(
            and(
              eq(funds.companyId, entry.companyId),
              inArray(funds.id, fundIds)
            )
          );
        for (const f of fundRows) fundMap[f.id] = f;
      }

      // 6. Insert GL entries for each line
      let insertedCount = 0;
      for (const line of lines) {
        const account = accountMap[line.accountId];
        if (!account) {
          details.push(
            `JE ${entry.entryNumber}: line ${line.id} — accountId ${line.accountId} not found in chart_of_accounts, skipping line.`
          );
          continue;
        }
        const fund = line.fundId ? fundMap[line.fundId] : null;

        if ((line.debit ?? 0) > 0) {
          await db.insert(glEntries).values({
            companyId: entry.companyId,
            journalEntryId: entry.id,
            sourceType: "MANUAL_JE",
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            fundId: line.fundId ?? null,
            fundName: fund?.name ?? null,
            entryType: "DEBIT",
            amount: line.debit ?? 0,
            description: line.description || entry.description,
            date: entry.date,
          });
          insertedCount++;
        }

        if ((line.credit ?? 0) > 0) {
          await db.insert(glEntries).values({
            companyId: entry.companyId,
            journalEntryId: entry.id,
            sourceType: "MANUAL_JE",
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            fundId: line.fundId ?? null,
            fundName: fund?.name ?? null,
            entryType: "CREDIT",
            amount: line.credit ?? 0,
            description: line.description || entry.description,
            date: entry.date,
          });
          insertedCount++;
        }
      }

      details.push(
        `JE ${entry.entryNumber} (${entry.id}): inserted ${insertedCount} GL entries.`
      );
      backfilled++;
    } catch (err: any) {
      errors++;
      details.push(
        `JE ${entry.entryNumber} (${entry.id}): ERROR — ${err?.message ?? String(err)}`
      );
      console.error(`[backfill] Error on JE ${entry.id}:`, err);
    }
  }

  console.log(
    `[backfill] Done. checked=${checked} skipped=${skipped} backfilled=${backfilled} errors=${errors}`
  );

  return { checked, skipped, backfilled, errors, details };
}

// Allow direct execution: `npx tsx src/seeds/backfill-je-gl-entries.ts`
if (require.main === module || process.argv[1]?.includes("backfill-je-gl-entries")) {
  backfillJeGlEntries()
    .then((result) => {
      console.log("\n=== Backfill Summary ===");
      console.log(`Checked:    ${result.checked}`);
      console.log(`Skipped:    ${result.skipped} (already had GL entries)`);
      console.log(`Backfilled: ${result.backfilled}`);
      console.log(`Errors:     ${result.errors}`);
      console.log("\nDetails:");
      result.details.forEach((d) => console.log(" •", d));
      process.exit(result.errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
