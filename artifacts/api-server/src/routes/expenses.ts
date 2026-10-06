import { Router } from "express";
import { db, expenses, funds, accounts, vendors } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { foreignIdError } from "../lib/ownership";
import { postSimpleJournalEntry, voidPostedJournalEntry } from "../lib/postJournalEntry";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(expenses).where(eq(expenses.companyId, companyId)).orderBy(desc(expenses.date));
    
    const allFunds = await db.select().from(funds).where(eq(funds.companyId, companyId));
    const allVendors = await db.select().from(vendors).where(eq(vendors.companyId, companyId));
    const fundMap = Object.fromEntries(allFunds.map(f => [f.id, f]));
    const vendorMap = Object.fromEntries(allVendors.map(v => [v.id, v]));

    const enriched = all.map(e => ({
      ...e,
      date: e.date.toISOString(),
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      fund: e.fundId ? fundMap[e.fundId] || null : null,
      vendor: e.vendorId ? vendorMap[e.vendorId] || null : null,
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const { description, amount, date, category, fundId, accountId, cashAccountId, vendorId, notes } = req.body ?? {};
    {
      const bad = await foreignIdError(companyId, { fund: fundId, glAccount: [accountId, cashAccountId], vendor: vendorId });
      if (bad) return void res.status(400).json({ error: bad });
    }
    if (!description || !amount || !date || !category) {
      return void res.status(400).json({ error: "Missing required fields" });
    }
    if (!accountId || !cashAccountId) {
      return void res.status(400).json({ error: "An expense account and a cash/bank account are both required so the expense can post to the general ledger." });
    }

    const expenseAmount = parseFloat(amount);
    const expenseDate = new Date(date);

    const [created] = await db.insert(expenses).values({
      companyId,
      description,
      amount: expenseAmount,
      date: expenseDate,
      category,
      fundId: fundId || null,
      accountId,
      cashAccountId,
      vendorId: vendorId || null,
      notes: notes || null,
    }).returning();

    try {
      const je = await postSimpleJournalEntry(companyId, {
        date: expenseDate,
        description: `Expense: ${description}`,
        createdBy: email ?? null,
        lines: [
          { accountId, debit: expenseAmount, fundId: fundId || null },
          { accountId: cashAccountId, credit: expenseAmount, fundId: fundId || null },
        ],
      });
      await db.update(expenses).set({ journalEntryId: je.id }).where(eq(expenses.id, created.id));
      created.journalEntryId = je.id;
    } catch (glError) {
      await db.delete(expenses).where(eq(expenses.id, created.id));
      console.error("Expense GL posting failed:", glError);
      return void res.status(422).json({ error: glError instanceof Error ? glError.message : "Failed to post expense to the general ledger." });
    }

    res.status(201).json({ ...created, date: created.date.toISOString(), createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const { description, amount, date, category, fundId, accountId, cashAccountId, vendorId, notes } = req.body ?? {};
    {
      const bad = await foreignIdError(companyId, { fund: fundId, glAccount: [accountId, cashAccountId], vendor: vendorId });
      if (bad) return void res.status(400).json({ error: bad });
    }

    const [existing] = await db.select().from(expenses).where(and(eq(expenses.id, req.params.id), eq(expenses.companyId, companyId))).limit(1);
    if (!existing) return void res.status(404).json({ error: "Not found" });

    const nextAccountId = accountId !== undefined ? accountId : existing.accountId;
    const nextCashAccountId = cashAccountId !== undefined ? cashAccountId : existing.cashAccountId;
    if (!nextAccountId || !nextCashAccountId) {
      return void res.status(400).json({ error: "An expense account and a cash/bank account are both required so the expense can post to the general ledger." });
    }

    const [updated] = await db.update(expenses).set({
      description,
      amount: amount ? parseFloat(amount) : undefined,
      date: date ? new Date(date) : undefined,
      category,
      fundId: fundId !== undefined ? (fundId || null) : undefined,
      accountId: nextAccountId,
      cashAccountId: nextCashAccountId,
      vendorId: vendorId !== undefined ? (vendorId || null) : undefined,
      notes: notes !== undefined ? (notes || null) : undefined,
      updatedAt: new Date(),
    }).where(and(eq(expenses.id, req.params.id), eq(expenses.companyId, companyId))).returning();

    // Re-post the GL entry from scratch against the now-current values, same way gl.ts
    // regenerates a transaction's entries rather than diffing them.
    if (existing.journalEntryId) await voidPostedJournalEntry(existing.journalEntryId, companyId);
    try {
      const je = await postSimpleJournalEntry(companyId, {
        date: updated.date,
        description: `Expense: ${updated.description}`,
        createdBy: email ?? null,
        lines: [
          { accountId: nextAccountId, debit: updated.amount, fundId: updated.fundId ?? null },
          { accountId: nextCashAccountId, credit: updated.amount, fundId: updated.fundId ?? null },
        ],
      });
      await db.update(expenses).set({ journalEntryId: je.id }).where(eq(expenses.id, updated.id));
      updated.journalEntryId = je.id;
    } catch (glError) {
      console.error("Expense GL re-posting failed:", glError);
      return void res.status(422).json({ error: glError instanceof Error ? glError.message : "Failed to post expense to the general ledger." });
    }

    res.json({ ...updated, date: updated.date.toISOString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [existing] = await db.select({ journalEntryId: expenses.journalEntryId })
      .from(expenses)
      .where(and(eq(expenses.id, req.params.id), eq(expenses.companyId, companyId)))
      .limit(1);
    if (existing?.journalEntryId) await voidPostedJournalEntry(existing.journalEntryId, companyId);

    await db.delete(expenses).where(and(eq(expenses.id, req.params.id), eq(expenses.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
