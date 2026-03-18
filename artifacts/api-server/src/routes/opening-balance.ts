import { Router } from "express";
import { db, companies, chartOfAccounts, journalEntries, journalEntryLines } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

// ── GET /opening-balance — fetch setup data ───────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ error: "Company not found" });

    const coa = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId))
      .orderBy(asc(chartOfAccounts.code));

    // If an opening balance JE exists, fetch its lines
    let existingLines: any[] = [];
    if (company.openingBalanceEntryId) {
      existingLines = await db
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, company.openingBalanceEntryId));
    }

    // Group COA by type
    const grouped = {
      ASSET:     coa.filter((a) => a.type === "ASSET"),
      LIABILITY: coa.filter((a) => a.type === "LIABILITY"),
      EQUITY:    coa.filter((a) => a.type === "EQUITY"),
    };

    res.json({
      accountingMethod: company.accountingMethod ?? "CASH",
      openingBalanceEntryId: company.openingBalanceEntryId ?? null,
      openingBalanceDate: company.openingBalanceDate
        ? (company.openingBalanceDate instanceof Date
            ? company.openingBalanceDate.toISOString()
            : company.openingBalanceDate)
        : null,
      coa: grouped,
      existingLines: existingLines.map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
      })),
    });
  } catch (err) {
    console.error("Opening balance GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /opening-balance/method — save accounting method preference ─────────
router.patch("/method", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { accountingMethod } = req.body ?? {};
    if (!accountingMethod || !["CASH", "ACCRUAL"].includes(accountingMethod))
      return res.status(400).json({ error: "accountingMethod must be CASH or ACCRUAL" });

    await db
      .update(companies)
      .set({ accountingMethod: accountingMethod as any, updatedAt: new Date() })
      .where(eq(companies.id, companyId));

    res.json({ success: true, accountingMethod });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /opening-balance/finalize — create JE + lock ────────────────────────
router.post("/finalize", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const { date, accountingMethod, lines } = req.body ?? {};

    if (!date || !lines?.length)
      return res.status(400).json({ error: "date and lines are required" });

    // lines: Array<{ accountId, type: ASSET|LIABILITY|EQUITY, amount }>
    const totalAssets     = lines.filter((l: any) => l.accountType === "ASSET")
                                 .reduce((s: number, l: any) => s + Math.abs(Number(l.amount)), 0);
    const totalLiabilities = lines.filter((l: any) => l.accountType === "LIABILITY")
                                  .reduce((s: number, l: any) => s + Math.abs(Number(l.amount)), 0);
    const totalEquity      = lines.filter((l: any) => l.accountType === "EQUITY")
                                  .reduce((s: number, l: any) => s + Math.abs(Number(l.amount)), 0);

    const diff = totalAssets - (totalLiabilities + totalEquity);
    if (Math.abs(diff) > 0.005) {
      return res.status(400).json({
        error: `Accounting equation out of balance by $${Math.abs(diff).toFixed(2)}. Assets must equal Liabilities + Equity.`,
      });
    }

    // Generate entry number
    const [lastEntry] = await db
      .select({ entryNumber: journalEntries.entryNumber })
      .from(journalEntries)
      .where(eq(journalEntries.companyId, companyId))
      .orderBy(desc(journalEntries.createdAt))
      .limit(1);

    let nextNum = 1;
    if (lastEntry?.entryNumber) {
      const m = lastEntry.entryNumber.match(/JE-(\d+)/);
      if (m) nextNum = parseInt(m[1]) + 1;
    }
    const entryNumber = `JE-${String(nextNum).padStart(6, "0")}`;

    // If an existing opening balance JE exists, void it first
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (company?.openingBalanceEntryId) {
      await db
        .update(journalEntries)
        .set({ status: "VOID", voidedAt: new Date(), updatedAt: new Date() })
        .where(eq(journalEntries.id, company.openingBalanceEntryId));
    }

    // Create new posted JE
    const [je] = await db
      .insert(journalEntries)
      .values({
        companyId,
        entryNumber,
        date: new Date(date),
        description: "Opening Balance Entry",
        memo: `Accounting method: ${accountingMethod ?? "CASH"}. Created by ${email ?? "admin"}.`,
        status: "POSTED",
        createdBy: email ?? null,
        postedAt: new Date(),
      })
      .returning();

    // Create JE lines
    // Assets → DEBIT; Liabilities + Equity → CREDIT
    for (const line of lines) {
      const amt = Math.abs(Number(line.amount));
      if (amt === 0) continue;
      const isAsset = line.accountType === "ASSET";
      await db.insert(journalEntryLines).values({
        journalEntryId: je.id,
        companyId,
        accountId: line.accountId,
        debit: isAsset ? amt : 0,
        credit: isAsset ? 0 : amt,
        description: line.accountName ?? null,
      });
    }

    // Save accounting method + opening balance entry ref on company
    await db
      .update(companies)
      .set({
        accountingMethod: (accountingMethod ?? "CASH") as any,
        openingBalanceEntryId: je.id,
        openingBalanceDate: new Date(date),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    res.status(201).json({
      success: true,
      journalEntryId: je.id,
      entryNumber: je.entryNumber,
      totalAssets,
      totalLiabilities,
      totalEquity,
    });
  } catch (err) {
    console.error("Opening balance finalize error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
