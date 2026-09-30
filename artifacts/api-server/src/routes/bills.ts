import { Router } from "express";
import { db, bills, billPayments, vendors } from "@workspace/db";
import { eq, and, desc, sum } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { postSimpleJournalEntry, voidPostedJournalEntry } from "../lib/postJournalEntry";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(bills).where(eq(bills.companyId, companyId)).orderBy(desc(bills.dueDate));
    const allPayments = await db.select().from(billPayments).where(eq(billPayments.companyId, companyId));
    const allVendors = await db.select().from(vendors).where(eq(vendors.companyId, companyId));
    const vendorMap = Object.fromEntries(allVendors.map(v => [v.id, v]));

    const enriched = all.map(bill => {
      const payments = allPayments.filter(p => p.billId === bill.id);
      const paidAmount = payments.reduce((s, p) => s + (p.amount || 0), 0);
      return {
        ...bill,
        dueDate: bill.dueDate.toISOString(),
        createdAt: bill.createdAt.toISOString(),
        updatedAt: bill.updatedAt.toISOString(),
        vendor: bill.vendorId ? vendorMap[bill.vendorId] || null : null,
        payments: payments.map(p => ({ ...p, date: p.date.toISOString(), createdAt: p.createdAt.toISOString() })),
        paidAmount,
      };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { vendorId, description, amount, dueDate, accountId, fundId } = req.body ?? {};
    if (!description || !amount || !dueDate) return void res.status(400).json({ error: "Missing required fields" });
    if (!accountId) return void res.status(400).json({ error: "An expense account is required so the bill can post to the general ledger when paid." });

    const [created] = await db.insert(bills).values({
      companyId,
      vendorId: vendorId || null,
      description,
      amount: parseFloat(amount),
      dueDate: new Date(dueDate),
      status: "PENDING",
      accountId: accountId || null,
      fundId: fundId || null,
    }).returning();

    res.status(201).json({ ...created, dueDate: created.dueDate.toISOString(), createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString(), payments: [], paidAmount: 0 });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { vendorId, description, amount, dueDate, accountId, fundId, status } = req.body ?? {};
    if ("accountId" in (req.body ?? {}) && !accountId) {
      return void res.status(400).json({ error: "An expense account is required so the bill can post to the general ledger when paid." });
    }

    const [updated] = await db.update(bills).set({
      vendorId: vendorId || null,
      description,
      amount: amount ? parseFloat(amount) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      accountId: accountId || undefined,
      fundId: fundId || null,
      status: status as any,
      updatedAt: new Date(),
    }).where(and(eq(bills.id, req.params.id), eq(bills.companyId, companyId))).returning();

    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json({ ...updated, dueDate: updated.dueDate.toISOString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    // Verify tenant ownership BEFORE touching child rows. Deleting bill_payments by
    // billId alone would let any tenant wipe another tenant's payment records by
    // passing a foreign bill id (the parent delete below is scoped, but the child
    // delete used to run first and unscoped).
    const [bill] = await db.select({ id: bills.id }).from(bills)
      .where(and(eq(bills.id, req.params.id), eq(bills.companyId, companyId)))
      .limit(1);
    if (!bill) return void res.status(404).json({ error: "Not found" });

    const paymentsToRemove = await db.select({ journalEntryId: billPayments.journalEntryId })
      .from(billPayments)
      .where(and(eq(billPayments.billId, bill.id), eq(billPayments.companyId, companyId)));
    for (const p of paymentsToRemove) {
      if (p.journalEntryId) await voidPostedJournalEntry(p.journalEntryId, companyId);
    }

    await db.delete(billPayments)
      .where(and(eq(billPayments.billId, bill.id), eq(billPayments.companyId, companyId)));
    await db.delete(bills).where(and(eq(bills.id, bill.id), eq(bills.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/payments", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const { amount, date, cashAccountId, notes } = req.body ?? {};
    if (!amount || !date) return void res.status(400).json({ error: "Missing required fields" });
    if (!cashAccountId) return void res.status(400).json({ error: "A cash/bank account is required to record a payment." });

    const bill = await db.select().from(bills).where(and(eq(bills.id, req.params.id), eq(bills.companyId, companyId))).limit(1);
    if (!bill.length) return void res.status(404).json({ error: "Bill not found" });
    if (!bill[0].accountId) {
      return void res.status(400).json({ error: "This bill has no expense account set. Edit the bill to add one before recording a payment." });
    }

    const paymentAmount = parseFloat(amount);

    const [payment] = await db.insert(billPayments).values({
      billId: req.params.id,
      companyId,
      amount: paymentAmount,
      date: new Date(date),
      cashAccountId,
      notes: notes || null,
    }).returning();

    try {
      const je = await postSimpleJournalEntry(companyId, {
        date: payment.date,
        description: `Bill payment: ${bill[0].description}`,
        createdBy: email ?? null,
        lines: [
          { accountId: bill[0].accountId, debit: paymentAmount, fundId: bill[0].fundId ?? null },
          { accountId: cashAccountId, credit: paymentAmount, fundId: bill[0].fundId ?? null },
        ],
      });
      await db.update(billPayments).set({ journalEntryId: je.id }).where(eq(billPayments.id, payment.id));
    } catch (glError) {
      // Don't leave a payment on record that never hit the ledger.
      await db.delete(billPayments).where(eq(billPayments.id, payment.id));
      console.error("Bill payment GL posting failed:", glError);
      return void res.status(422).json({ error: glError instanceof Error ? glError.message : "Failed to post payment to the general ledger." });
    }

    // Update bill status
    const allPayments = await db.select().from(billPayments)
      .where(and(eq(billPayments.billId, req.params.id), eq(billPayments.companyId, companyId)));
    const totalPaid = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const newStatus = totalPaid >= bill[0].amount ? "PAID" : "PARTIAL";
    await db.update(bills).set({ status: newStatus as any, updatedAt: new Date() }).where(eq(bills.id, req.params.id));

    res.status(201).json({ ...payment, date: payment.date.toISOString(), createdAt: payment.createdAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
