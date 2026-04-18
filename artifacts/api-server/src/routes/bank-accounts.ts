import { Router } from "express";
import { db, bankAccounts, transactions, chartOfAccounts, companies } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";
import { toIsoString, asDate } from "../lib/safeIso";
import { generateGlEntries } from "../lib/gl";
import { recomputeBankBalanceFromTransactions as recomputeBankBalance } from "../lib/bankBalance";

const router = Router();

async function getClosedUntil(companyId: string): Promise<Date | null> {
  const [co] = await db.select({ closedUntil: companies.closedUntil }).from(companies).where(eq(companies.id, companyId));
  return asDate(co?.closedUntil);
}

function isInClosedPeriod(txDate: unknown, closedUntil: unknown): boolean {
  const cu = asDate(closedUntil);
  if (!cu) return false;
  const d = asDate(txDate);
  if (!d) return false;
  return d <= cu;
}

function closedUntilLabel(closedUntil: unknown): string {
  const d = asDate(closedUntil);
  return d ? d.toISOString().slice(0, 10) : "(unknown)";
}

/** Build stable fingerprint for duplicate detection (same as transactions route). */
function buildFingerprint(amount: number, date: Date | string, payee: string): string {
  const d = date instanceof Date ? date : new Date(date);
  const dateStr = Number.isNaN(d.getTime())
    ? "1970-01-01"
    : d.toISOString().substring(0, 10);
  const payeeNorm = String(payee).trim().toLowerCase().replace(/\s+/g, " ");
  return `${Number(amount).toFixed(2)}_${dateStr}_${payeeNorm}`;
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const all = await db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId)).orderBy(bankAccounts.name);
    res.json(
      all.map((a) => ({
        ...a,
        createdAt: toIsoString(a.createdAt),
        updatedAt: toIsoString(a.updatedAt),
      })),
    );
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

