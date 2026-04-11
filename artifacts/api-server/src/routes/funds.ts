import { Router } from "express";
import { db, funds, donations, expenses, glEntries, chartOfAccounts } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString } from "../lib/safeIso";
import { sqlRows } from "../lib/sqlRows";

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
    for (const row of sqlRows(glRows) as any[]) {
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

// GET /funds/:id/ledger — all GL entries tagged to this fund, chronological with running balance
router.get("/:id/ledger", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const fundId = req.params.id;

    const [fund] = await db
      .select()
      .from(funds)
      .where(and(eq(funds.id, fundId), eq(funds.companyId, companyId)));
    if (!fund) return res.status(404).json({ error: "Fund not found" });

    // Fund ledger: only INCOME, EXPENSE, and EQUITY entries.
    // ASSET/LIABILITY entries are the "other side" of double-entry and would
    // double-count against the income/expense entries, producing wrong balances.
    // This matches the same filter used on the fund balance cards.
    const rows = await db.execute(sql`
      SELECT
        ge.id,
        ge.date,
        ge.entry_type,
        ge.amount,
        ge.description,
        ge.source_type,
        ge.is_void,
        c.code    AS account_code,
        c.name    AS account_name,
        c.coa_type AS account_type,
        je.entry_number     AS journal_entry_number,
        je.reference_number AS reference_number
      FROM gl_entries ge
      JOIN chart_of_accounts c ON c.id = ge.account_id
      LEFT JOIN journal_entries je ON ge.journal_entry_id = je.id
      WHERE ge.fund_id    = ${fundId}
        AND ge.company_id = ${companyId}
        AND (ge.is_void IS NULL OR ge.is_void = false)
        AND c.coa_type IN ('INCOME', 'EXPENSE', 'EQUITY')
      ORDER BY ge.date ASC, ge.created_at ASC
    `);

    // Running balance: net fund position (credits add, debits subtract)
    // This matches the logic used in GET /funds for the balance card.
    let runningBalance = 0;
    const entries = sqlRows(rows).map((r: any) => {
      const amount = Number(r.amount ?? 0);
      const isDebit = String(r.entry_type).toUpperCase() === "DEBIT";
      const coaType = String(r.account_type ?? "").toUpperCase();

      // Asset / Expense = debit-normal  → debit increases fund activity
      // Income / Equity / Liability     → credit-normal → credit increases fund activity
      const isDebitNormal = coaType === "ASSET" || coaType === "EXPENSE";
      if (isDebitNormal) {
        runningBalance += isDebit ? -amount : amount; // expense debits reduce net position
      } else {
        runningBalance += isDebit ? -amount : amount; // same: credit adds, debit subtracts
      }

      const d = r.date;
      const dateIso = d instanceof Date ? d.toISOString() : d != null ? String(d) : null;

      return {
        id: r.id,
        date: dateIso,
        description: r.description,
        sourceType: r.source_type,
        reference: r.journal_entry_number || r.reference_number || null,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        debit: isDebit ? amount : null,
        credit: !isDebit ? amount : null,
        runningBalance,
      };
    });

    res.json({
      fund: {
        ...fund,
        createdAt: toIsoString(fund.createdAt),
        updatedAt: toIsoString(fund.updatedAt),
      },
      entries,
    });
  } catch (error) {
    console.error("Fund ledger error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
