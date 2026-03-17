import { Router } from "express";
import { db, reconciliations, reconciliationItems, bankTransactions, bankAccounts } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(reconciliations).where(eq(reconciliations.companyId, companyId)).orderBy(desc(reconciliations.statementDate));
    res.json(all.map(r => ({
      ...r,
      statementDate: r.statementDate.toISOString(),
      reconciledAt: r.reconciledAt?.toISOString() || null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, statementDate, statementBalance, openingBalance } = req.body ?? {};
    if (!bankAccountId || !statementDate || statementBalance === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [recon] = await db.insert(reconciliations).values({
      companyId,
      bankAccountId,
      statementDate: new Date(statementDate),
      statementBalance: parseFloat(statementBalance),
      openingBalance: parseFloat(openingBalance) || 0,
      status: "IN_PROGRESS",
    }).returning();

    // Create reconciliation items for unreconciled transactions in this bank account
    const transactions = await db.select().from(bankTransactions).where(
      and(eq(bankTransactions.companyId, companyId), eq(bankTransactions.bankAccountId, bankAccountId))
    );

    for (const tx of transactions) {
      if (tx.status !== "RECONCILED") {
        await db.insert(reconciliationItems).values({
          reconciliationId: recon.id,
          bankTransactionId: tx.id,
          cleared: false,
        });
      }
    }

    res.status(201).json({ ...recon, statementDate: recon.statementDate.toISOString(), reconciledAt: null, createdAt: recon.createdAt.toISOString(), updatedAt: recon.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/items", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const items = await db.select().from(reconciliationItems).where(eq(reconciliationItems.reconciliationId, req.params.id));
    const transactions = await db.select().from(bankTransactions).where(eq(bankTransactions.companyId, companyId));
    const txMap = Object.fromEntries(transactions.map(t => [t.id, t]));

    res.json(items.map(item => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      bankTransaction: txMap[item.bankTransactionId] ? {
        ...txMap[item.bankTransactionId],
        date: txMap[item.bankTransactionId].date.toISOString(),
        createdAt: txMap[item.bankTransactionId].createdAt.toISOString(),
        updatedAt: txMap[item.bankTransactionId].updatedAt.toISOString(),
      } : null,
    })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/items", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { itemIds, cleared } = req.body ?? {};
    if (!itemIds || cleared === undefined) return res.status(400).json({ error: "Missing fields" });

    for (const itemId of itemIds) {
      await db.update(reconciliationItems).set({ cleared, updatedAt: new Date() }).where(eq(reconciliationItems.id, itemId));
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/finish", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const [recon] = await db.select().from(reconciliations).where(and(eq(reconciliations.id, req.params.id), eq(reconciliations.companyId, companyId)));
    if (!recon) return res.status(404).json({ error: "Not found" });

    // Calculate cleared balance
    const items = await db.select().from(reconciliationItems).where(eq(reconciliationItems.reconciliationId, req.params.id));
    const clearedItemIds = items.filter(i => i.cleared).map(i => i.bankTransactionId);
    
    const transactions = await db.select().from(bankTransactions).where(eq(bankTransactions.companyId, companyId));
    const clearedTxs = transactions.filter(t => clearedItemIds.includes(t.id));
    const clearedBalance = (recon.openingBalance || 0) + clearedTxs.reduce((s, t) => {
      return t.type === "CREDIT" ? s + (t.amount || 0) : s - (t.amount || 0);
    }, 0);
    const difference = recon.statementBalance - clearedBalance;

    const [updated] = await db.update(reconciliations).set({
      clearedBalance,
      difference,
      status: "COMPLETED",
      reconciledBy: email || null,
      reconciledAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reconciliations.id, req.params.id)).returning();

    res.json({ ...updated, statementDate: updated.statementDate.toISOString(), reconciledAt: updated.reconciledAt?.toISOString() || null, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
