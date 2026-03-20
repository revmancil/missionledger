import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  X, HelpCircle, Search, ChevronRight, ChevronDown,
  MessageSquare, BookOpen, Lightbulb, CheckCircle2,
  Send, ArrowLeft, Sparkles, ExternalLink, Bell,
} from "lucide-react";
import {
  onboardingSteps,
  knowledgeBase,
  faqItems,
  type Article,
  type FaqItem,
  type OnboardingStep,
} from "@/data/helpContent";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

type Tab = "start" | "kb" | "faq" | "messages";

export function HelpSidebar() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("start");
  const [query, setQuery] = useState("");
  const [expandedKb, setExpandedKb] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const [replies, setReplies] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingReplies, setLoadingReplies] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoadingReplies(true);
    apiFetch("/api/help-messages")
      .then((msgs: any[]) => {
        setReplies(msgs);
        setUnreadCount(msgs.filter((m) => m.direction === "ADMIN_TO_USER" && !m.isRead).length);
      })
      .catch(() => {})
      .finally(() => setLoadingReplies(false));
  }, [open, sent]);

  const q = query.toLowerCase().trim();

  const filteredKb = useMemo(() =>
    q ? knowledgeBase.filter((a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.tags.some((t) => t.includes(q))
    ) : knowledgeBase,
    [q]
  );

  const filteredFaq = useMemo(() =>
    q ? faqItems.filter((f) =>
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q) ||
      f.tags.some((t) => t.includes(q))
    ) : faqItems,
    [q]
  );

  const filteredSteps = useMemo(() =>
    q ? onboardingSteps.filter((s) =>
      s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    ) : onboardingSteps,
    [q]
  );

  const hasResults = filteredKb.length || filteredFaq.length || filteredSteps.length;

  async function handleSend() {
    if (!msgBody.trim()) return;
    setSending(true);
    setSendError("");
    try {
      await apiFetch("/api/help-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: msgSubject || "Help Request", body: msgBody }),
      });
      setSent(true);
      setMsgSubject("");
      setMsgBody("");
    } catch {
      setSendError("Failed to send — please try again.");
    } finally {
      setSending(false);
    }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "start",    label: "Get Started", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: "kb",       label: "How-To",      icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: "faq",      label: "FAQ",         icon: <Lightbulb className="w-3.5 h-3.5" /> },
    { id: "messages", label: "Messages",    icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      {/* ── Floating button ──────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg",
          "bg-primary text-primary-foreground font-semibold text-sm",
          "hover:bg-primary/90 transition-all duration-200 hover:scale-105",
          open && "opacity-0 pointer-events-none"
        )}
        aria-label="Open Help"
      >
        <HelpCircle className="w-4 h-4" />
        Help
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-[10px] font-bold text-white flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {/* ── Backdrop ─────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Panel ────────────────────────────────────────── */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] flex flex-col",
          "bg-card border-l border-border shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            <span className="font-display font-semibold text-foreground">Help Center</span>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-muted transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              placeholder="Search help articles…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        {!query && (
          <div className="flex border-b border-border overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap flex-1 justify-center",
                  "transition-colors border-b-2",
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon}
                {t.label}
                {t.id === "messages" && unreadCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Search Results ────────────────────────────── */}
          {query && (
            <div className="p-4 space-y-5">
              {!hasResults && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No results for "{query}"
                  <div className="mt-3">
                    <button onClick={() => { setQuery(""); setTab("messages"); }} className="text-primary text-xs underline">
                      Ask the admin instead
                    </button>
                  </div>
                </div>
              )}
              {filteredSteps.length > 0 && (
                <Section title="Getting Started">
                  {filteredSteps.map((s) => <StepCard key={s.id} step={s} navigate={navigate} />)}
                </Section>
              )}
              {filteredKb.length > 0 && (
                <Section title="How-To Articles">
                  {filteredKb.map((a) => (
                    <ArticleCard key={a.id} article={a} expanded={expandedKb === a.id} onToggle={() => setExpandedKb(expandedKb === a.id ? null : a.id)} />
                  ))}
                </Section>
              )}
              {filteredFaq.length > 0 && (
                <Section title="FAQ">
                  {filteredFaq.map((f) => (
                    <FaqCard key={f.id} item={f} expanded={expandedFaq === f.id} onToggle={() => setExpandedFaq(expandedFaq === f.id ? null : f.id)} />
                  ))}
                </Section>
              )}
            </div>
          )}

          {/* ── Get Started tab ───────────────────────────── */}
          {!query && tab === "start" && (
            <div className="p-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                New to MissionLedger? Complete these three steps to get your books running in under 60 seconds.
              </p>
              {onboardingSteps.map((step, idx) => (
                <StepCard key={step.id} step={step} stepNumber={idx + 1} navigate={navigate} />
              ))}
              <div className="mt-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary leading-relaxed">
                <strong>Pro tip:</strong> Run your Opening Balance before recording transactions — it ensures your starting account balances are accurate.
              </div>
            </div>
          )}

          {/* ── How-To tab ────────────────────────────────── */}
          {!query && tab === "kb" && (
            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Step-by-step guides for common nonprofit accounting tasks.
              </p>
              {knowledgeBase.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  expanded={expandedKb === a.id}
                  onToggle={() => setExpandedKb(expandedKb === a.id ? null : a.id)}
                />
              ))}
            </div>
          )}

          {/* ── FAQ tab ───────────────────────────────────── */}
          {!query && tab === "faq" && (
            <div className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Answers to the most common questions from nonprofit bookkeepers.
              </p>
              {faqItems.map((f) => (
                <FaqCard
                  key={f.id}
                  item={f}
                  expanded={expandedFaq === f.id}
                  onToggle={() => setExpandedFaq(expandedFaq === f.id ? null : f.id)}
                />
              ))}
            </div>
          )}

          {/* ── Messages tab ──────────────────────────────── */}
          {!query && tab === "messages" && (
            <div className="p-4 space-y-4">
              {/* Admin replies */}
              {replies.filter((m) => m.direction === "ADMIN_TO_USER").length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Replies from Admin</p>
                  {replies.filter((m) => m.direction === "ADMIN_TO_USER").map((r) => (
                    <div key={r.id} className={cn("p-3 rounded-lg border text-sm", r.isRead ? "bg-muted/30 border-border" : "bg-primary/10 border-primary/30")}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-foreground">{r.subject}</span>
                        {!r.isRead && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">New</span>}
                      </div>
                      <p className="text-muted-foreground leading-relaxed">{r.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Sent messages */}
              {replies.filter((m) => m.direction === "USER_TO_ADMIN").length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Messages</p>
                  {replies.filter((m) => m.direction === "USER_TO_ADMIN").map((r) => (
                    <div key={r.id} className="p-3 rounded-lg bg-muted/40 border border-border text-sm">
                      <div className="font-semibold text-foreground mb-1">{r.subject}</div>
                      <p className="text-muted-foreground">{r.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Compose */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm text-foreground">Message Admin</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Can't find an answer? Send a message directly to the MissionLedger admin team.
                </p>
                {sent && (
                  <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Message sent! Expect a reply within 1 business day.
                  </div>
                )}
                {!sent && (
                  <>
                    <input
                      value={msgSubject}
                      onChange={(e) => setMsgSubject(e.target.value)}
                      placeholder="Subject (optional)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <textarea
                      value={msgBody}
                      onChange={(e) => setMsgBody(e.target.value)}
                      placeholder="Describe your question or issue…"
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    {sendError && <p className="text-xs text-destructive">{sendError}</p>}
                    <button
                      onClick={handleSend}
                      disabled={sending || !msgBody.trim()}
                      className="flex items-center gap-2 w-full justify-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sending ? "Sending…" : "Send Message"}
                    </button>
                  </>
                )}
                {sent && (
                  <button
                    onClick={() => setSent(false)}
                    className="text-xs text-primary underline text-center w-full"
                  >
                    Send another message
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted/20 text-center">
          <span className="text-[11px] text-muted-foreground">
            MissionLedger Help Center — built for nonprofits
          </span>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function StepCard({ step, stepNumber, navigate }: { step: OnboardingStep; stepNumber?: number; navigate: (path: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">{step.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {stepNumber && (
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {stepNumber}
              </span>
            )}
            <p className="font-semibold text-sm text-foreground">{step.title}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
          {step.link && (
            <button
              onClick={() => navigate(step.link!)}
              className="mt-2 flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
            >
              {step.linkLabel}
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ArticleCard({ article, expanded, onToggle }: { article: Article; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
      >
        <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{article.category}</span>
          <p className="font-semibold text-sm text-foreground">{article.title}</p>
          {!expanded && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{article.summary}</p>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{article.summary}</p>
          <div className="space-y-2">
            {article.steps.map((step, i) => (
              <div key={i} className="flex gap-2.5 text-xs">
                <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-[10px]">{i + 1}</span>
                <p className="text-foreground leading-relaxed pt-0.5">{step}</p>
              </div>
            ))}
          </div>
          {article.tips && article.tips.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-3">
              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1.5">Tips</p>
              {article.tips.map((tip, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{tip}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FaqCard({ item, expanded, onToggle }: { item: FaqItem; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
      >
        <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="flex-1 font-semibold text-sm text-foreground">{item.question}</p>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}
