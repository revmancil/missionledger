import { Router } from "express";
import { requireAuth } from "../lib/auth";
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

/**
 * GET /api/donors/years
 * Returns distinct years that have donor activity.
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

export default router;
