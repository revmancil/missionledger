import { Router } from "express";
import { db, journalEntries, journalEntryLines, accounts, chartOfAccounts, glEntries, funds } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { logAudit, snap } from "../lib/audit";

const router = Router();

async function generateEntryNumber(companyId: string): Promise<string> {
  const entries = await db.select({ entryNumber: journalEntries.entryNumber })
    .from(journalEntries)
    .where(eq(journalEntries.companyId, companyId))
    .orderBy(desc(journalEntries.createdAt))
    .limit(1);

  let nextNumber = 1;
  if (entries.length) {
    const match = entries[0].entryNumber.match(/JE-(\d+)/);
    if (match) nextNumber = parseInt(match[1]) + 1;
  }
  return `JE-${String(nextNumber).padStart(6, "0")}`;
}

async function enrichEntry(entry: any, companyId: string) {
  const lines = await db.select().from(journalEntryLines).where(eq(journalEntryLines.journalEntryId, entry.id));

  // Use chartOfAccounts (the GL-backed COA) for correct account resolution
  const allCoa = await db.select().from(chartOfAccounts).where(eq(chartOfAccounts.companyId, companyId));
  const coaMap = Object.fromEntries(allCoa.map(a => [a.id, a]));

  // Also include fund names on each line
  const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
  const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));

  return {
    ...entry,
    date: entry.date instanceof Date ? entry.date.toISOString() : entry.date,
    postedAt: entry.postedAt ? (entry.postedAt instanceof Date ? entry.postedAt.toISOString() : entry.postedAt) : null,
    voidedAt: entry.voidedAt ? (entry.voidedAt instanceof Date ? entry.voidedAt.toISOString() : entry.voidedAt) : null,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
    updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt,
    lines: lines.map(l => ({
      ...l,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : l.createdAt,
      account: coaMap[l.accountId] || null,
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

    const entryNumber = await generateEntryNumber(companyId);

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

router.post("/:id/post", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [entry] = await db.select().from(journalEntries)
      .where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.companyId, companyId)));
    if (!entry) return res.status(404).json({ error: "Not found" });
    if (entry.status === "POSTED") return res.status(400).json({ error: "Already posted" });

    const lines = await db.select().from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, entry.id));

    const allAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
    const accountMap = Object.fromEntries(allAccounts.map(a => [a.id, a]));

    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));

    for (const line of lines) {
      const account = accountMap[line.accountId];
      if (!account) continue;
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
        });
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
        });
      }
    }

    const [updated] = await db.update(journalEntries).set({
      status: "POSTED",
      postedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(journalEntries.id, req.params.id)).returning();

    res.json(await enrichEntry(updated, companyId));
  } catch (error) {
    console.error("Post JE error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/void", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [updated] = await db.update(journalEntries).set({
      status: "VOID",
      voidedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(journalEntries.id, req.params.id), eq(journalEntries.companyId, companyId))).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(await enrichEntry(updated, companyId));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
