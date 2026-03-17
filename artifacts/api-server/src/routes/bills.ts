import { Router } from "express";
import { db, bills, billPayments, vendors } from "@workspace/db";
import { eq, and, desc, sum } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

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
    if (!description || !amount || !dueDate) return res.status(400).json({ error: "Missing required fields" });

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

    const [updated] = await db.update(bills).set({
      vendorId: vendorId || null,
      description,
      amount: amount ? parseFloat(amount) : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      accountId: accountId || null,
      fundId: fundId || null,
      status: status as any,
      updatedAt: new Date(),
    }).where(and(eq(bills.id, req.params.id), eq(bills.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, dueDate: updated.dueDate.toISOString(), createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(billPayments).where(eq(billPayments.billId, req.params.id));
    await db.delete(bills).where(and(eq(bills.id, req.params.id), eq(bills.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/payments", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { amount, date, cashAccountId, notes } = req.body ?? {};
    if (!amount || !date) return res.status(400).json({ error: "Missing required fields" });

    const bill = await db.select().from(bills).where(and(eq(bills.id, req.params.id), eq(bills.companyId, companyId))).limit(1);
    if (!bill.length) return res.status(404).json({ error: "Bill not found" });

    const [payment] = await db.insert(billPayments).values({
      billId: req.params.id,
      companyId,
      amount: parseFloat(amount),
      date: new Date(date),
      cashAccountId: cashAccountId || null,
      notes: notes || null,
    }).returning();

    // Update bill status
    const allPayments = await db.select().from(billPayments).where(eq(billPayments.billId, req.params.id));
    const totalPaid = allPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const newStatus = totalPaid >= bill[0].amount ? "PAID" : "PARTIAL";
    await db.update(bills).set({ status: newStatus as any, updatedAt: new Date() }).where(eq(bills.id, req.params.id));

    res.status(201).json({ ...payment, date: payment.date.toISOString(), createdAt: payment.createdAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
