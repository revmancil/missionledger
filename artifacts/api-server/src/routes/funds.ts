import { Router } from "express";
import { db, funds, glEntries, chartOfAccounts } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString } from "../lib/safeIso";
import { sqlRows } from "../lib/sqlRows";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(funds).where(eq(funds.companyId, companyId)).orderBy(desc(funds.createdAt));

    // Fund balance = GL entries only (INCOME/EXPENSE/EQUITY), credit − debit.
    // Transactions recorded in the bank register already create the income/expense
    // GL entries — adding the donations/expenses tables on top double-counts them.
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

    const glByFund: Record<string, number> = {};
    for (const row of sqlRows(glRows) as any[]) {
      const credit = parseFloat(row.total_credit) || 0;
      const debit  = parseFloat(row.total_debit)  || 0;
      glByFund[row.fund_id] = credit - debit;
    }

    const enriched = all.map(fund => {
      const balance = glByFund[fund.id] ?? 0;
      return {
        ...fund,
        createdAt: toIsoString(fund.createdAt),
        updatedAt: toIsoString(fund.updatedAt),
        balance,
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

    // Fund ledger: only INCOME, EXPENSE, and EQUITY GL entries.
    // ASSET/LIABILITY entries are the "other side" of double-entry and would
    // double-count against income/expense entries.
    const glRows = await db.execute(sql`
      SELECT
        ge.id,
        ge.date,
        ge.entry_type,
        ge.amount,
        ge.description,
        ge.source_type,
        ge.is_void,
        ge.created_at,
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

    const toDateIso = (d: unknown): string | null => {
      if (!d) return null;
      if (d instanceof Date) return d.toISOString();
      return String(d);
    };
    const toEpoch = (d: unknown): number => {
      const iso = toDateIso(d);
      if (!iso) return 0;
      const t = new Date(iso).getTime();
      return isNaN(t) ? 0 : t;
    };

    // Build entries from GL rows only — sorted by date then created_at
    let runningBalance = 0;
    const unsorted = (sqlRows(glRows) as any[]).map((r) => {
      const amount = Number(r.amount ?? 0);
      const isDebit = String(r.entry_type).toUpperCase() === "DEBIT";
      return {
        id: r.id,
        date: toDateIso(r.date),
        description: r.description ?? null,
        sourceType: r.source_type,
        reference: r.journal_entry_number || r.reference_number || null,
        accountCode: r.account_code ?? null,
        accountName: r.account_name ?? null,
        accountType: r.account_type ?? null,
        credit: !isDebit ? amount : null,
        debit: isDebit ? amount : null,
        sortDate: toEpoch(r.date),
        sortCreated: toEpoch(r.created_at),
      };
    });

    unsorted.sort((a, b) =>
      a.sortDate !== b.sortDate ? a.sortDate - b.sortDate : a.sortCreated - b.sortCreated
    );

    const entries = unsorted.map((r) => {
      runningBalance += (r.credit ?? 0) - (r.debit ?? 0);
      return {
        id: r.id,
        date: r.date,
        description: r.description,
        sourceType: r.sourceType,
        reference: r.reference,
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        debit: r.debit,
        credit: r.credit,
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
