import { Router } from "express";
import {
  db, reconciliations, reconciliationItems,
  bankTransactions, bankAccounts, transactions,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

function serializeRecon(r: any) {
  return {
    ...r,
    statementDate: r.statementDate instanceof Date ? r.statementDate.toISOString() : r.statementDate,
    reconciledAt: r.reconciledAt instanceof Date ? r.reconciledAt.toISOString() : (r.reconciledAt ?? null),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

const router = Router();

// ── GET / — history ──────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db
      .select().from(reconciliations)
      .where(eq(reconciliations.companyId, companyId))
      .orderBy(desc(reconciliations.statementDate));
    res.json(all.map(serializeRecon));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST / — start new reconciliation session ────────────────────────────────
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { bankAccountId, statementDate, statementBalance, openingBalance: openingBalanceInput } = req.body ?? {};
    if (!bankAccountId || !statementDate || statementBalance === undefined)
      return res.status(400).json({ error: "bankAccountId, statementDate, statementBalance are required" });

    const stmtDate = new Date(statementDate);

    // Opening balance: always use last completed recon's clearedBalance when one exists.
    // Otherwise fall back to the value the user entered (openingBalanceInput).
    const [lastRecon] = await db
      .select().from(reconciliations)
      .where(and(
        eq(reconciliations.companyId, companyId),
        eq(reconciliations.bankAccountId, bankAccountId),
        eq(reconciliations.status, "COMPLETED")
      ))
      .orderBy(desc(reconciliations.statementDate))
      .limit(1);

    let openingBalance = 0;
    if (lastRecon) {
      openingBalance = lastRecon.clearedBalance ?? 0;
    } else if (openingBalanceInput !== undefined) {
      openingBalance = parseFloat(openingBalanceInput) || 0;
    }

    // Void any prior IN_PROGRESS sessions for this bank account
    await db.update(reconciliations)
      .set({ status: "VOID", updatedAt: new Date() })
      .where(and(
        eq(reconciliations.companyId, companyId),
        eq(reconciliations.bankAccountId, bankAccountId),
        eq(reconciliations.status, "IN_PROGRESS")
      ));

    const [recon] = await db.insert(reconciliations).values({
      companyId, bankAccountId,
      statementDate: stmtDate,
      statementBalance: parseFloat(statementBalance),
      openingBalance,
      status: "IN_PROGRESS",
    }).returning();

    // Build items from new transactions table
    const allTx = await db.select().from(transactions)
      .where(and(eq(transactions.companyId, companyId), eq(transactions.bankAccountId, bankAccountId)));

    const eligible = allTx.filter((t) => {
      if (t.isVoid || t.status === "RECONCILED") return false;
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d <= stmtDate;
    });

    for (const tx of eligible) {
      await db.insert(reconciliationItems).values({
        reconciliationId: recon.id,
        transactionId: tx.id,
        bankTransactionId: null,
        cleared: tx.status === "CLEARED",
      });
    }

    res.status(201).json(serializeRecon(recon));
  } catch (err) {
    console.error("Start recon error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /:id/items — workspace data ──────────────────────────────────────────
router.get("/:id/items", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [recon] = await db.select().from(reconciliations)
      .where(and(eq(reconciliations.id, req.params.id), eq(reconciliations.companyId, companyId)));
    if (!recon) return res.status(404).json({ error: "Not found" });

    const items = await db.select().from(reconciliationItems)
      .where(eq(reconciliationItems.reconciliationId, req.params.id));

    const txList = await db.select().from(transactions)
      .where(eq(transactions.companyId, companyId));
    const txMap = Object.fromEntries(txList.map((t) => [t.id, t]));

    const enriched = items.map((item) => {
      const tx = item.transactionId ? txMap[item.transactionId] : null;
      return {
        id: item.id,
        reconciliationId: item.reconciliationId,
        transactionId: item.transactionId ?? null,
        cleared: item.cleared,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        transaction: tx ? {
          id: tx.id,
          date: (tx.date instanceof Date ? tx.date : new Date(tx.date)).toISOString(),
          payee: tx.payee,
          amount: tx.amount,
          type: tx.type,
          status: tx.status,
          checkNumber: tx.checkNumber ?? null,
          memo: tx.memo ?? null,
        } : null,
      };
    });

    res.json({ reconciliation: serializeRecon(recon), items: enriched });
  } catch (err) {
    console.error("Get recon items error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /:id/items/:itemId — toggle single item ────────────────────────────
router.patch("/:id/items/:itemId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { cleared } = req.body ?? {};
    if (cleared === undefined) return res.status(400).json({ error: "cleared is required" });
    await db.update(reconciliationItems)
      .set({ cleared: !!cleared, updatedAt: new Date() })
      .where(and(
        eq(reconciliationItems.id, req.params.itemId),
        eq(reconciliationItems.reconciliationId, req.params.id)
      ));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:id/complete — finalize & lock ─────────────────────────────────────
router.post("/:id/complete", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;

    const [recon] = await db.select().from(reconciliations)
      .where(and(eq(reconciliations.id, req.params.id), eq(reconciliations.companyId, companyId)));
    if (!recon) return res.status(404).json({ error: "Not found" });
    if (recon.status === "COMPLETED") return res.status(400).json({ error: "Already reconciled" });

    const items = await db.select().from(reconciliationItems)
      .where(eq(reconciliationItems.reconciliationId, req.params.id));

    const clearedItems = items.filter((i) => i.cleared);
    const txIds = clearedItems.map((i) => i.transactionId).filter(Boolean) as string[];

    const txList = await db.select().from(transactions)
      .where(eq(transactions.companyId, companyId));
    const txMap = Object.fromEntries(txList.map((t) => [t.id, t]));

    const clearedBalance = (recon.openingBalance ?? 0) + clearedItems.reduce((sum, item) => {
      if (!item.transactionId) return sum;
      const tx = txMap[item.transactionId];
      if (!tx) return sum;
      return tx.type === "CREDIT" ? sum + tx.amount : sum - tx.amount;
    }, 0);

    const difference = recon.statementBalance - clearedBalance;

    if (Math.abs(difference) > 0.005)
      return res.status(400).json({
        error: `Cannot reconcile: difference of $${Math.abs(difference).toFixed(2)} must be $0.00`,
      });

    // Lock cleared transactions
    for (const txId of txIds) {
      await db.update(transactions)
        .set({ status: "RECONCILED", updatedAt: new Date() })
        .where(eq(transactions.id, txId));
    }

    const [finished] = await db.update(reconciliations)
      .set({ clearedBalance, difference, status: "COMPLETED", reconciledBy: email ?? null, reconciledAt: new Date(), updatedAt: new Date() })
      .where(eq(reconciliations.id, req.params.id))
      .returning();

    res.json(serializeRecon(finished));
  } catch (err) {
    console.error("Complete recon error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:id/reopen — revert COMPLETED back to IN_PROGRESS ──────────────────
router.post("/:id/reopen", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [recon] = await db.select().from(reconciliations)
      .where(and(eq(reconciliations.id, req.params.id), eq(reconciliations.companyId, companyId)));
    if (!recon) return res.status(404).json({ error: "Not found" });
    if (recon.status !== "COMPLETED") return res.status(400).json({ error: "Only completed reconciliations can be reopened" });

    // Find all transaction IDs that were cleared in this reconciliation
    const items = await db.select().from(reconciliationItems)
      .where(eq(reconciliationItems.reconciliationId, req.params.id));
    const clearedTxIds = items.filter((i) => i.cleared && i.transactionId).map((i) => i.transactionId as string);

    // Unlock those transactions back to CLEARED
    for (const txId of clearedTxIds) {
      await db.update(transactions)
        .set({ status: "CLEARED", updatedAt: new Date() })
        .where(and(eq(transactions.id, txId), eq(transactions.companyId, companyId)));
    }

    // Revert reconciliation to IN_PROGRESS
    const [reopened] = await db.update(reconciliations)
      .set({
        status: "IN_PROGRESS",
        clearedBalance: null,
        difference: null,
        reconciledBy: null,
        reconciledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(reconciliations.id, req.params.id))
      .returning();

    res.json(serializeRecon(reopened));
  } catch (err) {
    console.error("Reopen recon error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /:id — remove VOID or IN_PROGRESS sessions only ───────────────────
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [recon] = await db.select().from(reconciliations)
      .where(and(eq(reconciliations.id, req.params.id), eq(reconciliations.companyId, companyId)));
    if (!recon) return res.status(404).json({ error: "Not found" });
    if (recon.status === "COMPLETED")
      return res.status(400).json({ error: "Completed reconciliations cannot be deleted." });

    // Delete items first, then the session
    await db.delete(reconciliationItems).where(eq(reconciliationItems.reconciliationId, req.params.id));
    await db.delete(reconciliations).where(eq(reconciliations.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error("Delete recon error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Legacy ────────────────────────────────────────────────────────────────────
router.put("/:id/items", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { itemIds, cleared } = req.body ?? {};
    if (!itemIds || cleared === undefined) return res.status(400).json({ error: "Missing fields" });
    for (const id of itemIds) {
      await db.update(reconciliationItems).set({ cleared, updatedAt: new Date() }).where(eq(reconciliationItems.id, id));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/finish", requireAuth, requireAdmin, (req, res) => {
  res.redirect(307, `/${req.params.id}/complete`);
});

export default router;
