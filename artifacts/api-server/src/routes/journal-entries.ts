import { Router } from "express";
import { db, journalEntries, journalEntryLines, accounts, chartOfAccounts, glEntries, funds } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { logAudit, snap } from "../lib/audit";
import { nextJournalEntryNumber } from "../lib/nextJournalEntryNumber";
import { recomputeBankBalanceByGlAccount } from "../lib/bankBalance";

const router = Router();

function normalizeJournalEntryStatus(status: unknown): "DRAFT" | "POSTED" | "VOID" {
  const u = String(status ?? "DRAFT").toUpperCase();
  if (u === "POSTED" || u === "VOID" || u === "DRAFT") return u;
  return "DRAFT";
}

async function enrichEntry(entry: any, companyId: string) {
  const lines = await db.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, entry.id));

  // Primary: chart_of_accounts (GL-backed COA — correct table for JE lines)
  const allCoa = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
  const coaMap = Object.fromEntries(allCoa.map(a => [a.id, a]));

  // Fallback: legacy accounts table (for any JEs created before the COA migration)
  const legacyAccts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
  const legacyMap = Object.fromEntries(legacyAccts.map(a => [a.id, a]));

  const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
  const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));

  return {
    ...entry,
    status: normalizeJournalEntryStatus(entry.status),
    date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
    postedAt: entry.postedAt ? (entry.postedAt instanceof Date ? entry.postedAt.toISOString() : entry.postedAt) : null,
    voidedAt: entry.voidedAt ? (entry.voidedAt instanceof Date ? entry.voidedAt.toISOString() : entry.voidedAt) : null,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
    updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
    lines: lines.map(l => ({
      ...l,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      account: coaMap[l.accountId] ?? legacyMap[l.accountId] ?? null,
      fund: l.fundId ? (fundMap[l.fundId] || null) : null,
    })),
  };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.companyId, companyId))
      .orderBy(desc(journalEntries.date), desc(journalEntries.createdAt));
    const enriched = await Promise.all(all.map(e => enrichEntry(e, companyId)));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [entry] = await db.select().from(journalEntries).where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.companyId, companyId)));
    if (!entry) return res.status(404).json({ error: "Not found" });
    res.json(await enrichEntry(entry, companyId));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const { date, description, memo, referenceNumber, lines } = req.body ?? {};
    if (!date || !description || !lines?.length) return res.status(400).json({ error: "Missing required fields" });

    const totalDebit = lines.reduce((s: number, l: any) => s + (parseFloat(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s: number, l: any) => s + (parseFloat(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({ error: "Debits must equal credits" });
    }

    const entryNumber = await nextJournalEntryNumber(companyId);

    const [entry] = await db.insert(journalEntries).values({
      companyId,
      entryNumber,
      date: new Date(date),
      description,
      memo: memo || null,
      referenceNumber: referenceNumber || null,
      status: "DRAFT",
      createdBy: email || null,
    }).returning();

    for (const line of lines) {
      await db.insert(journalEntryLines).values({
        journalEntryId: entry.id,
        companyId,
        accountId: line.accountId,
        debit: parseFloat(line.debit) || 0,
        credit: parseFloat(line.credit) || 0,
        description: line.description || null,
        fundId: line.fundId || null,
      });
    }

    const { id: userId, email: userEmail, name: userName } = (req as any).user;
    logAudit({
      req,
      companyId,
      userId,
      userEmail,
      userName,
      action: "CREATE",
      entityType: "JOURNAL_ENTRY",
      entityId: entry.id,
      description: `Created journal entry ${entryNumber}: ${description}`,
      newValue: snap(entry as any),
    });

    res.status(201).json(await enrichEntry(entry, companyId));
  } catch (error) {
    console.error("Create JE error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { date, description, memo, referenceNumber, lines } = req.body ?? {};

    const existing = await db.select().from(journalEntries).where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.companyId, companyId))).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Not found" });
    if (existing[0].status === "POSTED") return res.status(400).json({ error: "Cannot edit posted entry" });

    const [updated] = await db.update(journalEntries).set({
      date: date ? new Date(date) : undefined,
      description,
      memo: memo || null,
      referenceNumber: referenceNumber || null,
      updatedAt: new Date(),
    }).where(eq(journalEntries.id, req.params.id)).returning();

    if (lines) {
      await db.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, req.params.id));
      for (const line of lines) {
        await db.insert(journalEntryLines).values({
          journalEntryId: req.params.id,
          companyId,
          accountId: line.accountId,
          debit: parseFloat(line.debit) || 0,
          credit: parseFloat(line.credit) || 0,
          description: line.description || null,
          fundId: line.fundId || null,
        });
      }
    }

    const { id: userId2, email: userEmail2, name: userName2 } = (req as any).user;
    logAudit({
      req,
      companyId,
      userId: userId2,
      userEmail: userEmail2,
      userName: userName2,
      action: "UPDATE",
      entityType: "JOURNAL_ENTRY",
      entityId: updated.id,
      description: `Updated journal entry ${updated.entryNumber}: ${updated.description}`,
      oldValue: snap(existing[0] as any),
      newValue: snap(updated as any),
    });

    res.json(await enrichEntry(updated, companyId));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const existing = await db.select().from(journalEntries).where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.companyId, companyId))).limit(1);
    if (!existing.length) return res.status(404).json({ error: "Not found" });
    if (existing[0].status === "POSTED") return res.status(400).json({ error: "Cannot delete posted entry" });

    await db.delete(journalEntryLines).where(eq(journalEntryLines.journalEntryId, req.params.id));
    await db.delete(journalEntries).where(eq(journalEntries.id, req.params.id));

    const { id: userId3, email: userEmail3, name: userName3 } = (req as any).user;
    logAudit({
      req,
      companyId,
      userId: userId3,
      userEmail: userEmail3,
      userName: userName3,
      action: "DELETE",
      entityType: "JOURNAL_ENTRY",
      entityId: existing[0].id,
      description: `Deleted journal entry ${existing[0].entryNumber}: ${existing[0].description}`,
      oldValue: snap(existing[0] as any),
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Shared helper: write GL entries for a journal entry (wipes existing first)
async function writeGlEntriesForJe(entry: any, companyId: string) {
  // Delete any existing GL entries for this JE (safe to re-run)
  await db.delete(glEntries).where(eq(glEntries.journalEntryId, entry.id));

  const lines = await db.select().from(journalEntryLines)
    .where(eq(journalEntryLines.journalEntryId, entry.id));

  // Look up accounts: prefer chart_of_accounts, fall back to legacy accounts table
  const allCoa = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
  const coaMap = Object.fromEntries(allCoa.map(a => [a.id, { id: a.id, code: a.code, name: a.name }]));
  const legacyAccts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
  const legacyMap = Object.fromEntries(legacyAccts.map(a => [a.id, { id: a.id, code: a.code, name: a.name }]));

  const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
  const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));

  let written = 0;
  for (const line of lines) {
    const account = coaMap[line.accountId] ?? legacyMap[line.accountId];
    if (!account) {
      console.warn(`[JE post] No account found for accountId=${line.accountId} — line skipped`);
      continue;
    }
    const fund = line.fundId ? fundMap[line.fundId] : null;

    if ((line.debit ?? 0) > 0) {
      await db.insert(glEntries).values({
        companyId,
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
        isVoid: false,
      });
      written++;
    }
    if ((line.credit ?? 0) > 0) {
      await db.insert(glEntries).values({
        companyId,
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
        isVoid: false,
      });
      written++;
    }
  }
  return written;
}

