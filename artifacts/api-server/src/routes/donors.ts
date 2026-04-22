import { Router } from "express";
import { requireAuth, requireAdmin } from "../lib/auth";
import { pool } from "@workspace/db";

const router = Router();

/**
 * GET /api/donors
 * Returns aggregated donor giving summary for the org.
 * Sources: transactions table (donor_name field) + donations table (donor_name field).
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { year } = req.query;

    const yearFilter = year ? `AND EXTRACT(YEAR FROM date) = ${parseInt(year as string)}` : "";

    const { rows } = await pool.query(`
      SELECT
        donor_name AS "donorName",
        COUNT(*) AS "giftCount",
        SUM(amount) AS "totalGiven",
        MIN(date) AS "firstGift",
        MAX(date) AS "lastGift",
        'transaction' AS source
      FROM transactions
      WHERE company_id = $1
        AND donor_name IS NOT NULL
        AND donor_name <> ''
        AND is_void = false
        AND transaction_type = 'CREDIT'
        /* Deposits with batch donor rows use 'donations' only; skip tx row to avoid full amount on one donor */
        AND NOT EXISTS (
          SELECT 1 FROM donations d_batch
          WHERE d_batch.transaction_id = transactions.id
            AND d_batch.company_id = transactions.company_id
        )
        ${yearFilter}
      GROUP BY donor_name

      UNION ALL

      SELECT
        donor_name AS "donorName",
        COUNT(*) AS "giftCount",
        SUM(amount) AS "totalGiven",
        MIN(date) AS "firstGift",
        MAX(date) AS "lastGift",
        'donation' AS source
      FROM donations
      WHERE company_id = $1
        AND donor_name IS NOT NULL
        AND donor_name <> ''
        ${yearFilter.replace("date", "date")}
      GROUP BY donor_name
    `, [companyId]);

    // Merge rows by donor name (case-insensitive)
    const map = new Map<string, any>();
    for (const row of rows) {
      const key = (row.donorName as string).trim().toLowerCase();
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.giftCount = parseInt(existing.giftCount) + parseInt(row.giftCount);
        existing.totalGiven = parseFloat(existing.totalGiven) + parseFloat(row.totalGiven);
        if (new Date(row.firstGift) < new Date(existing.firstGift)) existing.firstGift = row.firstGift;
        if (new Date(row.lastGift) > new Date(existing.lastGift)) existing.lastGift = row.lastGift;
      } else {
        map.set(key, {
          donorName: (row.donorName as string).trim(),
          giftCount: parseInt(row.giftCount),
          totalGiven: parseFloat(row.totalGiven),
          firstGift: row.firstGift,
          lastGift: row.lastGift,
        });
      }
    }

    const result = Array.from(map.values()).sort((a, b) => b.totalGiven - a.totalGiven);
    res.json(result);
  } catch (error: any) {
    console.error("Get donors error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/donors/years
 * Returns distinct years that have donor activity.
 * Registered before /:name/history so "years" is not treated as a donor name.
 */
router.get("/years", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const { rows } = await pool.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM date)::int AS year
      FROM (
        SELECT date FROM transactions
        WHERE company_id = $1 AND donor_name IS NOT NULL AND donor_name <> '' AND is_void = false
        UNION ALL
        SELECT date FROM donations
        WHERE company_id = $1 AND donor_name IS NOT NULL AND donor_name <> ''
      ) combined
      ORDER BY year DESC
    `, [companyId]);
    res.json(rows.map(r => r.year));
  } catch (error: any) {
    console.error("Get donor years error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/donors/merge
 * Rewrites donor_name on transactions, donations, and pledges from each source to targetName (admin).
 */
router.post("/merge", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const body = req.body as { targetName?: string; sourceNames?: unknown };
    const targetName = typeof body.targetName === "string" ? body.targetName.trim() : "";
    const rawSources = Array.isArray(body.sourceNames) ? body.sourceNames : [];

    if (!targetName) {
      res.status(400).json({ error: "VALIDATION", message: "targetName is required" });
      return;
    }

    const norm = (s: string) => s.trim().toLowerCase();
    const targetNorm = norm(targetName);
    const sourceByNorm = new Map<string, string>();

    for (const item of rawSources) {
      if (typeof item !== "string") continue;
      const t = item.trim();
      if (!t) continue;
      const k = norm(t);
      if (k === targetNorm) continue;
      if (!sourceByNorm.has(k)) sourceByNorm.set(k, t);
    }

    if (sourceByNorm.size === 0) {
      res.status(400).json({
        error: "VALIDATION",
        message: "At least one source name (different from the target) is required",
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let transactionsUpdated = 0;
      let donationsUpdated = 0;
      let pledgesUpdated = 0;

      for (const [, srcRaw] of sourceByNorm) {
        const r1 = await client.query(
          `UPDATE transactions SET donor_name = $1, updated_at = NOW()
           WHERE company_id = $2 AND donor_name IS NOT NULL AND LOWER(TRIM(donor_name)) = LOWER(TRIM($3))`,
          [targetName, companyId, srcRaw],
        );
        transactionsUpdated += r1.rowCount ?? 0;

        const r2 = await client.query(
          `UPDATE donations SET donor_name = $1, updated_at = NOW()
           WHERE company_id = $2 AND LOWER(TRIM(donor_name)) = LOWER(TRIM($3))`,
          [targetName, companyId, srcRaw],
        );
        donationsUpdated += r2.rowCount ?? 0;

        const r3 = await client.query(
          `UPDATE pledges SET donor_name = $1, updated_at = NOW()
           WHERE company_id = $2 AND LOWER(TRIM(donor_name)) = LOWER(TRIM($3))`,
          [targetName, companyId, srcRaw],
        );
        pledgesUpdated += r3.rowCount ?? 0;
      }

      await client.query("COMMIT");
      res.json({ transactionsUpdated, donationsUpdated, pledgesUpdated });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("Merge donors error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/donors/:name/history
 * Returns all gifts for a specific donor (combined from transactions + donations).
 */
router.get("/:name/history", requireAuth, async (req, res) => {
  try {
    const { companyId } = (req as any).user;
    const donorName = decodeURIComponent(req.params.name);
    const { year } = req.query;

    const yearFilter = year ? `AND EXTRACT(YEAR FROM t.date) = ${parseInt(year as string)}` : "";
    const yearFilterD = year ? `AND EXTRACT(YEAR FROM d.date) = ${parseInt(year as string)}` : "";

    const { rows } = await pool.query(`
      SELECT
        t.id,
        t.date,
        t.payee AS description,
        t.amount,
        t.memo,
        t.check_number AS "checkNumber",
        t.fund_id AS "fundId",
        f.name AS "fundName",
        'bank_register' AS source
      FROM transactions t
      LEFT JOIN funds f ON f.id = t.fund_id
      WHERE t.company_id = $1
        AND LOWER(TRIM(t.donor_name)) = LOWER(TRIM($2))
        AND t.is_void = false
        AND t.transaction_type = 'CREDIT'
        AND NOT EXISTS (
          SELECT 1 FROM donations d_batch
          WHERE d_batch.transaction_id = t.id
            AND d_batch.company_id = t.company_id
        )
        ${yearFilter}

      UNION ALL

      SELECT
        d.id,
        d.date,
        d.type::text AS description,
        d.amount,
        d.notes AS memo,
        NULL AS "checkNumber",
        d.fund_id AS "fundId",
        f.name AS "fundName",
        'donation_record' AS source
      FROM donations d
      LEFT JOIN funds f ON f.id = d.fund_id
      WHERE d.company_id = $1
        AND LOWER(TRIM(d.donor_name)) = LOWER(TRIM($2))
        ${yearFilterD}

      ORDER BY date DESC
    `, [companyId, donorName]);

    res.json(rows.map(r => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
    })));
  } catch (error: any) {
    console.error("Get donor history error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
