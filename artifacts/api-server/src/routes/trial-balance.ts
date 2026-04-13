import { Router } from "express";
import { db, glEntries, transactions, transactionSplits, chartOfAccounts, bankAccounts, companies } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateGlEntries } from "../lib/gl";
import { sqlRows } from "../lib/sqlRows";

const router = Router();

// ── GET /trial-balance — compute trial balance ────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    // Fetch company to get closedUntil (current period boundary)
    const [company] = await db.select({ closedUntil: companies.closedUntil })
      .from(companies)
      .where(eq(companies.id, companyId));
    const closedUntil: Date | null = company?.closedUntil ?? null;

    // Sum debits and credits per account, joining COA for type.
    // INCOME/EXPENSE accounts are filtered to the current open period (after closedUntil).
    // ASSET/LIABILITY/EQUITY are always all-time (permanent accounts).
    const rows = await db.execute(sql`
      SELECT
        ge.account_id,
        ge.account_code,
        ge.account_name,
        coa.type AS coa_type,
        ROUND(SUM(CASE WHEN ge.entry_type = 'DEBIT'  THEN ge.amount ELSE 0 END)::numeric, 2) AS total_debit,
        ROUND(SUM(CASE WHEN ge.entry_type = 'CREDIT' THEN ge.amount ELSE 0 END)::numeric, 2) AS total_credit
      FROM gl_entries ge
      JOIN chart_of_accounts coa ON coa.id = ge.account_id
      WHERE ge.company_id = ${companyId}
        AND (ge.is_void IS NULL OR ge.is_void = false)
        AND (
          coa.type NOT IN ('INCOME', 'EXPENSE')
          OR ${closedUntil} IS NULL
          OR ge.date > ${closedUntil}
        )
      GROUP BY ge.account_id, ge.account_code, ge.account_name, coa.type
      ORDER BY ge.account_code
    `);

    const accounts = (rows.rows as any[]).map((r) => ({
      accountId:   r.account_id,
      accountCode: r.account_code,
      accountName: r.account_name,
      accountType: (r.coa_type as string) ?? "UNKNOWN",
      totalDebit:  parseFloat(r.total_debit)  || 0,
      totalCredit: parseFloat(r.total_credit) || 0,
      balance:     (parseFloat(r.total_debit) || 0) - (parseFloat(r.total_credit) || 0),
    }));

    const grandTotalDebit  = accounts.reduce((s, r) => s + r.totalDebit,  0);
    const grandTotalCredit = accounts.reduce((s, r) => s + r.totalCredit, 0);
    const difference       = grandTotalDebit - grandTotalCredit;
    const isBalanced       = Math.abs(difference) < 0.01;

    // Count of GL entries for informational display
    const countRow = sqlRows(
      await db.execute(
        sql`SELECT COUNT(*)::int AS count FROM gl_entries WHERE company_id = ${companyId} AND is_void = false`,
      ),
    )[0] as { count?: number } | undefined;
    const count = countRow?.count ?? 0;

    // Period info: the day after closedUntil is the first day of the current open period
    const periodStart: string | null = closedUntil
      ? new Date(closedUntil.getTime() + 86400000).toISOString()
      : null;

    res.json({
      accounts,
      grandTotalDebit,
      grandTotalCredit,
      difference,
      isBalanced,
      glEntryCount: Number(count) || 0,
      closedUntil: closedUntil ? closedUntil.toISOString() : null,
      periodStart,
    });
  } catch (err) {
    console.error("Trial balance error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /trial-balance/health — lightweight check for dashboard badge ─────────
router.get("/health", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const result = await db.execute(sql`
      SELECT
        ROUND(SUM(CASE WHEN entry_type = 'DEBIT'  THEN amount ELSE 0 END)::numeric, 2) AS total_debit,
        ROUND(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END)::numeric, 2) AS total_credit,
        COUNT(*)::int AS entry_count
      FROM gl_entries
      WHERE company_id = ${companyId} AND is_void = false
    `);

    const row = sqlRows(result)[0] ?? {};
    const totalDebit  = parseFloat(row.total_debit)  || 0;
    const totalCredit = parseFloat(row.total_credit) || 0;
    const entryCount  = parseInt(row.entry_count)    || 0;
    const difference  = totalDebit - totalCredit;
    const isBalanced  = Math.abs(difference) < 0.01;

    res.json({ isBalanced, difference, totalDebit, totalCredit, entryCount });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /trial-balance/sync — retroactively build GL entries ─────────────────
router.post("/sync", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const allTx = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.companyId, companyId)));

    let synced = 0;
    let errors = 0;

    for (const tx of allTx) {
      try {
        await generateGlEntries(tx.id, companyId);
        synced++;
      } catch (e) {
        console.error(`GL sync error for tx ${tx.id}:`, e);
        errors++;
      }
    }

    res.json({ success: true, synced, errors });
  } catch (err) {
    console.error("GL sync error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
