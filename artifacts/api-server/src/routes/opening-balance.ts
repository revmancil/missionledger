import { Router } from "express";
import { db, companies, chartOfAccounts, bankAccounts, funds, journalEntries, journalEntryLines, glEntries } from "@workspace/db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
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

export default router;
