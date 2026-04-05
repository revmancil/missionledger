import { Router } from "express";
import { db, donations, companies } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// Zeffy sends webhook POST when a donation is made
router.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    console.log("Zeffy payload received:", JSON.stringify(payload));

    // Zeffy webhook payload structure
    const companyCode = req.query.org as string;
    if (!companyCode) return res.status(400).json({ error: "Missing org" });

    // Find the company by code
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.companyCode, companyCode));
    if (!company) return res.status(404).json({ error: "Organization not found" });
    if (!company.donationsEnabled) return res.status(403).json({ error: "Donations not enabled" });

    // Extract donation data from Zeffy payload
    // Zeffy sends: firstName, lastName, email, amount, currency, fundDesignation, createdAt
    const donorName = [payload.firstName, payload.lastName].filter(Boolean).join(" ") || payload.email || "Anonymous";
    const amount = parseFloat(payload.amount ?? payload.totalAmount ?? "0");
    const donorEmail = payload.email ?? null;
    const parsedDate = payload.createdAt ? new Date(payload.createdAt) : null;
    const date = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();
    const notes = payload.fundDesignation || payload.message || null;

    if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    await db.insert(donations).values({
      companyId: company.id,
      donorName,
      donorEmail,
      amount,
      date,
      type: "ONLINE",
      notes,
    });

    res.json({ received: true });
  } catch (error) {
    console.error("Zeffy webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Public endpoint — no auth required
router.get("/public-info", async (req, res) => {
  try {
    const org = req.query.org as string;
    if (!org) return res.status(400).json({ error: "Missing org" });
    const [company] = await db.select().from(companies).where(eq(companies.companyCode, org));
    if (!company || !company.donationsEnabled) return res.status(404).json({ error: "Not found" });
    res.json({ orgName: company.name, zeffyFormUrl: company.zeffyFormUrl });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
