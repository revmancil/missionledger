import { Router } from "express";
import { db, companies, chartOfAccounts, funds, journalEntries, journalEntryLines } from "@workspace/db";
import { eq, and, asc, desc, like } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find or auto-create a COA EQUITY account for a fund. */
async function getOrCreateFundCoaAccount(
  companyId: string,
  fundId: string,
  fundName: string
): Promise<string> {
  // Look for an existing EQUITY account whose description contains the fund ID
  const existing = await db
    .select()
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.companyId, companyId),
        eq(chartOfAccounts.type, "EQUITY"),
        like(chartOfAccounts.description, `%fund:${fundId}%`)
      )
    )
    .limit(1);

  if (existing.length) return existing[0].id;

  // Find the next available code in the 3200-3299 range (fund equity sub-accounts)
  const equityAccounts = await db
    .select({ code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(
      and(
        eq(chartOfAccounts.companyId, companyId),
        eq(chartOfAccounts.type, "EQUITY")
      )
    );

  // Collect used codes in the 3200-3299 range
  const used = new Set(equityAccounts.map((a) => a.code));
  let newCode = "3210";
  for (let n = 3210; n <= 3299; n += 10) {
    const candidate = String(n);
    if (!used.has(candidate)) { newCode = candidate; break; }
  }
  // Fall back to 3400+ if 32xx range is full
  if (used.has(newCode)) {
    for (let n = 3400; n <= 3990; n += 10) {
      const candidate = String(n);
      if (!used.has(candidate)) { newCode = candidate; break; }
    }
  }

  const [created] = await db
    .insert(chartOfAccounts)
    .values({
      companyId,
      code: newCode,
      name: fundName,
      type: "EQUITY",
      description: `Restricted Fund account. fund:${fundId}`,
      isSystem: false,
      isActive: true,
      sortOrder: parseInt(newCode),
    })
    .returning();

  return created.id;
}

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

    // Active funds for this company
    const activeFunds = await db
      .select()
      .from(funds)
      .where(and(eq(funds.companyId, companyId), eq(funds.isActive, true)))
      .orderBy(asc(funds.name));

    // If an opening balance JE exists, fetch its lines
    let existingLines: any[] = [];
    if (company.openingBalanceEntryId) {
      existingLines = await db
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, company.openingBalanceEntryId));
    }

    // Group COA by type — exclude EQUITY accounts that were auto-created for funds
    // (those are shown under the Funds section instead)
    const fundLinkedCoaIds = new Set<string>();
    for (const f of activeFunds) {
      const linked = await db
        .select({ id: chartOfAccounts.id })
        .from(chartOfAccounts)
        .where(
          and(
            eq(chartOfAccounts.companyId, companyId),
            eq(chartOfAccounts.type, "EQUITY"),
            like(chartOfAccounts.description, `%fund:${f.id}%`)
          )
        )
        .limit(1);
      if (linked.length) {
        fundLinkedCoaIds.add(linked[0].id);
        // Map existing JE lines for this fund's coa account back to the fund ID
        const line = existingLines.find((l) => l.accountId === linked[0].id);
        if (line) {
          existingLines = existingLines.map((l) =>
            l.accountId === linked[0].id
              ? { ...l, fundId: f.id, accountId: linked[0].id }
              : l
          );
        }
      }
    }

    const grouped = {
      ASSET:     coa.filter((a) => a.type === "ASSET"),
      LIABILITY: coa.filter((a) => a.type === "LIABILITY"),
      // Exclude fund-linked equity accounts from main COA list
      EQUITY:    coa.filter((a) => a.type === "EQUITY" && !fundLinkedCoaIds.has(a.id)),
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
      funds: activeFunds.map((f) => {
        const linkedId = [...fundLinkedCoaIds].find((id) =>
          existingLines.some((l) => l.accountId === id && l.fundId === f.id)
        ) ?? null;
        const line = linkedId ? existingLines.find((l) => l.accountId === linkedId) : null;
        return {
          id: f.id,
          name: f.name,
          description: f.description,
          existingBalance: line ? (line.credit ?? 0) : 0,
        };
      }),
      existingLines: existingLines
        .filter((l) => !l.fundId) // COA-only lines (funds handled above)
        .map((l) => ({
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
    const { date, accountingMethod, lines, fundLines } = req.body ?? {};

    if (!date || (!lines?.length && !fundLines?.length))
      return res.status(400).json({ error: "date and at least one balance line are required" });

    const allCoaLines: any[] = lines ?? [];

    // Resolve fund lines → ensure each has a COA account
    const resolvedFundLines: Array<{ accountId: string; accountName: string; accountType: "EQUITY"; amount: number }> = [];
    for (const fl of (fundLines ?? [])) {
      const amt = Math.abs(Number(fl.amount));
      if (amt === 0) continue;
      const coaId = await getOrCreateFundCoaAccount(companyId, fl.fundId, fl.fundName);
      resolvedFundLines.push({
        accountId: coaId,
        accountName: fl.fundName,
        accountType: "EQUITY",
        amount: amt,
      });
    }

    const combinedEquityLines = [
      ...allCoaLines.filter((l: any) => l.accountType === "EQUITY"),
      ...resolvedFundLines,
    ];

    const totalAssets = allCoaLines
      .filter((l: any) => l.accountType === "ASSET")
      .reduce((s: number, l: any) => s + Math.abs(Number(l.amount)), 0);

    const totalLiabilities = allCoaLines
      .filter((l: any) => l.accountType === "LIABILITY")
      .reduce((s: number, l: any) => s + Math.abs(Number(l.amount)), 0);

    const totalEquity = combinedEquityLines.reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

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

    // Void any existing opening balance JE
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

    // Assets → DEBIT; Liabilities + Equity (including funds) → CREDIT
    const jeLines = [
      ...allCoaLines.filter((l: any) => l.accountType !== "EQUITY"),
      ...combinedEquityLines,
    ];

    for (const line of jeLines) {
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

    // Save method + opening balance ref on company
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
