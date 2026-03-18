import { Router } from "express";
import { db, chartOfAccounts } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

// Standard 4000/8000-series pre-populated on seeding
export const DEFAULT_COA: Array<{
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  description?: string;
  isSystem?: boolean;
  sortOrder?: number;
}> = [
  // ── ASSET (1000s) ─────────────────────────────────
  { code: "1000", name: "Cash & Bank Accounts",       type: "ASSET",   isSystem: true, sortOrder: 10 },
  { code: "1010", name: "Checking Account",            type: "ASSET",   isSystem: true, sortOrder: 11 },
  { code: "1020", name: "Savings Account",             type: "ASSET",   isSystem: true, sortOrder: 12 },
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

  for (const acct of DEFAULT_COA) {
    await db.insert(chartOfAccounts).values({
      companyId,
      code: acct.code,
      name: acct.name,
      type: acct.type,
      description: acct.description ?? null,
      isSystem: acct.isSystem ?? true,
      isActive: true,
      sortOrder: acct.sortOrder ?? 0,
    });
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

    res.json(
      all.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error(error);
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
        parentId: parentId ?? null,
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    res.status(201).json({
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
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
    const { name, description, isActive, parentId, sortOrder } = req.body ?? {};

    const [updated] = await db
      .update(chartOfAccounts)
      .set({
        name,
        description: description ?? null,
        isActive,
        parentId: parentId ?? null,
        sortOrder: sortOrder ?? undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chartOfAccounts.id, req.params.id),
          eq(chartOfAccounts.companyId, companyId)
        )
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error) {
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

    await db
      .delete(chartOfAccounts)
      .where(eq(chartOfAccounts.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
