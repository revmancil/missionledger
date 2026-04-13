import { Router } from "express";
import { db, glEntries, transactions, transactionSplits, chartOfAccounts, bankAccounts, companies, financialSnapshots } from "@workspace/db";
import { eq, and, lte, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateGlEntries } from "../lib/gl";
import { sqlRows } from "../lib/sqlRows";

const router = Router();

// ── Helper: compute trial balance as of a date (or all-time if null) ──────────
async function computeTrialBalance(companyId: string, asOf: Date | null) {
  const dateFilter = asOf
    ? sql`AND ge.date <= ${asOf}::timestamptz`
    : sql``;

  const rows = await db.execute(sql`
    SELECT
      ge.account_id,
      ge.account_code,
      ge.account_name,
      coa.coa_type,
      ROUND(SUM(CASE WHEN ge.entry_type = 'DEBIT'  THEN ge.amount ELSE 0 END)::numeric, 2) AS total_debit,
      ROUND(SUM(CASE WHEN ge.entry_type = 'CREDIT' THEN ge.amount ELSE 0 END)::numeric, 2) AS total_credit
    FROM gl_entries ge
    JOIN chart_of_accounts coa ON coa.id = ge.account_id
    WHERE ge.company_id = ${companyId}
      AND (ge.is_void IS NULL OR ge.is_void = false)
      ${dateFilter}
    GROUP BY ge.account_id, ge.account_code, ge.account_name, coa.coa_type
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

  return { accounts, grandTotalDebit, grandTotalCredit, difference, isBalanced };
}

// ── GET /trial-balance/periods — list of closed periods ───────────────────────
router.get("/periods", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    // Get all PERIOD_CLOSE / STATEMENT_OF_ACTIVITIES snapshots — one per close
    const snaps = await db
      .select({
        id: financialSnapshots.id,
        snapshotType: financialSnapshots.snapshotType,
        periodLabel: financialSnapshots.periodLabel,
        periodStart: financialSnapshots.periodStart,
        periodEnd: financialSnapshots.periodEnd,
        closedByEmail: financialSnapshots.closedByEmail,
        createdAt: financialSnapshots.createdAt,
      })
      .from(financialSnapshots)
      .where(
        and(
          eq(financialSnapshots.companyId, companyId),
          eq(financialSnapshots.snapshotType, "STATEMENT_OF_ACTIVITIES"),
        )
      )
      .orderBy(desc(financialSnapshots.periodEnd));

    res.json(snaps.map((s) => ({
      periodLabel: s.periodLabel,
      periodStart: s.periodStart instanceof Date ? s.periodStart.toISOString() : s.periodStart,
      periodEnd:   s.periodEnd   instanceof Date ? s.periodEnd.toISOString()   : s.periodEnd,
      closedByEmail: s.closedByEmail ?? null,
      closedAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    })));
  } catch (err) {
    console.error("TB periods error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /trial-balance — compute trial balance (current or historical) ────────
// Optional query param: ?asOf=YYYY-MM-DD  → closing trial balance as of that date
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    // Optional historical date
    const asOfParam = req.query.asOf as string | undefined;
    const asOf: Date | null = asOfParam ? new Date(asOfParam + "T23:59:59.999Z") : null;

    // Fetch company to get closedUntil (current period boundary)
    const [company] = await db.select({ closedUntil: companies.closedUntil })
      .from(companies)
      .where(eq(companies.id, companyId));
    const closedUntil: Date | null = company?.closedUntil ?? null;

    // Compute trial balance — all-time for current view, filtered for historical
    const { accounts, grandTotalDebit, grandTotalCredit, difference, isBalanced }
      = await computeTrialBalance(companyId, asOf);

    // Count of active GL entries (always all-time for informational display)
    const countRow = sqlRows(
      await db.execute(
        sql`SELECT COUNT(*)::int AS count FROM gl_entries WHERE company_id = ${companyId} AND is_void = false`,
      ),
    )[0] as { count?: number } | undefined;
    const count = countRow?.count ?? 0;

    // Period info for current view
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
      asOf: asOf ? asOf.toISOString() : null,
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
