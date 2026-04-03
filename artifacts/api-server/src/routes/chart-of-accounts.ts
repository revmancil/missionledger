import { Router } from "express";
import { db, chartOfAccounts } from "@workspace/db";
import { eq, asc, sql, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString } from "../lib/safeIso";
import { sqlRows } from "../lib/sqlRows";

const router = Router();

async function coaRow(companyId: string, id: string) {
  const [row] = await db
    .select()
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.id, id), eq(chartOfAccounts.companyId, companyId)));
  return row;
}

/** Walk parent chain up from `startId`; return true if `targetId` is reached (target is an ancestor of start). */
async function reachesAncestor(companyId: string, startId: string, targetId: string): Promise<boolean> {
  let cur: string | null = startId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === targetId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    const [row] = await db
      .select({ parentId: chartOfAccounts.parentId })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, cur), eq(chartOfAccounts.companyId, companyId)));
    cur = row?.parentId ?? null;
  }
  return false;
}

/** Validate parent exists, same type, and does not create a cycle when childId is the account being edited. */
async function validateParentChoice(
  companyId: string,
  childType: string,
  parentId: string | null,
  childId?: string,
): Promise<string | null> {
  if (!parentId) return null;
  const parent = await coaRow(companyId, parentId);
  if (!parent) return "Parent account not found.";
  if (parent.type !== childType) return "Parent must be the same account type (e.g. assets under assets).";
  if (childId && (await reachesAncestor(companyId, parentId, childId))) {
    return "That parent is under this account — choose a higher-level parent to avoid a circular hierarchy.";
  }
  return null;
}

