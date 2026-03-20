import { Router } from "express";
import { db, bankAccounts, transactions, funds } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

/**
 * GET /api/financial-summary
 * Lightweight single-source-of-truth endpoint.
 * Returns totalCash, ytdRevenue, ytdExpenses, fundBalances, and txCount.
 * All components that show financial KPIs should refetch when a transaction mutates.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const now = new Date();
    const ytdStart = new Date(now.getFullYear(), 0, 1);

    const [allBankAccounts, allTx, allFunds] = await Promise.all([
      db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId)),
      db.select().from(transactions).where(eq(transactions.companyId, companyId)),
      db.select().from(funds).where(eq(funds.companyId, companyId)),
    ]);

    const activeTx = allTx.filter((t) => !t.isVoid);

    // ── Total cash (sum across all bank accounts) ────────────────────────────
    const txBalByBank = new Map<string, number>();
    for (const ba of allBankAccounts) txBalByBank.set(ba.id, 0);
    for (const t of activeTx) {
      if (!t.bankAccountId) continue;
      const cur = txBalByBank.get(t.bankAccountId) ?? 0;
      txBalByBank.set(t.bankAccountId, cur + (t.type === "CREDIT" ? t.amount : -t.amount));
    }
    const totalCash = [...txBalByBank.values()].reduce((s, b) => s + b, 0);

    // ── Per-bank balances ────────────────────────────────────────────────────
    const bankBalances = allBankAccounts.map((ba) => ({
      id: ba.id,
      name: ba.name,
      balance: Math.round((txBalByBank.get(ba.id) ?? 0) * 100) / 100,
    }));

    // ── YTD revenue & expenses ───────────────────────────────────────────────
    const ytdTx = activeTx.filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return d >= ytdStart;
    });
    const ytdRevenue  = ytdTx.filter((t) => t.type === "CREDIT").reduce((s, t) => s + t.amount, 0);
    const ytdExpenses = ytdTx.filter((t) => t.type === "DEBIT").reduce((s, t)  => s + t.amount, 0);

    // ── Fund balances (credits - debits per fund) ────────────────────────────
    const fundBalMap = new Map<string, number>();
    for (const t of activeTx) {
      if (!t.fundId) continue;
      const cur = fundBalMap.get(t.fundId) ?? 0;
      fundBalMap.set(t.fundId, cur + (t.type === "CREDIT" ? t.amount : -t.amount));
    }
    const fundBalances = allFunds.map((f) => ({
      id: f.id,
      name: f.name,
      fundType: f.fundType,
      balance: Math.round((fundBalMap.get(f.id) ?? 0) * 100) / 100,
    }));

    res.json({
      totalCash:    Math.round(totalCash    * 100) / 100,
      ytdRevenue:   Math.round(ytdRevenue   * 100) / 100,
      ytdExpenses:  Math.round(ytdExpenses  * 100) / 100,
      netPosition:  Math.round((ytdRevenue - ytdExpenses) * 100) / 100,
      txCount:      activeTx.length,
      bankBalances,
      fundBalances,
      asOf: now.toISOString(),
    });
  } catch (err) {
    console.error("Financial summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
