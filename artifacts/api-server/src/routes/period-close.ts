import { Router } from "express";
import { eq, and, lte, gte, isNull, count } from "drizzle-orm";
import {
  db, companies, transactions, chartOfAccounts, glEntries,
  reconciliations, bankAccounts, journalEntries, journalEntryLines,
  auditLogs, financialSnapshots, funds,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function firstDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

/** Generate a sequential entry number like CE-2025-001 */
async function nextEntryNumber(companyId: string, prefix: string): Promise<string> {
  const rows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.companyId, companyId));
  const n = rows.length + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

async function getCompany(companyId: string) {
  const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
  return co;
}

// ── GET /status ─────────────────────────────────────────────────────────────
router.get("/status", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const co = await getCompany(companyId);
    if (!co) return res.status(404).json({ error: "Company not found" });

    const snapshots = await db
      .select()
      .from(financialSnapshots)
      .where(eq(financialSnapshots.companyId, companyId))
      .orderBy(financialSnapshots.createdAt);

    // Parse snapshot data for listing (omit the full data blob)
    const snapshotList = snapshots.map((s) => ({
      id: s.id,
      snapshotType: s.snapshotType,
      periodLabel: s.periodLabel,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      status: s.status,
      closedBy: s.closedBy,
      closedByEmail: s.closedByEmail,
      createdAt: s.createdAt,
    }));

    res.json({
      closedUntil: co.closedUntil ?? null,
      fiscalYearEndMonth: parseInt(co.fiscalYearEndMonth ?? "12", 10),
      snapshots: snapshotList,
    });
  } catch (err) {
    console.error("Period close status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /health-check ────────────────────────────────────────────────────────
router.get("/health-check", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { closingDate } = req.query as { closingDate?: string };

    const endDate = closingDate ? new Date(closingDate) : new Date();
    endDate.setUTCHours(23, 59, 59, 999);

    // 1. Reconciliation check — all bank accounts should have a COMPLETED reconciliation on or after the closing date
    const allBanks = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.companyId, companyId));

    let reconciliationOk = true;
    const reconDetails: string[] = [];

    if (allBanks.length === 0) {
      reconDetails.push("No bank accounts configured");
    } else {
      for (const bank of allBanks) {
        const completedRecons = await db
          .select()
          .from(reconciliations)
          .where(
            and(
              eq(reconciliations.companyId, companyId),
              eq(reconciliations.bankAccountId, bank.id),
              eq(reconciliations.status, "COMPLETED"),
              lte(reconciliations.statementDate, endDate)
            )
          );
        if (completedRecons.length === 0) {
          reconciliationOk = false;
          reconDetails.push(`${bank.name} has no completed reconciliation`);
        }
      }
      if (reconciliationOk && allBanks.length > 0) {
        reconDetails.push(`All ${allBanks.length} bank account(s) reconciled`);
      }
    }

    // 2. Uncategorized transactions check
    const allTxForPeriod = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.companyId, companyId),
          eq(transactions.isVoid, false),
          lte(transactions.date, endDate)
        )
      );

    const uncategorized = allTxForPeriod.filter(
      (t) => !t.chartAccountId && !t.isSplit
    );
    const uncategorizedOk = uncategorized.length === 0;

    // 3. Trial Balance check — sum GL entries, assets should equal liabilities + equity
    const allGlForPeriod = await db
      .select()
      .from(glEntries)
      .where(
        and(
          eq(glEntries.companyId, companyId),
          eq(glEntries.isVoid, false),
          lte(glEntries.date, endDate)
        )
      );

    const totalDebits = allGlForPeriod
      .filter((e) => e.entryType === "DEBIT")
      .reduce((sum, e) => sum + e.amount, 0);
    const totalCredits = allGlForPeriod
      .filter((e) => e.entryType === "CREDIT")
      .reduce((sum, e) => sum + e.amount, 0);
    const trialBalanceOk = Math.abs(totalDebits - totalCredits) < 0.01;

    // Build response
    res.json({
      checks: {
        reconciliation: {
          ok: reconciliationOk || allBanks.length === 0,
          label: "Bank Reconciliation",
          detail: allBanks.length === 0
            ? "No bank accounts — reconciliation not required"
            : reconciliationOk
              ? reconDetails[0]
              : reconDetails.join("; "),
        },
        uncategorized: {
          ok: uncategorizedOk,
          label: "Uncategorized Transactions",
          detail: uncategorizedOk
            ? "All transactions have accounts assigned"
            : `${uncategorized.length} transaction(s) without a category`,
          count: uncategorized.length,
        },
        trialBalance: {
          ok: trialBalanceOk,
          label: "Trial Balance",
          detail: trialBalanceOk
            ? `Balanced — Debits $${totalDebits.toFixed(2)} = Credits $${totalCredits.toFixed(2)}`
            : `Out of balance by $${Math.abs(totalDebits - totalCredits).toFixed(2)}`,
          totalDebits,
          totalCredits,
        },
      },
      allClear: (reconciliationOk || allBanks.length === 0) && uncategorizedOk && trialBalanceOk,
    });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── helpers for snapshot generation ─────────────────────────────────────────