/** POST /bank-accounts/transfer — move cash between two banks (paired register rows; single GL entry set). */
router.post("/transfer", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { fromBankAccountId, toBankAccountId, amount, date, memo, fundId } = req.body ?? {};

    if (!fromBankAccountId || !toBankAccountId || amount === undefined || !date) {
      return res.status(400).json({ error: "fromBankAccountId, toBankAccountId, amount, and date are required" });
    }
    if (fromBankAccountId === toBankAccountId) {
      return res.status(400).json({ error: "Cannot transfer to the same bank account" });
    }

    const amt = parseFloat(String(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    const [fromBank] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, fromBankAccountId), eq(bankAccounts.companyId, companyId)));
    const [toBank] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, toBankAccountId), eq(bankAccounts.companyId, companyId)));

    if (!fromBank || !toBank) return res.status(404).json({ error: "Bank account not found" });
    if (!fromBank.glAccountId || !toBank.glAccountId) {
      return res.status(400).json({
        error:
          "Both bank accounts must be linked to chart-of-accounts cash accounts. Open each bank on the Chart of Accounts page and link a GL account, then try again.",
      });
    }

    const [fromCoa] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, fromBank.glAccountId), eq(chartOfAccounts.companyId, companyId)));
    const [toCoa] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, toBank.glAccountId), eq(chartOfAccounts.companyId, companyId)));

    if (!fromCoa || !toCoa || fromCoa.type !== "ASSET" || toCoa.type !== "ASSET") {
      return res.status(400).json({
        error: "Inter-bank transfers require both linked GL accounts to be ASSET (cash) accounts.",
      });
    }
    if (fromBank.glAccountId === toBank.glAccountId) {
      return res.status(400).json({
        error:
          "Both banks are linked to the same chart account. Link each bank to a different cash account so the transfer posts to the right GL lines.",
      });
    }

    const txDate = new Date(`${String(date).slice(0, 10)}T12:00:00.000Z`);
    const closedUntil = await getClosedUntil(companyId);
    if (isInClosedPeriod(txDate, closedUntil)) {
      return res.status(403).json({
        error: `This period is locked through ${closedUntilLabel(closedUntil)}. Reopen the period before recording transfers.`,
        code: "PERIOD_LOCKED",
      });
    }

    const u = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const payeeOut = `Transfer to ${toBank.name} [${u}]`;
    const payeeIn = `Transfer from ${fromBank.name} [${u}]`;
    const fpOut = buildFingerprint(amt, txDate, payeeOut);
    const fpIn = buildFingerprint(amt, txDate, payeeIn);
    const memoLine = memo != null && String(memo).trim() !== "" ? String(memo).trim().slice(0, 500) : null;

    const [outLeg] = await db
      .insert(transactions)
      .values({
        companyId,
        bankAccountId: fromBankAccountId,
        date: txDate,
        payee: payeeOut,
        amount: amt,
        type: "DEBIT",
        status: "CLEARED",
        chartAccountId: toBank.glAccountId,
        isSplit: false,
        memo: memoLine,
        fundId: fundId ?? null,
        isVoid: false,
        excludeFromGl: false,
        transferPairTransactionId: null,
        transactionFingerprint: fpOut,
      })
      .returning();

    const [inLeg] = await db
      .insert(transactions)
      .values({
        companyId,
        bankAccountId: toBankAccountId,
        date: txDate,
        payee: payeeIn,
        amount: amt,
        type: "CREDIT",
        status: "CLEARED",
        chartAccountId: fromBank.glAccountId,
        isSplit: false,
        memo: memoLine,
        fundId: fundId ?? null,
        isVoid: false,
        excludeFromGl: true,
        transferPairTransactionId: outLeg.id,
        transactionFingerprint: fpIn,
      })
      .returning();

    await db
      .update(transactions)
      .set({ transferPairTransactionId: inLeg.id, updatedAt: new Date() })
      .where(eq(transactions.id, outLeg.id));

    await generateGlEntries(outLeg.id, companyId).catch((e) => console.error("[GL] transfer out leg:", e));
    await generateGlEntries(inLeg.id, companyId).catch(() => {});

    await recomputeBankBalance(fromBankAccountId, companyId).catch((e) => console.error("[Balance] transfer:", e));
    await recomputeBankBalance(toBankAccountId, companyId).catch((e) => console.error("[Balance] transfer:", e));

    res.status(201).json({
      success: true,
      outTransactionId: outLeg.id,
      inTransactionId: inLeg.id,
      message: `Transferred ${amt.toFixed(2)} from ${fromBank.name} to ${toBank.name}.`,
    });
  } catch (error) {
    console.error("Bank transfer error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, accountType, lastFour, currentBalance, glAccountId, isActive } = req.body ?? {};
    if (!name || !accountType) return res.status(400).json({ error: "Missing required fields" });

    const [created] = await db.insert(bankAccounts).values({
      companyId,
      name,
      accountType: accountType || "CHECKING",
      lastFour: lastFour || null,
      currentBalance: parseFloat(currentBalance) || 0,
      glAccountId: glAccountId || null,
      isActive: isActive !== false,
    }).returning();

    res.status(201).json({
      ...created,
      createdAt: toIsoString(created.createdAt),
      updatedAt: toIsoString(created.updatedAt),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, accountType, lastFour, currentBalance, glAccountId, isActive } = req.body ?? {};

    const [updated] = await db.update(bankAccounts).set({
      name,
      accountType,
      lastFour: lastFour || null,
      currentBalance: currentBalance !== undefined ? parseFloat(currentBalance) : undefined,
      glAccountId: glAccountId || null,
      isActive,
      updatedAt: new Date(),
    }).where(and(eq(bankAccounts.id, req.params.id), eq(bankAccounts.companyId, companyId))).returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({
      ...updated,
      createdAt: toIsoString(updated.createdAt),
      updatedAt: toIsoString(updated.updatedAt),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await db.delete(bankAccounts).where(and(eq(bankAccounts.id, req.params.id), eq(bankAccounts.companyId, companyId)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