// Standard 4000/8000-series pre-populated on seeding
export const DEFAULT_COA: Array<{
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  description?: string;
  isSystem?: boolean;
  sortOrder?: number;
  /** Set after insert — links to parent account code (same company). */
  parentCode?: string;
}> = [
  // ── ASSET (1000s) ─────────────────────────────────
  { code: "1000", name: "Cash & Bank Accounts",       type: "ASSET",   isSystem: true, sortOrder: 10 },
  { code: "1010", name: "Checking Account",            type: "ASSET",   isSystem: true, sortOrder: 11, parentCode: "1000" },
  { code: "1020", name: "Savings Account",             type: "ASSET",   isSystem: true, sortOrder: 12, parentCode: "1000" },
  { code: "1100", name: "Accounts Receivable",         type: "ASSET",   isSystem: true, sortOrder: 20 },
  { code: "1200", name: "Pledges Receivable",          type: "ASSET",   isSystem: true, sortOrder: 30 },
  { code: "1500", name: "Property & Equipment",        type: "ASSET",   isSystem: true, sortOrder: 40 },
  // ── LIABILITY (2000s) ──────────────────────────────
  { code: "2000", name: "Accounts Payable",            type: "LIABILITY", isSystem: true, sortOrder: 110 },
  { code: "2100", name: "Accrued Liabilities",         type: "LIABILITY", isSystem: true, sortOrder: 120 },
  { code: "2200", name: "Deferred Revenue",            type: "LIABILITY", isSystem: true, sortOrder: 130 },
  // ── EQUITY (3000s) ─────────────────────────────────
  { code: "3000", name: "Net Assets",                  type: "EQUITY",  isSystem: true, sortOrder: 210 },
  { code: "3100", name: "Unrestricted Net Assets",     type: "EQUITY",  isSystem: true, sortOrder: 211 },
  { code: "3200", name: "Temporarily Restricted",      type: "EQUITY",  isSystem: true, sortOrder: 212 },
  { code: "3300", name: "Permanently Restricted",      type: "EQUITY",  isSystem: true, sortOrder: 213 },
  // ── INCOME (4000s) ─────────────────────────────────
  { code: "4000", name: "Revenue",                     type: "INCOME",  isSystem: true, sortOrder: 310, description: "Total Income" },
  { code: "4100", name: "Individual Contributions",    type: "INCOME",  isSystem: true, sortOrder: 311, description: "Cash, check, or online donations from individuals" },
  { code: "4110", name: "Online Donations",            type: "INCOME",  isSystem: true, sortOrder: 312 },
  { code: "4120", name: "Cash Offerings",              type: "INCOME",  isSystem: true, sortOrder: 313 },
  { code: "4130", name: "Check Donations",             type: "INCOME",  isSystem: true, sortOrder: 314 },
  { code: "4200", name: "Grants",                      type: "INCOME",  isSystem: true, sortOrder: 320, description: "Government and private foundation grants" },
  { code: "4210", name: "Government Grants",           type: "INCOME",  isSystem: true, sortOrder: 321 },
  { code: "4220", name: "Foundation Grants",           type: "INCOME",  isSystem: true, sortOrder: 322 },
  { code: "4300", name: "Membership Dues",             type: "INCOME",  isSystem: true, sortOrder: 330 },
  { code: "4400", name: "Program Revenue",             type: "INCOME",  isSystem: true, sortOrder: 340 },
  { code: "4500", name: "Special Events Revenue",      type: "INCOME",  isSystem: true, sortOrder: 350 },
  { code: "4600", name: "In-Kind Contributions",       type: "INCOME",  isSystem: true, sortOrder: 360 },
  { code: "4700", name: "Investment Income",           type: "INCOME",  isSystem: true, sortOrder: 370 },
  { code: "4800", name: "Rental Income",               type: "INCOME",  isSystem: true, sortOrder: 380 },
  { code: "4900", name: "Miscellaneous Income",        type: "INCOME",  isSystem: true, sortOrder: 390 },
  // ── EXPENSE (8000s) ────────────────────────────────
  { code: "8000", name: "Expenses",                    type: "EXPENSE", isSystem: true, sortOrder: 410, description: "Total Expenses" },
  { code: "8100", name: "Personnel Expenses",          type: "EXPENSE", isSystem: true, sortOrder: 411, description: "Salaries, wages, and benefits" },
  { code: "8110", name: "Salaries & Wages",            type: "EXPENSE", isSystem: true, sortOrder: 412 },
  { code: "8120", name: "Payroll Taxes",               type: "EXPENSE", isSystem: true, sortOrder: 413 },
  { code: "8130", name: "Employee Benefits",           type: "EXPENSE", isSystem: true, sortOrder: 414 },
  { code: "8140", name: "Contract Labor",              type: "EXPENSE", isSystem: true, sortOrder: 415 },
  { code: "8200", name: "Occupancy & Facilities",      type: "EXPENSE", isSystem: true, sortOrder: 420 },
  { code: "8210", name: "Rent & Lease",                type: "EXPENSE", isSystem: true, sortOrder: 421 },
  { code: "8220", name: "Utilities",                   type: "EXPENSE", isSystem: true, sortOrder: 422 },
  { code: "8230", name: "Maintenance & Repairs",       type: "EXPENSE", isSystem: true, sortOrder: 423 },
  { code: "8300", name: "Program Expenses",            type: "EXPENSE", isSystem: true, sortOrder: 430 },
  { code: "8310", name: "Program Supplies",            type: "EXPENSE", isSystem: true, sortOrder: 431 },
  { code: "8320", name: "Program Services",            type: "EXPENSE", isSystem: true, sortOrder: 432 },
  { code: "8400", name: "Administrative Expenses",     type: "EXPENSE", isSystem: true, sortOrder: 440 },
  { code: "8410", name: "Office Supplies",             type: "EXPENSE", isSystem: true, sortOrder: 441 },
  { code: "8420", name: "Postage & Shipping",          type: "EXPENSE", isSystem: true, sortOrder: 442 },
  { code: "8430", name: "Printing & Copying",          type: "EXPENSE", isSystem: true, sortOrder: 443 },
  { code: "8440", name: "Software & Technology",       type: "EXPENSE", isSystem: true, sortOrder: 444 },
  { code: "8500", name: "Professional Services",       type: "EXPENSE", isSystem: true, sortOrder: 450 },
  { code: "8510", name: "Accounting & Audit",          type: "EXPENSE", isSystem: true, sortOrder: 451 },
  { code: "8520", name: "Legal Fees",                  type: "EXPENSE", isSystem: true, sortOrder: 452 },
  { code: "8530", name: "Consulting Fees",             type: "EXPENSE", isSystem: true, sortOrder: 453 },
  { code: "8600", name: "Travel & Transportation",     type: "EXPENSE", isSystem: true, sortOrder: 460 },
  { code: "8610", name: "Mileage & Vehicle",           type: "EXPENSE", isSystem: true, sortOrder: 461 },
  { code: "8620", name: "Airfare & Lodging",           type: "EXPENSE", isSystem: true, sortOrder: 462 },
  { code: "8700", name: "Marketing & Communications",  type: "EXPENSE", isSystem: true, sortOrder: 470 },
  { code: "8710", name: "Advertising",                 type: "EXPENSE", isSystem: true, sortOrder: 471 },
  { code: "8720", name: "Website & Social Media",      type: "EXPENSE", isSystem: true, sortOrder: 472 },
  { code: "8800", name: "Fundraising Expenses",        type: "EXPENSE", isSystem: true, sortOrder: 480 },
  { code: "8900", name: "Depreciation",                type: "EXPENSE", isSystem: true, sortOrder: 490 },
  { code: "8950", name: "Insurance",                   type: "EXPENSE", isSystem: true, sortOrder: 491 },
  { code: "8990", name: "Miscellaneous Expenses",      type: "EXPENSE", isSystem: true, sortOrder: 499 },
];

