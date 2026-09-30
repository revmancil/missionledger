import { db, journalEntries, journalEntryLines, chartOfAccounts, accounts, glEntries, funds } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { nextJournalEntryNumber } from "./nextJournalEntryNumber";
import { recomputeBankBalanceByGlAccount } from "./bankBalance";

export interface SimpleJournalLine {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string | null;
  fundId?: string | null;
}

/**
 * Create and immediately POST a balanced journal entry: header + lines + gl_entries,
 * all in one DB transaction, followed by a bank-balance recompute for any touched
 * cash accounts. For sources (bill payments, expenses) that represent a cash event
 * that already happened, not a draft a human reviews later.
 */
export async function postSimpleJournalEntry(
  companyId: string,
  params: {
    date: Date;
    description: string;
    lines: SimpleJournalLine[];
    createdBy?: string | null;
    referenceNumber?: string | null;
  },
): Promise<{ id: string; entryNumber: string }> {
  const totalDebit = params.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = params.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (params.lines.length === 0) {
    throw new Error("Journal entry must have at least one line");
  }
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Journal entry is out of balance: debits=${totalDebit.toFixed(2)} credits=${totalCredit.toFixed(2)}`,
    );
  }

  const allCoa = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
  const coaMap = Object.fromEntries(allCoa.map((a) => [a.id, { id: a.id, code: a.code, name: a.name }]));
  const legacyAccts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
  const legacyMap = Object.fromEntries(legacyAccts.map((a) => [a.id, { id: a.id, code: a.code, name: a.name }]));
  const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
  const fundMap = Object.fromEntries(allFunds.map((f) => [f.id, f]));

  for (const line of params.lines) {
    if (!coaMap[line.accountId] && !legacyMap[line.accountId]) {
      throw new Error(`Account ${line.accountId} not found`);
    }
  }

  const entryNumber = await nextJournalEntryNumber(companyId);

  const entry = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(journalEntries)
      .values({
        companyId,
        entryNumber,
        date: params.date,
        description: params.description,
        referenceNumber: params.referenceNumber ?? null,
        status: "POSTED",
        createdBy: params.createdBy ?? null,
        postedAt: new Date(),
      })
      .returning();

    for (const line of params.lines) {
      await tx.insert(journalEntryLines).values({
        journalEntryId: created.id,
        companyId,
        accountId: line.accountId,
        debit: line.debit ?? 0,
        credit: line.credit ?? 0,
        description: line.description ?? params.description,
        fundId: line.fundId ?? null,
      });

      const account = coaMap[line.accountId] ?? legacyMap[line.accountId];
      const fund = line.fundId ? fundMap[line.fundId] : null;

      if ((line.debit ?? 0) > 0) {
        await tx.insert(glEntries).values({
          companyId,
          journalEntryId: created.id,
          sourceType: "MANUAL_JE",
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          fundId: line.fundId ?? null,
          fundName: fund?.name ?? null,
          entryType: "DEBIT",
          amount: line.debit ?? 0,
          description: line.description ?? params.description,
          date: params.date,
          isVoid: false,
        });
      }
      if ((line.credit ?? 0) > 0) {
        await tx.insert(glEntries).values({
          companyId,
          journalEntryId: created.id,
          sourceType: "MANUAL_JE",
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          fundId: line.fundId ?? null,
          fundName: fund?.name ?? null,
          entryType: "CREDIT",
          amount: line.credit ?? 0,
          description: line.description ?? params.description,
          date: params.date,
          isVoid: false,
        });
      }
    }

    return created;
  });

  const uniqueAccountIds = [...new Set(params.lines.map((l) => l.accountId))];
  await Promise.all(uniqueAccountIds.map((id) => recomputeBankBalanceByGlAccount(id, companyId).catch(() => {})));

  return { id: entry.id, entryNumber: entry.entryNumber };
}

/** Void a journal entry created by postSimpleJournalEntry (e.g. when its source record is deleted). */
export async function voidPostedJournalEntry(journalEntryId: string, companyId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId)));
  if (!existing || existing.status === "VOID") return;

  const voidLines = await db
    .select({ accountId: journalEntryLines.accountId })
    .from(journalEntryLines)
    .where(eq(journalEntryLines.journalEntryId, journalEntryId));
  const uniqueAccountIds = [...new Set(voidLines.map((l) => l.accountId))];

  await db.transaction(async (tx) => {
    await tx
      .update(glEntries)
      .set({ isVoid: true, updatedAt: new Date() })
      .where(and(eq(glEntries.journalEntryId, journalEntryId), eq(glEntries.companyId, companyId)));
    await tx
      .update(journalEntries)
      .set({ status: "VOID", voidedAt: new Date(), updatedAt: new Date() })
      .where(eq(journalEntries.id, journalEntryId));
  });

  await Promise.all(uniqueAccountIds.map((id) => recomputeBankBalanceByGlAccount(id, companyId).catch(() => {})));
}
