import { Router } from "express";
import { db, companies, chartOfAccounts, bankAccounts, funds, journalEntries, journalEntryLines, glEntries, transactions } from "@workspace/db";
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

// ── GET /opening-balance ───────────────────────────────────────────────────────
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

    // Auto-create COA entries for Plaid-linked bank accounts missing a GL account
    const companyBankAccounts = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isActive, true)));

    for (const ba of companyBankAccounts) {
      if (ba.glAccountId) continue;
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
      await db.update(bankAccounts).set({ glAccountId: created.id, updatedAt: new Date() }).where(eq(bankAccounts.id, ba.id));
      ba.glAccountId = created.id;
      coa.push(created);
    }

    // Annotate COA accounts with bank linkage info
    const coaToBankAccount = new Map<string, { bankName: string; isPlaid: boolean }>();
    for (const ba of companyBankAccounts) {
      if (ba.glAccountId) {
        coaToBankAccount.set(ba.glAccountId, {
          bankName: ba.plaidInstitutionName ? `${ba.name} (${ba.plaidInstitutionName})` : ba.name,
          isPlaid: ba.isPlaidLinked,
        });
      }
    }
    const annotatedCoa = coa.map((a) => {
      const bankInfo = coaToBankAccount.get(a.id);
      return bankInfo ? { ...a, isLinkedBankAccount: true, linkedBankName: bankInfo.bankName, isPlaidLinked: bankInfo.isPlaid } : a;
    });

    const activeFunds = await db
      .select()
      .from(funds)
      .where(and(eq(funds.companyId, companyId), eq(funds.isActive, true)))
      .orderBy(asc(funds.name));

    // Reconstruct rows from existing JE (all lines, explicit DR/CR)
    let existingRows: any[] = [];
    if (company.openingBalanceEntryId) {
      const jeLines = await db
        .select()
        .from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, company.openingBalanceEntryId));

      for (const line of jeLines) {
        if ((line.debit ?? 0) > 0) {
          existingRows.push({
            accountId: line.accountId,
            entryType: "DEBIT",
            fundId: line.fundId ?? null,
            amount: line.debit,
            memo: line.description ?? "",
          });
        } else if ((line.credit ?? 0) > 0) {
          existingRows.push({
            accountId: line.accountId,
            entryType: "CREDIT",
            fundId: line.fundId ?? null,
            amount: line.credit,
            memo: line.description ?? "",
          });
        }
      }
    }

    res.json({
      accountingMethod: company.accountingMethod ?? "CASH",
      openingBalanceEntryId: company.openingBalanceEntryId ?? null,
      openingBalanceDate: company.openingBalanceDate
        ? (company.openingBalanceDate instanceof Date
            ? company.openingBalanceDate.toISOString()
            : company.openingBalanceDate)
        : null,
      coa: annotatedCoa,
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
    await db.update(companies).set({ accountingMethod: accountingMethod as any, updatedAt: new Date() }).where(eq(companies.id, companyId));
    res.json({ success: true, accountingMethod });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /opening-balance/finalize ────────────────────────────────────────────
/**
 * Accepts explicit DR/CR rows and posts a self-balancing journal entry.
 * Total Debits MUST equal Total Credits — validated server-side.
 * Each line also writes a gl_entry with sourceType = 'OPENING_BALANCE'.
 */
router.post("/finalize", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId, email } = (req as any).user;
    const { date, accountingMethod, rows } = req.body ?? {};

    if (!date) return res.status(400).json({ error: "As-of date is required." });

    const asOf = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (asOf > today) return res.status(400).json({ error: "As-of date cannot be in the future." });

    if (!Array.isArray(rows) || rows.length < 2) {
      return res.status(400).json({ error: "At least 2 rows are required." });
    }

    const activeRows = rows.filter((r: any) => Number(r.amount) > 0.009);
    if (activeRows.length < 2) {
      return res.status(400).json({ error: "At least 2 rows must have an amount greater than zero." });
    }

    for (const r of activeRows) {
      if (!r.accountId) return res.status(400).json({ error: "Every row must have an account selected." });
      if (!r.fundId) return res.status(400).json({ error: "Every row must have a fund selected." });
      if (!["DEBIT", "CREDIT"].includes(r.entryType)) return res.status(400).json({ error: "Invalid entry type on one or more rows." });
    }

    const totalDebits = activeRows.reduce((s: number, r: any) => s + (r.entryType === "DEBIT" ? Number(r.amount) : 0), 0);
    const totalCredits = activeRows.reduce((s: number, r: any) => s + (r.entryType === "CREDIT" ? Number(r.amount) : 0), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return res.status(400).json({
        error: `Entry is not balanced. Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)}. Difference: $${Math.abs(totalDebits - totalCredits).toFixed(2)}.`,
      });
    }

    // Fetch account metadata for denormalization
    const accountIds = [...new Set(activeRows.map((r: any) => r.accountId as string))];
    const accountsInEntry = accountIds.length
      ? await db.select().from(chartOfAccounts).where(inArray(chartOfAccounts.id, accountIds))
      : [];
    const acctMap = Object.fromEntries(accountsInEntry.map((a) => [a.id, a]));

    // Fetch fund metadata for denormalization
    const fundIds = [...new Set(activeRows.map((r: any) => r.fundId as string))];
    const fundsInEntry = fundIds.length
      ? await db.select().from(funds).where(inArray(funds.id, fundIds))
      : [];
    const fundMap = Object.fromEntries(fundsInEntry.map((f) => [f.id, f]));

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

    // Void existing OB entry
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

    // Insert JE lines and GL entries
    for (const row of activeRows) {
      const acct = acctMap[row.accountId];
      const fund = fundMap[row.fundId];
      const amt = Number(row.amount);

      await db.insert(journalEntryLines).values({
        journalEntryId: je.id,
        companyId,
        accountId: row.accountId,
        debit: row.entryType === "DEBIT" ? amt : 0,
        credit: row.entryType === "CREDIT" ? amt : 0,
        fundId: row.fundId,
        description: row.memo || null,
      });

      await db.insert(glEntries).values({
        companyId,
        journalEntryId: je.id,
        sourceType: "OPENING_BALANCE",
        accountId: row.accountId,
        accountCode: acct?.code ?? "",
        accountName: acct?.name ?? "",
        fundId: row.fundId,
        fundName: fund?.name ?? null,
        entryType: row.entryType,
        amount: amt,
        description: row.memo || "Opening Balance Entry",
        date: asOf,
      });
    }

    // ── Bug 1: Sync bank account balances from GL entries ──────────────────────
    // Find all bank accounts linked to any account in this entry
    const linkedBanks = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, companyId), inArray(bankAccounts.glAccountId as any, accountIds)));

    for (const ba of linkedBanks) {
      if (!ba.glAccountId) continue;
      const balResult = await db.execute(sql`
        SELECT COALESCE(SUM(CASE WHEN entry_type='DEBIT' THEN amount ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE 0 END), 0) AS balance
        FROM gl_entries
        WHERE account_id = ${ba.glAccountId} AND company_id = ${companyId} AND is_void = false
      `);
      const newBalance = parseFloat((balResult.rows[0] as any)?.balance ?? "0") || 0;
      await db
        .update(bankAccounts)
        .set({ currentBalance: newBalance, updatedAt: new Date() })
        .where(eq(bankAccounts.id, ba.id));
    }

    // ── Bug 2: Create / refresh bank-register transactions for OB entry ────────
    // Void any transactions from a previous OB posting
    if (company.openingBalanceEntryId) {
      await db
        .update(transactions)
        .set({ isVoid: true, status: "VOID", updatedAt: new Date() })
        .where(
          and(
            eq(transactions.companyId, companyId),
            eq(transactions.journalEntryId as any, company.openingBalanceEntryId)
          )
        );
    }

    // Build glAccountId → bankAccountId lookup for fast matching
    const glToBankId = Object.fromEntries(linkedBanks.map((ba) => [ba.glAccountId!, ba.id]));

    for (const row of activeRows) {
      const bankAccountId = glToBankId[row.accountId];
      if (!bankAccountId) continue; // only create transactions for bank account rows
      // DR to asset account = DEPOSIT in the register (CREDIT type)
      // CR to asset account = WITHDRAWAL from the register (DEBIT type)
      const txType: "CREDIT" | "DEBIT" = row.entryType === "DEBIT" ? "CREDIT" : "DEBIT";
      await db.insert(transactions).values({
        companyId,
        bankAccountId,
        date: asOf,
        payee: "Opening Balance",
        amount: Number(row.amount),
        type: txType,
        status: "CLEARED",
        chartAccountId: row.accountId,
        fundId: row.fundId ?? null,
        memo: "Opening Balance Entry",
        referenceNumber: je.entryNumber,
        journalEntryId: je.id,
        isVoid: false,
      });
    }

    // Update company record
    await db
      .update(companies)
      .set({
        accountingMethod: (accountingMethod ?? "CASH") as any,
        openingBalanceEntryId: je.id,
        openingBalanceDate: asOf,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    res.status(201).json({
      success: true,
      journalEntryId: je.id,
      entryNumber: je.entryNumber,
      totalDebits,
      totalCredits,
      lineCount: activeRows.length,
      date: asOf.toISOString(),
      accountingMethod: accountingMethod ?? "CASH",
    });
  } catch (err) {
    console.error("Opening balance finalize error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /opening-balance/recalculate — full GL replay of all bank balances ──
/**
 * The nuclear option:
 *   1. Zero every bank_accounts.current_balance for this company
 *   2. Replay every non-void gl_entry and recompute balances from scratch
 *   3. Repair OB transactions so journalEntryId is set (enables JE drill-down)
 * Fund balances are already computed dynamically — no reset needed for funds.
 */
router.post("/recalculate", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    // ── Step A: Reset all bank_account balances to zero ────────────────────
    await db
      .update(bankAccounts)
      .set({ currentBalance: 0, updatedAt: new Date() })
      .where(eq(bankAccounts.companyId, companyId));
    console.log(`[Recalculate] Reset all bank account balances to $0.00 for company ${companyId}`);

    // ── Step B: Get all bank accounts that have a linked GL account ─────────
    const allBanks = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, companyId)));

    const linkedBanks = allBanks.filter((ba) => ba.glAccountId);

    const bankResults: Array<{ name: string; newBalance: number }> = [];

    // ── Step C: For each bank account, replay all gl_entries ─────────────
    for (const ba of linkedBanks) {
      const result = await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'DEBIT'  THEN amount ELSE 0 END), 0) AS total_debit,
          COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_credit
        FROM gl_entries
        WHERE account_id = ${ba.glAccountId}
          AND company_id = ${companyId}
          AND is_void = false
      `);
      const row = result.rows[0] as any;
      const debit  = parseFloat(row?.total_debit  ?? "0") || 0;
      const credit = parseFloat(row?.total_credit ?? "0") || 0;
      // Asset accounts: DEBIT increases, CREDIT decreases
      const newBalance = debit - credit;

      await db
        .update(bankAccounts)
        .set({ currentBalance: newBalance, updatedAt: new Date() })
        .where(eq(bankAccounts.id, ba.id));

      bankResults.push({ name: ba.name, newBalance });
      console.log(`[Recalculate] "${ba.name}": debit=${debit.toFixed(2)}, credit=${credit.toFixed(2)}, balance=${newBalance.toFixed(2)}`);
    }

    // ── Step D: Compute fund balances from gl_entries (for reporting only) ─
    const fundResult = await db.execute(sql`
      SELECT
        g.fund_id,
        f.name AS fund_name,
        SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END) AS total_credit,
        SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END) AS total_debit
      FROM gl_entries g
      JOIN funds f ON f.id = g.fund_id
      JOIN chart_of_accounts c ON c.id = g.account_id
      WHERE g.company_id = ${companyId}
        AND g.is_void = false
        AND g.fund_id IS NOT NULL
        AND c.coa_type IN ('EQUITY', 'INCOME', 'EXPENSE')
      GROUP BY g.fund_id, f.name
    `);
    const fundBalances = (fundResult.rows as any[]).map((r) => ({
      fundId:   r.fund_id,
      name:     r.fund_name,
      balance:  parseFloat(r.total_credit) - parseFloat(r.total_debit),
    }));

    // ── Step E: Fix JE linkage on OB transactions ──────────────────────────
    // Find the company's OB JE
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    let jeFixed = 0;

    if (company?.openingBalanceEntryId) {
      const jeId = company.openingBalanceEntryId;

      // Fetch the OB JE for date/entryNumber
      const [je] = await db
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.id, jeId), eq(journalEntries.companyId, companyId)));

      // Get all GL entries for this JE that map to a bank account
      const obGlEntries = await db
        .select()
        .from(glEntries)
        .where(and(eq(glEntries.journalEntryId, jeId), eq(glEntries.companyId, companyId)));

      const glToBankId: Record<string, string> = {};
      for (const ba of linkedBanks) {
        if (ba.glAccountId) glToBankId[ba.glAccountId] = ba.id;
      }

      // Void any existing OB transactions for this company (regardless of journalEntryId)
      await db
        .update(transactions)
        .set({ isVoid: true, status: "VOID", updatedAt: new Date() })
        .where(and(
          eq(transactions.companyId, companyId),
          eq(transactions.payee, "Opening Balance"),
        ));

      // Create fresh OB transactions with journalEntryId properly set
      for (const entry of obGlEntries) {
        const bankAccountId = glToBankId[entry.accountId];
        if (!bankAccountId) continue;

        // Flip: bank register shows the bank's perspective (DEBIT GL = bank deposit)
        const txType: "CREDIT" | "DEBIT" = entry.entryType === "DEBIT" ? "CREDIT" : "DEBIT";

        await db.insert(transactions).values({
          companyId,
          bankAccountId,
          date: entry.date ?? je?.date ?? new Date(),
          payee: "Opening Balance",
          amount: entry.amount,
          type: txType,
          status: "CLEARED",
          chartAccountId: entry.accountId,
          fundId: entry.fundId ?? null,
          memo: "Opening Balance Entry",
          referenceNumber: je?.entryNumber ?? null,
          journalEntryId: jeId,
          isVoid: false,
        });
        jeFixed++;
      }

      console.log(`[Recalculate] Created ${jeFixed} bank register transaction(s) with journalEntryId="${jeId}"`);
    }

    res.json({
      success: true,
      bankAccountsUpdated: bankResults,
      fundBalances,
      obTransactionsFixed: jeFixed,
      message: `All bank and fund balances have been recalculated based on the General Ledger. ${bankResults.length} bank account(s) updated. ${jeFixed} Opening Balance transaction(s) repaired.`,
    });
  } catch (err) {
    console.error("Recalculate balances error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /opening-balance/sync — force-sync balances for existing OB entry ───
/**
 * Retroactively applies bank-balance updates and transaction creation for an
 * already-posted Opening Balance JE.  Call this once if OB was posted before
 * the auto-sync code was deployed.
 */
router.post("/sync", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company?.openingBalanceEntryId) {
      return res.status(400).json({ error: "No opening balance entry found for this company." });
    }

    const jeId = company.openingBalanceEntryId;

    // Fetch all GL entries for this JE
    const jeGlEntries = await db
      .select()
      .from(glEntries)
      .where(and(eq(glEntries.journalEntryId, jeId), eq(glEntries.companyId, companyId)));

    if (!jeGlEntries.length) {
      return res.status(400).json({ error: "No GL entries found for this opening balance JE." });
    }

    // ── Step 1: Recompute and update bank account balances ─────────────────
    const uniqueAccountIds = [...new Set(jeGlEntries.map((g) => g.accountId))];
    const linkedBanks = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.companyId, companyId), inArray(bankAccounts.glAccountId as any, uniqueAccountIds)));

    const bankUpdates: Array<{ name: string; newBalance: number }> = [];

    for (const ba of linkedBanks) {
      if (!ba.glAccountId) continue;
      const balResult = await db.execute(sql`
        SELECT COALESCE(SUM(CASE WHEN entry_type='DEBIT' THEN amount ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE 0 END), 0) AS balance
        FROM gl_entries
        WHERE account_id = ${ba.glAccountId} AND company_id = ${companyId} AND is_void = false
      `);
      const newBalance = parseFloat((balResult.rows[0] as any)?.balance ?? "0") || 0;
      await db
        .update(bankAccounts)
        .set({ currentBalance: newBalance, updatedAt: new Date() })
        .where(eq(bankAccounts.id, ba.id));

      bankUpdates.push({ name: ba.name, newBalance });
      console.log(`[OB Sync] Successfully updated "${ba.name}" balance to ${newBalance.toFixed(2)}`);
    }

    // ── Step 2: Create bank-register transactions (void existing, insert new) ─
    // Void any previously created OB transactions for this JE
    await db
      .update(transactions)
      .set({ isVoid: true, status: "VOID", updatedAt: new Date() })
      .where(and(eq(transactions.companyId, companyId), eq(transactions.journalEntryId as any, jeId)));

    const glToBankId = Object.fromEntries(linkedBanks.map((ba) => [ba.glAccountId!, ba.id]));

    // Fetch the JE to get its entryNumber and date
    const [je] = await db
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, jeId), eq(journalEntries.companyId, companyId)));

    const txCreated: string[] = [];

    for (const entry of jeGlEntries) {
      const bankAccountId = glToBankId[entry.accountId];
      if (!bankAccountId) continue;

      const txType: "CREDIT" | "DEBIT" = entry.entryType === "DEBIT" ? "CREDIT" : "DEBIT";
      await db.insert(transactions).values({
        companyId,
        bankAccountId,
        date: entry.date ?? je?.date ?? new Date(),
        payee: "Opening Balance",
        amount: entry.amount,
        type: txType,
        status: "CLEARED",
        chartAccountId: entry.accountId,
        fundId: entry.fundId ?? null,
        memo: "Opening Balance Entry",
        referenceNumber: je?.entryNumber ?? null,
        journalEntryId: jeId,
        isVoid: false,
      });

      const bankName = linkedBanks.find((b) => b.id === bankAccountId)?.name ?? "Unknown";
      txCreated.push(`${bankName}: ${txType === "CREDIT" ? "Deposit" : "Payment"} $${entry.amount.toFixed(2)}`);
      console.log(`[OB Sync] Created bank register transaction for "${bankName}" — ${txType} $${entry.amount.toFixed(2)}`);
    }

    res.json({
      success: true,
      journalEntryId: jeId,
      bankBalancesUpdated: bankUpdates,
      transactionsCreated: txCreated,
    });
  } catch (err) {
    console.error("Opening balance sync error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
