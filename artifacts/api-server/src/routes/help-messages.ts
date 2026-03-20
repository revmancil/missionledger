import { Router } from "express";
import { db, helpMessages } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const companyId = (req as any).user?.companyId;
    const isAdmin = (req as any).user?.isMasterAdmin;
    const rows = isAdmin
      ? await db.select().from(helpMessages).orderBy(desc(helpMessages.createdAt))
      : await db.select().from(helpMessages).where(eq(helpMessages.companyId, companyId)).orderBy(desc(helpMessages.createdAt));
    res.json(rows);
  } catch (e) {
    console.error("help-messages GET:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { subject, body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: "Message body is required" });
    const [msg] = await db.insert(helpMessages).values({
      companyId: user.companyId,
      userEmail: user.email,
      userName: user.name ?? user.email,
      subject: subject?.trim() || "Help Request",
      body: body.trim(),
      direction: "USER_TO_ADMIN",
      isRead: false,
    }).returning();
    res.status(201).json(msg);
  } catch (e) {
    console.error("help-messages POST:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reply", requireAdmin, async (req, res) => {
  try {
    const admin = (req as any).user;
    const parent = await db.select().from(helpMessages).where(eq(helpMessages.id, req.params.id));
    if (!parent.length) return res.status(404).json({ error: "Message not found" });
    const { body } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: "Reply body is required" });
    const [reply] = await db.insert(helpMessages).values({
      companyId: parent[0].companyId,
      userEmail: admin.email,
      userName: "MissionLedger Support",
      subject: `Re: ${parent[0].subject}`,
      body: body.trim(),
      direction: "ADMIN_TO_USER",
      parentId: req.params.id,
      isRead: false,
    }).returning();
    res.status(201).json(reply);
  } catch (e) {
    console.error("help-messages reply:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const companyId = (req as any).user?.companyId;
    await db.update(helpMessages)
      .set({ isRead: true })
      .where(and(eq(helpMessages.id, req.params.id), eq(helpMessages.companyId, companyId)));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