router.post("/:id/post", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [entry] = await db.select().from(journalEntries)
      .where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.companyId, companyId)));
    if (!entry) return res.status(404).json({ error: "Not found" });
    if (entry.status === "VOID") return res.status(400).json({ error: "Cannot post a voided entry" });

    // Write (or regenerate) GL entries — works for both DRAFT→POSTED and re-posting already-POSTED
    const written = await writeGlEntriesForJe(entry, companyId);
    if (written === 0) {
      return res.status(422).json({ error: "No valid account lines found — check that all lines have a recognized account selected." });
    }

    const [updated] = await db.update(journalEntries).set({
      status: "POSTED",
      postedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(journalEntries.id, req.params.id)).returning();

    // Recompute bank balances for any bank accounts whose GL account was touched
    const postedLines = await db.select({ accountId: journalEntryLines.accountId })
      .from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, entry.id));
    const uniqueAccountIds = [...new Set(postedLines.map(l => l.accountId))];
    await Promise.all(uniqueAccountIds.map(id => recomputeBankBalanceByGlAccount(id, companyId).catch(() => {})));

    res.json(await enrichEntry(updated, companyId));
  } catch (error) {
    console.error("Post JE error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/void", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [existing] = await db.select().from(journalEntries)
      .where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.companyId, companyId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    // Capture affected account IDs before voiding GL entries
    const voidLines = await db.select({ accountId: journalEntryLines.accountId })
      .from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, req.params.id));
    const uniqueVoidAccountIds = [...new Set(voidLines.map(l => l.accountId))];

    // Void all GL entries generated by this JE
    await db.update(glEntries)
      .set({ isVoid: true, updatedAt: new Date() })
      .where(and(eq(glEntries.journalEntryId, req.params.id), eq(glEntries.companyId, companyId)));

    const [updated] = await db.update(journalEntries).set({
      status: "VOID",
      voidedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(journalEntries.id, req.params.id)).returning();

    // Recompute bank balances for affected bank accounts
    await Promise.all(uniqueVoidAccountIds.map(id => recomputeBankBalanceByGlAccount(id, companyId).catch(() => {})));

    res.json(await enrichEntry(updated, companyId));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
