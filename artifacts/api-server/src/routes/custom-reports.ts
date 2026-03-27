import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router = Router();

// ── Templates CRUD ────────────────────────────────────────────────────────────

router.get("/templates", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const result = await pool.query(
      `SELECT id, name, description, config, created_at, updated_at
       FROM custom_report_templates
       WHERE company_id = $1
       ORDER BY updated_at DESC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/templates", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, config } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO custom_report_templates (id, company_id, name, description, config)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, companyId, name.trim(), description?.trim() || null, JSON.stringify(config)]
    );
    res.json({ id, name, description, config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/templates/:id", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { name, description, config } = req.body;
    await pool.query(
      `UPDATE custom_report_templates
       SET name = $1, description = $2, config = $3, updated_at = NOW()
       WHERE id = $4 AND company_id = $5`,
      [name.trim(), description?.trim() || null, JSON.stringify(config), req.params.id, companyId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/templates/:id", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    await pool.query(
      `DELETE FROM custom_report_templates WHERE id = $1 AND company_id = $2`,
      [req.params.id, companyId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run Report ────────────────────────────────────────────────────────────────

router.post("/run", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const {
      reportType = "account_activity",
      accountIds = [],
      accountTypes = [],
      startDate,
      endDate,
      asOfDate,
      groupBy = "none",
      fundId = "all",
    } = req.body;

    const VALID_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
    const filteredTypes: string[] = (accountTypes as string[]).filter(t => VALID_TYPES.includes(t));
    const filterByTypes = filteredTypes.length > 0;
    const filterByIds = Array.isArray(accountIds) && accountIds.length > 0 && !accountIds.includes("all");
    const filterByFund = fundId && fundId !== "all";

    const start = new Date(startDate || `${new Date().getFullYear()}-01-01`);
    const end = new Date(endDate || `${new Date().getFullYear()}-12-31`);
    end.setHours(23, 59, 59, 999);
    const asOf = new Date(asOfDate || new Date());
    asOf.setHours(23, 59, 59, 999);

    // ── 1. Account Activity ───────────────────────────────────────────────────
    if (reportType === "account_activity") {
      const effectiveTypes = filterByTypes ? filteredTypes : VALID_TYPES;
      const periodExpr = groupBy === "month"
        ? "DATE_TRUNC('month', g.date)::date AS period,"
        : groupBy === "quarter"
        ? "DATE_TRUNC('quarter', g.date)::date AS period,"
        : "";
      const periodGroup = (groupBy === "month" || groupBy === "quarter") ? ", period" : "";

      const params: any[] = [companyId, start, end, effectiveTypes];
      let paramIdx = 5;

      let accountIdFilter = "";
      if (filterByIds) {
        accountIdFilter = `AND c.id = ANY($${paramIdx})`;
        params.push(accountIds);
        paramIdx++;
      }
      let fundFilter = "";
      if (filterByFund) {
        fundFilter = `AND g.fund_id = $${paramIdx}`;
        params.push(fundId);
        paramIdx++;
      }

      const q = `
        SELECT
          ${periodExpr}
          c.id        AS account_id,
          c.code      AS account_code,
          c.name      AS account_name,
          c.coa_type  AS account_type,
          c.sort_order,
          ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
          ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
        FROM chart_of_accounts c
        LEFT JOIN gl_entries g
          ON g.account_id = c.id
          AND g.company_id = $1
          AND g.is_void = false
          AND g.date >= $2
          AND g.date <= $3
          ${fundFilter}
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = g.journal_entry_id AND je.status != 'VOID'
                      OR g.journal_entry_id IS NULL)
        WHERE c.company_id = $1
          AND c.is_active = true
          AND c.coa_type = ANY($4)
          ${accountIdFilter}
        GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order ${periodGroup}
        HAVING ROUND(COALESCE(SUM(g.amount), 0)::numeric, 2) != 0
        ORDER BY ${groupBy !== "none" ? "period," : ""} c.sort_order, c.code
      `;

      const result = await pool.query(q, params);
      const rows = result.rows.map((r: any) => {
        const debit  = parseFloat(r.total_debit)  || 0;
        const credit = parseFloat(r.total_credit) || 0;
        const isDebitNormal = ["ASSET", "EXPENSE"].includes(r.account_type);
        const net = isDebitNormal ? debit - credit : credit - debit;
        return {
          period:      r.period ? new Date(r.period).toISOString().slice(0, 10) : undefined,
          accountId:   r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          accountType: r.account_type,
          totalDebit:  debit,
          totalCredit: credit,
          net,
        };
      });

      const totDebit  = rows.reduce((s: number, r: any) => s + r.totalDebit,  0);
      const totCredit = rows.reduce((s: number, r: any) => s + r.totalCredit, 0);
      return res.json({
        reportType, groupBy,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        rows,
        summary: { totalDebit: totDebit, totalCredit: totCredit, net: totCredit - totDebit },
      });
    }

    // ── 2. Income vs Expense ──────────────────────────────────────────────────
    if (reportType === "income_expense") {
      const effectiveTypes = filteredTypes.filter(t => t === "INCOME" || t === "EXPENSE");
      const types = effectiveTypes.length > 0 ? effectiveTypes : ["INCOME", "EXPENSE"];
      const periodExpr = groupBy === "month"
        ? "DATE_TRUNC('month', g.date)::date AS period,"
        : groupBy === "quarter"
        ? "DATE_TRUNC('quarter', g.date)::date AS period,"
        : "";
      const periodGroup = (groupBy === "month" || groupBy === "quarter") ? ", period" : "";

      const params: any[] = [companyId, start, end, types];
      let paramIdx = 5;
      let accountIdFilter = "";
      if (filterByIds) {
        accountIdFilter = `AND c.id = ANY($${paramIdx})`;
        params.push(accountIds);
        paramIdx++;
      }
      let fundFilter = "";
      if (filterByFund) {
        fundFilter = `AND g.fund_id = $${paramIdx}`;
        params.push(fundId);
        paramIdx++;
      }

      const q = `
        SELECT
          ${periodExpr}
          c.id        AS account_id,
          c.code      AS account_code,
          c.name      AS account_name,
          c.coa_type  AS account_type,
          c.sort_order,
          ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
          ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
        FROM chart_of_accounts c
        LEFT JOIN gl_entries g
          ON g.account_id = c.id
          AND g.company_id = $1
          AND g.is_void = false
          AND g.date >= $2
          AND g.date <= $3
          ${fundFilter}
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = g.journal_entry_id AND je.status != 'VOID'
                      OR g.journal_entry_id IS NULL)
        WHERE c.company_id = $1
          AND c.is_active = true
          AND c.coa_type = ANY($4)
          ${accountIdFilter}
        GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order ${periodGroup}
        ORDER BY ${groupBy !== "none" ? "period," : ""} c.sort_order, c.code
      `;

      const result = await pool.query(q, params);
      const rows = result.rows.map((r: any) => {
        const debit  = parseFloat(r.total_debit)  || 0;
        const credit = parseFloat(r.total_credit) || 0;
        const amount = r.account_type === "INCOME" ? credit - debit : debit - credit;
        return {
          period:      r.period ? new Date(r.period).toISOString().slice(0, 10) : undefined,
          accountId:   r.account_id,
          accountCode: r.account_code,
          accountName: r.account_name,
          accountType: r.account_type,
          amount,
        };
      });

      if (groupBy !== "none") {
        return res.json({ reportType, groupBy, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), rows });
      }

      const revenue  = rows.filter((r: any) => r.accountType === "INCOME");
      const expenses = rows.filter((r: any) => r.accountType === "EXPENSE");
      const totalRevenue  = revenue.reduce((s: number, r: any) => s + r.amount, 0);
      const totalExpenses = expenses.reduce((s: number, r: any) => s + r.amount, 0);
      return res.json({
        reportType, groupBy,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        revenue, expenses, totalRevenue, totalExpenses,
        netSurplus: totalRevenue - totalExpenses,
      });
    }

    // ── 3. Fund Breakdown ─────────────────────────────────────────────────────
    if (reportType === "fund_breakdown") {
      const effectiveTypes = filterByTypes ? filteredTypes : VALID_TYPES;
      const params: any[] = [companyId, start, end, effectiveTypes];
      let paramIdx = 5;
      let accountIdFilter = "";
      if (filterByIds) {
        accountIdFilter = `AND c.id = ANY($${paramIdx})`;
        params.push(accountIds);
        paramIdx++;
      }
      let fundCond = "";
      if (filterByFund) {
        fundCond = `AND g.fund_id = $${paramIdx}`;
        params.push(fundId);
        paramIdx++;
      }

      const q = `
        SELECT
          COALESCE(g.fund_id, 'unallocated')   AS fund_id,
          COALESCE(g.fund_name, 'Unallocated')  AS fund_name,
          c.id        AS account_id,
          c.code      AS account_code,
          c.name      AS account_name,
          c.coa_type  AS account_type,
          c.sort_order,
          ROUND(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END)::numeric, 2) AS total_debit,
          ROUND(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END)::numeric, 2) AS total_credit
        FROM gl_entries g
        JOIN chart_of_accounts c ON c.id = g.account_id
        WHERE g.company_id = $1
          AND g.is_void = false
          AND g.date >= $2
          AND g.date <= $3
          AND c.coa_type = ANY($4)
          ${accountIdFilter}
          ${fundCond}
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = g.journal_entry_id AND je.status != 'VOID'
                      OR g.journal_entry_id IS NULL)
        GROUP BY g.fund_id, g.fund_name, c.id, c.code, c.name, c.coa_type, c.sort_order
        ORDER BY fund_name, c.sort_order, c.code
      `;

      const result = await pool.query(q, params);
      const byFund = new Map<string, any>();
      for (const r of result.rows as any[]) {
        if (!byFund.has(r.fund_id)) {
          byFund.set(r.fund_id, { fundId: r.fund_id, fundName: r.fund_name, rows: [], totalDebit: 0, totalCredit: 0 });
        }
        const fund = byFund.get(r.fund_id)!;
        const debit  = parseFloat(r.total_debit)  || 0;
        const credit = parseFloat(r.total_credit) || 0;
        fund.rows.push({ accountId: r.account_id, accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type, totalDebit: debit, totalCredit: credit });
        fund.totalDebit  += debit;
        fund.totalCredit += credit;
      }
      return res.json({
        reportType,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        funds: Array.from(byFund.values()),
      });
    }

    // ── 4. Balance Summary ────────────────────────────────────────────────────
    if (reportType === "balance_summary") {
      const effectiveTypes = ["ASSET", "LIABILITY", "EQUITY"];
      const params: any[] = [companyId, asOf, effectiveTypes];
      let paramIdx = 4;
      let accountIdFilter = "";
      if (filterByIds) {
        accountIdFilter = `AND c.id = ANY($${paramIdx})`;
        params.push(accountIds);
        paramIdx++;
      }

      const q = `
        SELECT
          c.id        AS account_id,
          c.code      AS account_code,
          c.name      AS account_name,
          c.coa_type  AS account_type,
          c.sort_order,
          ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT'  THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_debit,
          ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'CREDIT' THEN g.amount ELSE 0 END), 0)::numeric, 2) AS total_credit
        FROM chart_of_accounts c
        LEFT JOIN gl_entries g
          ON g.account_id = c.id
          AND g.company_id = $1
          AND g.is_void = false
          AND g.date <= $2
          AND EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = g.journal_entry_id AND je.status != 'VOID'
                      OR g.journal_entry_id IS NULL)
        WHERE c.company_id = $1
          AND c.is_active = true
          AND c.coa_type = ANY($3)
          ${accountIdFilter}
        GROUP BY c.id, c.code, c.name, c.coa_type, c.sort_order
        HAVING ROUND(COALESCE(SUM(CASE WHEN g.entry_type = 'DEBIT' THEN g.amount ELSE -g.amount END), 0)::numeric, 2) != 0
        ORDER BY c.sort_order, c.code
      `;

      const result = await pool.query(q, params);
      const rows = (result.rows as any[]).map(r => {
        const debit  = parseFloat(r.total_debit)  || 0;
        const credit = parseFloat(r.total_credit) || 0;
        const balance = r.account_type === "ASSET" ? debit - credit : credit - debit;
        return { accountId: r.account_id, accountCode: r.account_code, accountName: r.account_name, accountType: r.account_type, balance };
      });

      const assets      = rows.filter(r => r.accountType === "ASSET");
      const liabilities = rows.filter(r => r.accountType === "LIABILITY");
      const equity      = rows.filter(r => r.accountType === "EQUITY");
      const totalAssets      = assets.reduce((s, r) => s + r.balance, 0);
      const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
      const totalEquity      = equity.reduce((s, r) => s + r.balance, 0);

      return res.json({
        reportType,
        asOfDate: asOf.toISOString().slice(0, 10),
        assets, liabilities, equity,
        totalAssets, totalLiabilities, totalEquity,
        netAssets: totalAssets - totalLiabilities,
      });
    }

    res.status(400).json({ error: "Unknown reportType" });
  } catch (err: any) {
    console.error("Custom report run error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