async function buildStatementOfActivities(
  companyId: string,
  periodStart: Date,
  periodEnd: Date
) {
  const allCoa = await db
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.companyId, companyId));

  const coaMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));

  const glRows = await db
    .select()
    .from(glEntries)
    .where(
      and(
        eq(glEntries.companyId, companyId),
        eq(glEntries.isVoid, false),
        gte(glEntries.date, periodStart),
        lte(glEntries.date, periodEnd)
      )
    );

  const byAccount: Record<string, { code: string; name: string; type: string; debits: number; credits: number }> = {};

  for (const e of glRows) {
    const coa = coaMap[e.accountId];
    if (!coa) continue;
    const coaType = coa.type as string;
    if (!["INCOME", "EXPENSE"].includes(coaType)) continue;
    if (!byAccount[e.accountId]) {
      byAccount[e.accountId] = { code: e.accountCode, name: e.accountName, type: coaType, debits: 0, credits: 0 };
    }
    if (e.entryType === "DEBIT") byAccount[e.accountId].debits += e.amount;
    else byAccount[e.accountId].credits += e.amount;
  }

  const income = Object.values(byAccount)
    .filter((a) => a.type === "INCOME")
    .map((a) => ({ ...a, net: a.credits - a.debits }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const expenses = Object.values(byAccount)
    .filter((a) => a.type === "EXPENSE")
    .map((a) => ({ ...a, net: a.debits - a.credits }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalIncome = income.reduce((s, a) => s + a.net, 0);
  const totalExpenses = expenses.reduce((s, a) => s + a.net, 0);
  const netIncome = totalIncome - totalExpenses;

  return { income, expenses, totalIncome, totalExpenses, netIncome };
}

async function buildBalanceSheet(companyId: string, asOfDate: Date) {
  const allCoa = await db
    .select()
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.companyId, companyId));

  const coaMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));

  const glRows = await db
    .select()
    .from(glEntries)
    .where(
      and(
        eq(glEntries.companyId, companyId),
        eq(glEntries.isVoid, false),
        lte(glEntries.date, asOfDate)
      )
    );

  const byAccount: Record<string, { code: string; name: string; type: string; debits: number; credits: number }> = {};

  for (const e of glRows) {
    const coa = coaMap[e.accountId];
    if (!coa) continue;
    const coaType = coa.type as string;
    if (!["ASSET", "LIABILITY", "EQUITY"].includes(coaType)) continue;
    if (!byAccount[e.accountId]) {
      byAccount[e.accountId] = { code: e.accountCode, name: e.accountName, type: coaType, debits: 0, credits: 0 };
    }
    if (e.entryType === "DEBIT") byAccount[e.accountId].debits += e.amount;
    else byAccount[e.accountId].credits += e.amount;
  }

  const assets = Object.values(byAccount)
    .filter((a) => a.type === "ASSET")
    .map((a) => ({ ...a, balance: a.debits - a.credits }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const liabilities = Object.values(byAccount)
    .filter((a) => a.type === "LIABILITY")
    .map((a) => ({ ...a, balance: a.credits - a.debits }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const equity = Object.values(byAccount)
    .filter((a) => a.type === "EQUITY")
    .map((a) => ({ ...a, balance: a.credits - a.debits }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0);

  return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity };
}

// ── POST /close-period ────────────────────────────────────────────────────────
router.post("/close-period", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id: userId, companyId, email } = (req as any).user;
    const { year, month, overrideChecks } = req.body ?? {};

    if (!year || !month) {
      return res.status(400).json({ error: "year and month are required" });
    }

    const periodYear = parseInt(year, 10);
    const periodMonth = parseInt(month, 10); // 1-12
    const periodStart = firstDayOfMonth(periodYear, periodMonth);
    const periodEnd = lastDayOfMonth(periodYear, periodMonth);
    const periodLabel = periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

    // Run health checks unless overridden
    if (!overrideChecks) {
      const allBanks = await db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId));
      const uncategorized = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.companyId, companyId),
            eq(transactions.isVoid, false),
            lte(transactions.date, periodEnd),
            isNull(transactions.chartAccountId),
            eq(transactions.isSplit, false)
          )
        );

      if (uncategorized.length > 0) {
        return res.status(422).json({
          error: `${uncategorized.length} uncategorized transaction(s) exist. Fix them or use overrideChecks=true.`,
          code: "UNCATEGORIZED_TRANSACTIONS",
          count: uncategorized.length,
        });
      }
    }

    // Generate both financial statement snapshots
    const [soa, bs] = await Promise.all([
      buildStatementOfActivities(companyId, periodStart, periodEnd),
      buildBalanceSheet(companyId, periodEnd),
    ]);

    // Save Statement of Activities snapshot
    await db.insert(financialSnapshots).values({
      companyId,
      snapshotType: "STATEMENT_OF_ACTIVITIES",
      periodLabel,
      periodStart,
      periodEnd,
      data: JSON.stringify(soa),
      status: "FINALIZED",
      closedBy: userId,
      closedByEmail: email ?? null,
    });

    // Save Balance Sheet snapshot
    await db.insert(financialSnapshots).values({
      companyId,
      snapshotType: "BALANCE_SHEET",
      periodLabel,
      periodStart,
      periodEnd,
      data: JSON.stringify(bs),
      status: "FINALIZED",
      closedBy: userId,
      closedByEmail: email ?? null,
    });

    // Set the closed_until date on the company
    await db
      .update(companies)
      .set({ closedUntil: periodEnd, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    // Log to audit
    await db.insert(auditLogs).values({
      companyId,
      userId,
      userEmail: email ?? null,
      action: "PERIOD_CLOSE",
      entityType: "PERIOD",
      entityId: periodLabel,
      description: `Closed period: ${periodLabel}. Soft lock applied through ${periodEnd.toISOString().substring(0, 10)}.`,
    });

    res.json({
      success: true,
      closedUntil: periodEnd,
      periodLabel,
      snapshots: ["STATEMENT_OF_ACTIVITIES", "BALANCE_SHEET"],
      statementOfActivities: soa,
      balanceSheet: bs,
    });
  } catch (err) {
    console.error("Close period error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /year-end-close ─────────────────────────────────────────────────────
router.post("/year-end-close", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id: userId, companyId, email } = (req as any).user;
    const { year, overrideChecks } = req.body ?? {};

    if (!year) return res.status(400).json({ error: "year is required" });

    const co = await getCompany(companyId);
    if (!co) return res.status(404).json({ error: "Company not found" });

    const fiscalEndMonth = parseInt(co.fiscalYearEndMonth ?? "12", 10);
    const fiscalYear = parseInt(year, 10);
    const periodStart = firstDayOfMonth(fiscalYear, 1); // Jan 1
    const periodEnd = lastDayOfMonth(fiscalYear, fiscalEndMonth); // Dec 31
    const periodLabel = `Fiscal Year ${fiscalYear}`;

    // Load all COA accounts
    const allCoa = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId));

    // Get all GL entries for the fiscal year (income + expense only)
    const glRows = await db
      .select()
      .from(glEntries)
      .where(
        and(
          eq(glEntries.companyId, companyId),
          eq(glEntries.isVoid, false),
          gte(glEntries.date, periodStart),
          lte(glEntries.date, periodEnd)
        )
      );

    // Build account balances by type
    const coaMap = Object.fromEntries(allCoa.map((a) => [a.id, a]));
    const accountBalances: Record<string, { code: string; name: string; type: string; debits: number; credits: number; accountId: string }> = {};

    for (const e of glRows) {
      const coa = coaMap[e.accountId];
      if (!coa) continue;
      const coaType = coa.type as string;
      if (!["INCOME", "EXPENSE"].includes(coaType)) continue;
      if (!accountBalances[e.accountId]) {
        accountBalances[e.accountId] = {
          accountId: e.accountId,
          code: e.accountCode,
          name: e.accountName,
          type: coaType,
          debits: 0,
          credits: 0,
        };
      }
      if (e.entryType === "DEBIT") accountBalances[e.accountId].debits += e.amount;
      else accountBalances[e.accountId].credits += e.amount;
    }

    const incomeAccounts = Object.values(accountBalances).filter((a) => a.type === "INCOME");
    const expenseAccounts = Object.values(accountBalances).filter((a) => a.type === "EXPENSE");

    // Net income = sum of (income credits - income debits) - sum of (expense debits - expense credits)
    const totalIncomeNet = incomeAccounts.reduce((s, a) => s + (a.credits - a.debits), 0);
    const totalExpenseNet = expenseAccounts.reduce((s, a) => s + (a.debits - a.credits), 0);
    const netIncome = totalIncomeNet - totalExpenseNet;

    // Find Retained Earnings / Fund Balance account (equity, code starts with 3)
    const retainedEarnings = allCoa.find(
      (a) =>
        (a.type as string) === "EQUITY" &&
        (a.name.toLowerCase().includes("retained") ||
          a.name.toLowerCase().includes("fund balance") ||
          a.name.toLowerCase().includes("net assets") ||
          a.code === "3100")
    ) ?? allCoa.find((a) => (a.type as string) === "EQUITY");

    if (!retainedEarnings) {
      return res.status(422).json({
        error: "No equity account found for the closing offset. Please add a Retained Earnings or Fund Balance account (3000-series).",
      });
    }

    if (incomeAccounts.length === 0 && expenseAccounts.length === 0) {
      return res.status(422).json({
        error: "No income or expense GL entries found for this fiscal year. Run GL Sync first.",
      });
    }

    // Create the Closing Journal Entry
    const entryNumber = await nextEntryNumber(companyId, `CE-${fiscalYear}`);
    const closingDate = periodEnd;

    const [je] = await db
      .insert(journalEntries)
      .values({
        companyId,
        entryNumber,
        date: closingDate,
        description: `Year-End Closing Entry — Fiscal Year ${fiscalYear}`,
        memo: `Closing entries to zero out income and expense accounts for FY${fiscalYear}. Net Income: $${netIncome.toFixed(2)}.`,
        status: "POSTED",
        createdBy: userId,
        postedAt: new Date(),
      })
      .returning();

    const glInserts: any[] = [];

    // Debit each income account to zero it out (income accounts have normal credit balances)
    for (const acct of incomeAccounts) {
      const netBalance = acct.credits - acct.debits;
      if (Math.abs(netBalance) < 0.005) continue;
      await db.insert(journalEntryLines).values({
        journalEntryId: je.id,
        companyId,
        accountId: acct.accountId,
        debit: netBalance > 0 ? netBalance : 0,
        credit: netBalance < 0 ? Math.abs(netBalance) : 0,
        description: `Close income: ${acct.name}`,
      });
      glInserts.push({
        companyId,
        journalEntryId: je.id,
        sourceType: "JOURNAL_ENTRY" as const,
        accountId: acct.accountId,
        accountCode: acct.code,
        accountName: acct.name,
        entryType: netBalance > 0 ? ("DEBIT" as const) : ("CREDIT" as const),
        amount: Math.abs(netBalance),
        description: `Close income: ${acct.name}`,
        date: closingDate,
        isVoid: false,
      });
    }

    // Credit each expense account to zero it out (expense accounts have normal debit balances)
    for (const acct of expenseAccounts) {
      const netBalance = acct.debits - acct.credits;
      if (Math.abs(netBalance) < 0.005) continue;
      await db.insert(journalEntryLines).values({
        journalEntryId: je.id,
        companyId,
        accountId: acct.accountId,
        debit: netBalance < 0 ? Math.abs(netBalance) : 0,
        credit: netBalance > 0 ? netBalance : 0,
        description: `Close expense: ${acct.name}`,
      });
      glInserts.push({
        companyId,
        journalEntryId: je.id,
        sourceType: "JOURNAL_ENTRY" as const,
        accountId: acct.accountId,
        accountCode: acct.code,
        accountName: acct.name,
        entryType: netBalance > 0 ? ("CREDIT" as const) : ("DEBIT" as const),
        amount: Math.abs(netBalance),
        description: `Close expense: ${acct.name}`,
        date: closingDate,
        isVoid: false,
      });
    }

    // Offset to Retained Earnings
    if (Math.abs(netIncome) >= 0.005) {
      await db.insert(journalEntryLines).values({
        journalEntryId: je.id,
        companyId,
        accountId: retainedEarnings.id,
        debit: netIncome < 0 ? Math.abs(netIncome) : 0,
        credit: netIncome > 0 ? netIncome : 0,
        description: `Net income transferred to ${retainedEarnings.name}`,
      });
      glInserts.push({
        companyId,
        journalEntryId: je.id,
        sourceType: "JOURNAL_ENTRY" as const,
        accountId: retainedEarnings.id,
        accountCode: retainedEarnings.code,
        accountName: retainedEarnings.name,
        entryType: netIncome > 0 ? ("CREDIT" as const) : ("DEBIT" as const),
        amount: Math.abs(netIncome),
        description: `Net income transferred to ${retainedEarnings.name}`,
        date: closingDate,
        isVoid: false,
      });
    }

    // Insert all GL entries
    for (const e of glInserts) {
      await db.insert(glEntries).values(e);
    }

    // Generate and save both snapshots
    const [soa, bs] = await Promise.all([
      buildStatementOfActivities(companyId, periodStart, periodEnd),
      buildBalanceSheet(companyId, periodEnd),
    ]);

    await db.insert(financialSnapshots).values({
      companyId,
      snapshotType: "YEAR_END_CLOSE",
      periodLabel,
      periodStart,
      periodEnd,
      data: JSON.stringify({ statementOfActivities: soa, balanceSheet: bs }),
      status: "FINALIZED",
      closingJournalEntryId: je.id,
      closedBy: userId,
      closedByEmail: email ?? null,
    });

    // Set closed_until to the fiscal year end
    await db
      .update(companies)
      .set({ closedUntil: periodEnd, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    // Audit log
    await db.insert(auditLogs).values({
      companyId,
      userId,
      userEmail: email ?? null,
      action: "YEAR_END_CLOSE",
      entityType: "FISCAL_YEAR",
      entityId: String(fiscalYear),
      description: `Year-End Close executed for FY${fiscalYear}. Net Income: $${netIncome.toFixed(2)}. Closing entry: ${je.entryNumber}.`,
      metadata: JSON.stringify({ journalEntryId: je.id, entryNumber: je.entryNumber, netIncome }),
    });

    res.json({
      success: true,
      closedUntil: periodEnd,
      periodLabel,
      closingEntry: {
        id: je.id,
        entryNumber: je.entryNumber,
        lineCount: glInserts.length,
      },
      netIncome,
      retainedEarningsAccount: retainedEarnings.name,
      incomeAccountsClosed: incomeAccounts.length,
      expenseAccountsClosed: expenseAccounts.length,
    });
  } catch (err) {
    console.error("Year-end close error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /reopen ──────────────────────────────────────────────────────────────
router.post("/reopen", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { id: userId, companyId, email, role } = user;

    // Only MASTER_ADMIN can reopen
    if (role !== "MASTER_ADMIN") {
      return res.status(403).json({
        error: "Only a Master Admin can reopen a closed period.",
      });
    }

    const { reason } = req.body ?? {};
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        error: "A reason of at least 10 characters is required to reopen a period.",
      });
    }

    const co = await getCompany(companyId);
    if (!co) return res.status(404).json({ error: "Company not found" });

    if (!co.closedUntil) {
      return res.status(400).json({ error: "No closed period to reopen." });
    }

    const previousClosedUntil = co.closedUntil;

    // Clear the lock
    await db
      .update(companies)
      .set({ closedUntil: null, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    // Audit log — this is the key compliance record
    await db.insert(auditLogs).values({
      companyId,
      userId,
      userEmail: email ?? null,
      action: "PERIOD_REOPEN",
      entityType: "PERIOD",
      entityId: previousClosedUntil.toISOString().substring(0, 10),
      description: `Period reopened by ${email ?? userId}. Previously closed through ${previousClosedUntil.toISOString().substring(0, 10)}. Reason: ${reason}`,
      metadata: JSON.stringify({ previousClosedUntil, reason }),
    });

    res.json({
      success: true,
      message: `Period reopened. Transactions through ${previousClosedUntil.toISOString().substring(0, 10)} are now editable.`,
      auditedReason: reason,
    });
  } catch (err) {
    console.error("Reopen period error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /snapshots/:id ────────────────────────────────────────────────────────
router.get("/snapshots/:id", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { id } = req.params;

    const [snapshot] = await db
      .select()
      .from(financialSnapshots)
      .where(
        and(
          eq(financialSnapshots.id, id),
          eq(financialSnapshots.companyId, companyId)
        )
      );

    if (!snapshot) return res.status(404).json({ error: "Snapshot not found" });

    res.json({
      ...snapshot,
      data: JSON.parse(snapshot.data),
    });
  } catch (err) {
    console.error("Get snapshot error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /audit-log ────────────────────────────────────────────────────────────
router.get("/audit-log", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.companyId, companyId))
      .orderBy(auditLogs.createdAt);
    res.json(logs);
  } catch (err) {
    console.error("Audit log error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
