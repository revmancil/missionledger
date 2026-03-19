import { Router } from "express";
import { db, companies, chartOfAccounts, bankAccounts, funds, journalEntries, journalEntryLines } from "@workspace/db";
import { eq, and, asc, desc, like, inArray, isNull } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find or auto-create a fund-specific Net Assets equity account.
 * Uses description tag `fund:<fundId>` for lookups.
 */
async function getOrCreateFundNetAssetsAccount(
  companyId: string,
  fundId: string,
  fundName: string
): Promise<string> {
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

  const equityAccounts = await db
    .select({ code: chartOfAccounts.code })
    .from(chartOfAccounts)
    .where(and(eq(chartOfAccounts.companyId, companyId), eq(chartOfAccounts.type, "EQUITY")));

  const used = new Set(equityAccounts.map((a) => a.code));
  let newCode = "3210";
  for (let n = 3210; n <= 3299; n += 10) {
    const candidate = String(n);
    if (!used.has(candidate)) { newCode = candidate; break; }
  }
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
      name: `Net Assets — ${fundName}`,
      type: "EQUITY",
      description: `Net Assets for fund. fund:${fundId}`,
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

    let coa = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.companyId, companyId))
      .orderBy(asc(chartOfAccounts.code));

    // ── Bank account enrichment ──────────────────────────────────────────────
    // Fetch all bank accounts for this company so we can:
    // 1. Auto-create COA entries for Plaid-linked accounts missing a GL account
    // 2. Annotate COA accounts with their linked bank account name
    const companyBankAccounts = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isActive, true)));

    // For any Plaid/bank account with no GL account, auto-create one
    for (const ba of companyBankAccounts) {
      if (ba.glAccountId) continue; // already linked

      // Pick a free code in the 1010-1099 range for bank accounts
      const usedCodes = new Set(coa.map((a) => a.code));
      let newCode = "1010";
      for (let n = 1010; n <= 1099; n += 10) {
        const candidate = String(n);
        if (!usedCodes.has(candidate)) { newCode = candidate; break; }
      }

      const [created] = await db
        .insert(chartOfAccounts)
        .values({
          companyId,
          code: newCode,
          name: ba.name,
          type: "ASSET",
          description: `Bank account: ${ba.accountType}. bankAccountId:${ba.id}`,
          isSystem: false,
          isActive: true,
          sortOrder: parseInt(newCode),
        })
        .returning();

      // Link the bank account to its new COA entry
      await db
        .update(bankAccounts)
        .set({ glAccountId: created.id, updatedAt: new Date() })
        .where(eq(bankAccounts.id, ba.id));

      // Refresh COA list to include the new account
      ba.glAccountId = created.id;
      coa.push(created);
    }

    // Build a lookup: coaId → bank account info (for annotation)
    const coaToBankAccount = new Map<string, { bankName: string; accountType: string; isPlaid: boolean }>();
    for (const ba of companyBankAccounts) {
      if (ba.glAccountId) {
        coaToBankAccount.set(ba.glAccountId, {
          bankName: ba.plaidInstitutionName
            ? `${ba.name} (${ba.plaidInstitutionName})`
            : ba.name,
          accountType: ba.accountType,
          isPlaid: ba.isPlaidLinked,
        });
      }
    }

    // Annotate COA accounts with bank linkage info
    const annotatedCoa = coa.map((a) => {
      const bankInfo = coaToBankAccount.get(a.id);
      return bankInfo
        ? { ...a, isLinkedBankAccount: true, linkedBankName: bankInfo.bankName, linkedAccountType: bankInfo.accountType, isPlaidLinked: bankInfo.isPlaid }
        : a;
    });

    const activeFunds = await db
      .select()
      .from(funds)
      .where(and(eq(funds.companyId, companyId), eq(funds.isActive, true)))
      .orderBy(asc(funds.name));

    // Reconstruct rows from existing JE for pre-fill
    let existingRows: any[] = [];
    if (company.openingBalanceEntryId) {
      const jeLines = await db
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, company.openingBalanceEntryId));

      // Get account types for all accounts in the JE
      const accountIds = [...new Set(jeLines.map((l) => l.accountId))];
      const accountsInJe = accountIds.length
        ? await db.select().from(chartOfAccounts).where(inArray(chartOfAccounts.id, accountIds))
        : [];
      const acctMap = Object.fromEntries(accountsInJe.map((a) => [a.id, a]));

      // Collect fund-linked equity account IDs so we can skip them (they're the balancing side)
      const fundLinkedIds = new Set<string>();
      for (const a of accountsInJe) {
        if (a.type === "EQUITY" && a.description?.includes("fund:")) {
          fundLinkedIds.add(a.id);
        }
      }

      for (const line of jeLines) {
        const acct = acctMap[line.accountId];
        if (!acct) continue;
        // Skip the balancing (equity) side — we only reconstruct the asset/liability rows
        if (fundLinkedIds.has(line.accountId)) continue;

        if (acct.type === "ASSET" && line.debit > 0) {
          existingRows.push({
            accountId: line.accountId,
            accountType: "ASSET",
            fundId: line.fundId ?? null,
            amount: line.debit,
            memo: line.description ?? "",
          });
        } else if (acct.type === "LIABILITY" && line.credit > 0) {
          existingRows.push({
            accountId: line.accountId,
            accountType: "LIABILITY",
            fundId: line.fundId ?? null,
            amount: line.credit,
            memo: line.description ?? "",
          });
        }
      }
    }

    const grouped = {
      ASSET:     annotatedCoa.filter((a) => a.type === "ASSET"),
      LIABILITY: annotatedCoa.filter((a) => a.type === "LIABILITY"),
      EQUITY:    annotatedCoa.filter((a) => a.type === "EQUITY"),
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
      funds: activeFunds,
      existingRows,
    });
  } catch (err) {
    console.error("Opening balance GET error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /opening-balance/method ─────────────────────────────────────────────
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

// ── POST /opening-balance/finalize ────────────────────────────────────────────
/**
 * Accepts per-row fund assignments and creates a self-balancing journal entry.
 *
 * Each row becomes a DR/CR pair:
 *   ASSET:     DR [Asset Account / fundId]  |  CR [Fund Net Assets / fundId]
 *   LIABILITY: DR [Fund Net Assets / fundId] |  CR [Liability Account / fundId]
 *
 * This ensures the Statement of Financial Position shows equity correctly
 * allocated to each fund (Restricted, Unrestricted, Board-Designated, etc.)
 */
router.post("/finalize", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const { date, accountingMethod, rows } = req.body ?? {};

    if (!date) return res.status(400).json({ error: "As-of date is required" });

    const asOf = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (asOf > today) {
      return res.status(400).json({ error: "As-of date cannot be in the future." });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "At least one balance row is required." });
    }

    // Validate every row has a fund
    const missingFund = rows.find((r: any) => !r.fundId);
    if (missingFund) {
      return res.status(400).json({ error: "Every row must have a Fund selected." });
    }

    // Filter to non-zero amounts
    const activeRows = rows.filter((r: any) => Math.abs(Number(r.amount)) > 0);
    if (activeRows.length === 0) {
      return res.status(400).json({ error: "At least one row must have an amount greater than zero." });
    }

    // Fetch all referenced funds for names
    const fundIds = [...new Set(activeRows.map((r: any) => r.fundId as string))];
    const fundRecords = await db.select().from(funds).where(inArray(funds.id, fundIds));
    const fundMap = Object.fromEntries(fundRecords.map((f) => [f.id, f.name]));

    // Build JE lines (each row creates 2 lines: asset/liability + fund net assets)
    interface JELine {
      accountId: string;
      debit: number;
      credit: number;
      fundId: string;
      description: string | null;
    }
    const jeLines: JELine[] = [];

    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const row of activeRows) {
      const amt = Math.abs(Number(row.amount));
      const fundName = fundMap[row.fundId] ?? row.fundName ?? "Fund";
      const fundNetAssetsId = await getOrCreateFundNetAssetsAccount(companyId, row.fundId, fundName);

      if (row.accountType === "ASSET") {
        totalAssets += amt;
        // DR Asset Account / CR Fund Net Assets
        jeLines.push({ accountId: row.accountId, debit: amt, credit: 0, fundId: row.fundId, description: row.memo || null });
        jeLines.push({ accountId: fundNetAssetsId, debit: 0, credit: amt, fundId: row.fundId, description: row.memo || null });
      } else if (row.accountType === "LIABILITY") {
        totalLiabilities += amt;
        // DR Fund Net Assets / CR Liability Account
        jeLines.push({ accountId: fundNetAssetsId, debit: amt, credit: 0, fundId: row.fundId, description: row.memo || null });
        jeLines.push({ accountId: row.accountId, debit: 0, credit: amt, fundId: row.fundId, description: row.memo || null });
      }
    }

    // Verify self-balancing
    const totalDebits  = jeLines.reduce((s, l) => s + l.debit, 0);
    const totalCredits = jeLines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebits - totalCredits) > 0.005) {
      return res.status(500).json({ error: "Internal balancing error — please contact support." });
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

    // Create posted JE
    const [je] = await db
      .insert(journalEntries)
      .values({
        companyId,
        entryNumber,
        date: asOf,
        description: "Opening Balance Entry",
        memo: `Accounting method: ${accountingMethod ?? "CASH"}. Created by ${email ?? "admin"}.`,
        status: "POSTED",
        createdBy: email ?? null,
        postedAt: new Date(),
      })
      .returning();

    // Insert all JE lines
    for (const line of jeLines) {
      await db.insert(journalEntryLines).values({
        journalEntryId: je.id,
        companyId,
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        fundId: line.fundId,
        description: line.description,
      });
    }

    // Save method + opening balance ref on company
    await db
      .update(companies)
      .set({
        accountingMethod: (accountingMethod ?? "CASH") as any,
        openingBalanceEntryId: je.id,
        openingBalanceDate: asOf,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    const totalNetAssets = totalAssets - totalLiabilities;

    res.status(201).json({
      success: true,
      journalEntryId: je.id,
      entryNumber: je.entryNumber,
      totalAssets,
      totalLiabilities,
      totalNetAssets,
      fundSummary: fundRecords.map((f) => {
        const fundAssets = activeRows
          .filter((r: any) => r.fundId === f.id && r.accountType === "ASSET")
          .reduce((s: number, r: any) => s + Math.abs(Number(r.amount)), 0);
        const fundLiabilities = activeRows
          .filter((r: any) => r.fundId === f.id && r.accountType === "LIABILITY")
          .reduce((s: number, r: any) => s + Math.abs(Number(r.amount)), 0);
        return { fundId: f.id, fundName: f.name, assets: fundAssets, liabilities: fundLiabilities, netAssets: fundAssets - fundLiabilities };
      }),
    });
  } catch (err) {
    console.error("Opening balance finalize error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
