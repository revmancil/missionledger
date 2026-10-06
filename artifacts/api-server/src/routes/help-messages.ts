import { Router } from "express";
import { db, helpMessages } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requirePlatformAdmin } from "../lib/auth";

const router = Router();

const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

// Each organization sees its own thread. The platform admin's support inbox asks for
// ?scope=all to see every organization's messages; for anyone else that parameter is ignored.
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const seeAll = req.query.scope === "all" && !!user?.isPlatformAdmin;
    const rows = seeAll
      ? await db.select().from(helpMessages).orderBy(desc(helpMessages.createdAt))
      : await db.select().from(helpMessages).where(eq(helpMessages.companyId, user.companyId)).orderBy(desc(helpMessages.createdAt));
    res.json(rows);
  } catch (e) {
    console.error("help-messages GET:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { subject, body } = req.body ?? {};
    if (typeof body !== "string" || !body.trim()) return void res.status(400).json({ error: "Message body is required" });
    if (body.length > MAX_BODY) return void res.status(400).json({ error: `Message is too long (max ${MAX_BODY} characters)` });
    if (subject !== undefined && subject !== null && typeof subject !== "string") {
      return void res.status(400).json({ error: "Subject must be text" });
    }
    const [msg] = await db.insert(helpMessages).values({
      companyId: user.companyId,
      userEmail: user.email,
      userName: user.name ?? user.email,
      subject: (subject?.trim() || "Help Request").slice(0, MAX_SUBJECT),
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

// Only platform support can reply. (This route used to check requireAdmin without requireAuth,
// so it rejected everyone; fixing it must not let any organization's admin answer another
// organization's thread, hence platform-admin only.)
router.post("/:id/reply", requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const admin = (req as any).user;
    const [parent] = await db.select().from(helpMessages).where(eq(helpMessages.id, req.params.id));
    if (!parent) return void res.status(404).json({ error: "Message not found" });
    const { body } = req.body ?? {};
    if (typeof body !== "string" || !body.trim()) return void res.status(400).json({ error: "Reply body is required" });
    if (body.length > MAX_BODY) return void res.status(400).json({ error: `Reply is too long (max ${MAX_BODY} characters)` });
    const [reply] = await db.insert(helpMessages).values({
      companyId: parent.companyId,
      userEmail: admin.email,
      userName: "MissionLedger Support",
      subject: `Re: ${parent.subject}`.slice(0, MAX_SUBJECT + 4),
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