export async function seedChartOfAccounts(companyId: string): Promise<void> {
  const existing = await db
    .select({ id: chartOfAccounts.id })
    .from(chartOfAccounts)
    .where(eq(chartOfAccounts.companyId, companyId))
    .limit(1);

  if (existing.length > 0) return; // already seeded

  const codeToId: Record<string, string> = {};
  for (const acct of DEFAULT_COA) {
    const [created] = await db
      .insert(chartOfAccounts)
      .values({
        companyId,
        code: acct.code,
        name: acct.name,
        type: acct.type,
        description: acct.description ?? null,
        isSystem: acct.isSystem ?? true,
        isActive: true,
        sortOrder: acct.sortOrder ?? 0,
        parentId: null,
      })
      .returning();
    codeToId[acct.code] = created.id;
  }

  for (const acct of DEFAULT_COA) {
    if (!acct.parentCode) continue;
    const id = codeToId[acct.code];
    const pid = codeToId[acct.parentCode];
    if (id && pid) {
      await db
        .update(chartOfAccounts)
        .set({ parentId: pid })
        .where(eq(chartOfAccounts.id, id));
    }
  }
}

// GET /chart-of-accounts
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId))
      .orderBy(asc(chartOfAccounts.sortOrder), asc(chartOfAccounts.code));

    // Aggregate balances from gl_entries per account
    const balanceRows = await db.execute(sql`
      SELECT
        account_id,
        SUM(CASE WHEN entry_type = 'DEBIT'  THEN amount ELSE 0 END) AS total_debits,
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) AS total_credits
      FROM gl_entries
      WHERE company_id = ${companyId}
        AND (is_void IS NULL OR is_void = false)
      GROUP BY account_id
    `);

    const balanceMap: Record<string, { debits: number; credits: number }> = {};
    for (const row of (balanceRows as any).rows ?? balanceRows) {
      balanceMap[row.account_id] = {
        debits: parseFloat(row.total_debits ?? "0"),
        credits: parseFloat(row.total_credits ?? "0"),
      };
    }

    // Normal balance convention:
    // Assets + Expenses = Debit normal (balance = debits - credits)
    // Liabilities + Equity + Income = Credit normal (balance = credits - debits)
    const withBalances = all.map((acct) => {
      const b = balanceMap[acct.id] ?? { debits: 0, credits: 0 };
      const type = (acct.coaType ?? acct.accountType ?? "").toUpperCase();
      const isDebitNormal = type === "ASSET" || type === "EXPENSE";
      const balance = isDebitNormal
        ? b.debits - b.credits
        : b.credits - b.debits;
      return { ...acct, balance, totalDebits: b.debits, totalCredits: b.credits };
    });

    res.json(withBalances);
  } catch (error) {
    console.error("COA GET error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// POST /chart-of-accounts
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { code, name, type, description, parentId, sortOrder } = req.body ?? {};
    if (!code || !name || !type)
      return res.status(400).json({ error: "code, name, and type are required" });

    const dup = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)))
      .limit(1);
    if (dup.length) return res.status(400).json({ error: "Account code already exists" });

    const parentIdNorm =
      parentId === null || parentId === undefined || parentId === "" ? null : String(parentId);
    const parentErr = await validateParentChoice(companyId, type as string, parentIdNorm);
    if (parentErr) return res.status(400).json({ error: parentErr });

    const [created] = await db
      .insert(chartOfAccounts)
      .values({
        companyId,
        code,
        name,
        type: type as any,
        description: description ?? null,
        isSystem: false,
        isActive: true,
        parentId: parentIdNorm,
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    res.status(201).json({
      ...created,
      createdAt: toIsoString(created.createdAt),
      updatedAt: toIsoString(created.updatedAt),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /chart-of-accounts/:id
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const body = req.body ?? {};

    const existing = await coaRow(companyId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const set: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.name === "string") {
      const n = body.name.trim();
      if (!n) return res.status(400).json({ error: "Name cannot be empty." });
      set.name = n;
    }

    if (body.description !== undefined) {
      set.description =
        body.description === null || body.description === "" ? null : String(body.description);
    }

    if (typeof body.isActive === "boolean") set.isActive = body.isActive;

    if (body.sortOrder !== undefined) {
      const n = Number(body.sortOrder);
      set.sortOrder = Number.isFinite(n) ? Math.trunc(n) : 0;
    }

    if (body.parentId !== undefined) {
      const parentIdNorm =
        body.parentId === null || body.parentId === "" ? null : String(body.parentId);
      const perr = await validateParentChoice(companyId, existing.type, parentIdNorm, existing.id);
      if (perr) return res.status(400).json({ error: perr });
      set.parentId = parentIdNorm;
    }

    if (body.code !== undefined && !existing.isSystem) {
      const code = String(body.code).trim();
      if (!code) return res.status(400).json({ error: "Account code cannot be empty." });
      const dup = await db
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.code, code)));
      if (dup.some((d) => d.id !== existing.id)) {
        return res.status(400).json({ error: "Account code already exists" });
      }
      set.code = code;
    }

    const keys = Object.keys(set).filter((k) => k !== "updatedAt");
    if (keys.length === 0) {
      return res.json({
        ...existing,
        createdAt: toIsoString(existing.createdAt),
        updatedAt: toIsoString(existing.updatedAt),
      });
    }

    const [updated] = await db
      .update(chartOfAccounts)
      .set(set as any)
      .where(
        and(eq(chartOfAccounts.id, req.params.id), eq(chartOfAccounts.companyId, companyId)),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({
      ...updated,
      createdAt: toIsoString(updated.createdAt),
      updatedAt: toIsoString(updated.updatedAt),
    });
  } catch (error) {
    console.error("chart-of-accounts PUT:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /chart-of-accounts/:id  (only non-system accounts)
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const [acct] = await db
      .select()
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.id, req.params.id),
          eq(chartOfAccounts.companyId, companyId)
        )
      );
    if (!acct) return res.status(404).json({ error: "Not found" });
    if (acct.isSystem)
      return res.status(400).json({ error: "System accounts cannot be deleted" });

    const [child] = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.companyId, companyId),
          eq(chartOfAccounts.parentId, req.params.id),
        ),
      )
      .limit(1);
    if (child) {
      return res.status(400).json({
        error: "This account has sub-accounts. Reassign or delete them first.",
      });
    }

    await db
      .delete(chartOfAccounts)
      .where(eq(chartOfAccounts.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/ledger", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const accountId = req.params.id;

    const [account] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, accountId), eq(chartOfAccounts.companyId, companyId)));
    if (!account) return res.status(404).json({ error: "Account not found" });

    const rows = await db.execute(sql`
      SELECT
        ge.id,
        ge.date,
        ge.entry_type,
        ge.amount,
        ge.description,
        ge.source_type,
        ge.fund_name,
        ge.is_void,
        je.entry_number   AS journal_entry_number,
        je.reference_number AS reference_number
      FROM gl_entries ge
      LEFT JOIN journal_entries je ON ge.journal_entry_id = je.id
      WHERE ge.account_id = ${accountId}
        AND ge.company_id = ${companyId}
        AND (ge.is_void IS NULL OR ge.is_void = false)
      ORDER BY ge.date ASC, ge.created_at ASC
    `);

    const debitNormal = ["ASSET", "EXPENSE"].includes(account.type);

    let runningBalance = 0;
    const entries = sqlRows(rows).map((r) => {
      const amount = Number(r.amount ?? 0);
      const isDebit = String(r.entry_type).toUpperCase() === "DEBIT";
      if (debitNormal) {
        runningBalance += isDebit ? amount : -amount;
      } else {
        runningBalance += isDebit ? -amount : amount;
      }
      const d = r.date;
      const dateIso =
        d instanceof Date ? d.toISOString() : d != null ? String(d) : null;
      return {
        id: r.id,
        date: dateIso,
        description: r.description,
        sourceType: r.source_type,
        reference: r.journal_entry_number || r.reference_number || null,
        fundName: r.fund_name,
        debit: isDebit ? amount : null,
        credit: !isDebit ? amount : null,
        runningBalance,
      };
    });

    res.json({
      account: {
        ...account,
        createdAt: toIsoString(account.createdAt),
        updatedAt: toIsoString(account.updatedAt),
      },
      entries,
    });
  } catch (error) {
    console.error("Ledger error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
