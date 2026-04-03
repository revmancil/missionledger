import { Router } from "express";
import { db, funds, donations, expenses, glEntries, chartOfAccounts } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString } from "../lib/safeIso";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(funds).where(eq(funds.companyId, companyId)).orderBy(desc(funds.createdAt));

    const allDonations = await db.select().from(donations).where(eq(donations.companyId, companyId));
    const allExpenses = await db.select().from(expenses).where(eq(expenses.companyId, companyId));

    // Aggregate GL entries per fund — only for equity/income/expense account types
    // (avoids double-counting asset/liability accounts in the fund balance)
    // OPENING_BALANCE and MANUAL_JE entries are the primary additional sources.
    const glRows = await db.execute(sql`
      SELECT
        g.fund_id,
        SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END) AS total_credit,
        SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END) AS total_debit
      FROM gl_entries g
      JOIN chart_of_accounts c ON c.id = g.account_id
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND g.fund_id IS NOT NULL
        AND c.coa_type IN ('EQUITY', 'INCOME', 'EXPENSE')
      GROUP BY g.fund_id
    `);

    // Build a map: fundId → net GL contribution (credits − debits for equity-like accounts)
    const glByFund: Record<string, number> = {};
    for (const row of glRows.rows as any[]) {
      const credit = parseFloat(row.total_credit) || 0;
      const debit  = parseFloat(row.total_debit)  || 0;
      // For equity/income: credit normal (positive contribution)
      // For expense: debit normal (negative contribution) → credit - debit is still correct sign
      glByFund[row.fund_id] = credit - debit;
    }

    const enriched = all.map(fund => {
      const fundDonations = allDonations.filter(d => d.fundId === fund.id);
      const fundExpenses  = allExpenses.filter(e => e.fundId === fund.id);
      const totalDonations = fundDonations.reduce((s, d) => s + (d.amount || 0), 0);
      const totalExpenses  = fundExpenses.reduce((s, e)  => s + (e.amount || 0), 0);
      const glContribution = glByFund[fund.id] ?? 0;

      // Total balance = old-style donations/expenses + GL-entry-based contribution
      const balance = totalDonations - totalExpenses + glContribution;

      if (glContribution !== 0) {
        console.log(
          `[Fund Balance] "${fund.name}": donations=${totalDonations.toFixed(2)}, expenses=${totalExpenses.toFixed(2)}, GL contribution=${glContribution.toFixed(2)}, total=${balance.toFixed(2)}`
        );
      }

      return {
        ...fund,
        createdAt: toIsoString(fund.createdAt),
        updatedAt: toIsoString(fund.updatedAt),
        balance,
        totalDonations,
        totalExpenses,
        glContribution,
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error("Funds GET error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, fundType, isActive } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "Name is required" });

    const [created] = await db.insert(funds).values({
      companyId,
      name,
      description: description || null,
      fundType: fundType || "UNRESTRICTED",
      isActive: isActive !== false,
    }).returning();

    res.status(201).json({
      ...created,
      createdAt: toIsoString(created.createdAt),
      updatedAt: toIsoString(created.updatedAt),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, fundType, isActive } = req.body ?? {};

    const [updated] = await db.update(funds).set({
      name,
      description: description || null,
      fundType: fundType || "UNRESTRICTED",
      isActive,
      updatedAt: new Date(),
    }).where(and(eq(funds.id, req.params.id), eq(funds.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({
      ...updated,
      createdAt: toIsoString(updated.createdAt),
      updatedAt: toIsoString(updated.updatedAt),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(funds).where(and(eq(funds.id, req.params.id), eq(funds.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
