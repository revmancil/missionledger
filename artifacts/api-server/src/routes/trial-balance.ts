import { Router } from "express";
import { db, glEntries, transactions, transactionSplits, chartOfAccounts, bankAccounts } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateGlEntries } from "../lib/gl";
import { sqlRows } from "../lib/sqlRows";

const router = Router();

// ── GET /trial-balance — compute trial balance ────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    // Sum debits and credits per account using raw SQL aggregation
    const rows = await db.execute(sql`
      SELECT
        account_id,
        account_code,
        account_name,
        ROUND(SUM(CASE WHEN entry_type = 'DEBIT'  THEN amount ELSE 0 END)::numeric, 2) AS total_debit,
        ROUND(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END)::numeric, 2) AS total_credit
      FROM gl_entries
      WHERE company_id = ${companyId} AND is_void = false
      GROUP BY account_id, account_code, account_name
      ORDER BY account_code
    `);

    // Enrich each row with COA type (for grouping on frontend)
    const allCoa = await db
      .select({ id: chartOfAccounts.id, type: chartOfAccounts.type })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId));

    const coaTypeMap = Object.fromEntries(allCoa.map((a) => [a.id, a.type]));

    const accounts = (rows.rows as any[]).map((r) => ({
      accountId:   r.account_id,
      accountCode: r.account_code,
      accountName: r.account_name,
      accountType: coaTypeMap[r.account_id] ?? "UNKNOWN",
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

    res.json({
      accounts,
      grandTotalDebit,
      grandTotalCredit,
      difference,
      isBalanced,
      glEntryCount: Number(count) || 0,
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
