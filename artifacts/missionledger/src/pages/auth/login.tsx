import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Lock, UserCircle2, Terminal, Search } from "lucide-react";
import { authJsonFetch, readJsonSafe } from "@/lib/auth-fetch";

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  const [formData, setFormData] = useState({ companyCode: "", identifier: "", password: "" });
  const [showFindUserId, setShowFindUserId] = useState(false);
  const [finder, setFinder] = useState({ companyCode: "", email: "" });
  const [finding, setFinding] = useState(false);
  const [foundUserIds, setFoundUserIds] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const identifier = formData.identifier.trim();
      const isEmail = identifier.includes("@");
      await login({
        data: {
          companyCode: formData.companyCode,
          password: formData.password,
          ...(isEmail ? { email: identifier } : { userId: identifier }),
        } as any
      });
      toast.success("Logged in successfully");
    } catch (err: any) {
      toast.error(err.message || "Invalid credentials");
    }
  };

  const handleFindUserId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finder.companyCode.trim() || !finder.email.trim()) return;
    setFinding(true);
    setFoundUserIds([]);
    try {
      const res = await authJsonFetch("api/auth/find-user-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCode: finder.companyCode.trim(),
          email: finder.email.trim(),
        }),
      });
      const body = await readJsonSafe<{ userIds?: string[]; error?: string }>(res);
      if (!res.ok) throw new Error(body?.error || "Failed to find user ID");
      const ids = Array.isArray(body?.userIds) ? body!.userIds! : [];
      setFoundUserIds(ids);
      if (ids.length === 0) toast.error("No active user IDs found for that Company Code and Email.");
    } catch (err: any) {
      toast.error(err.message || "Could not find user ID");
    } finally {
      setFinding(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40">
         <img src={`${import.meta.env.BASE_URL}images/hero-bg.png`} className="w-full h-full object-cover" alt="" />
      </div>
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl shadow-black/5 border-border/50 bg-card/95 backdrop-blur-xl animate-scale-in">
        <CardHeader className="space-y-2 text-center pb-6">
          <div className="flex justify-center mb-1">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="MissionLedger"
              className="h-20 w-auto object-contain"
            />
          </div>
          <CardTitle className="text-2xl font-display font-bold">Welcome back</CardTitle>
          <CardDescription>Enter your details to access your ledger</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Company Code</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="e.g. HOPE-123" 
                  className="pl-9 h-11"
                  required
                  value={formData.companyCode}
                  onChange={(e) => setFormData(p => ({...p, companyCode: e.target.value}))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">User ID or Email</label>
              <div className="relative">
                <UserCircle2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="e.g. john.admin or admin@example.org" 
                  className="pl-9 h-11"
                  required
                  value={formData.identifier}
                  onChange={(e) => setFormData(p => ({...p, identifier: e.target.value}))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  className="pl-9 h-11"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData(p => ({...p, password: e.target.value}))}
                />
              </div>
            </div>
            <div className="flex justify-end -mt-1">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowFindUserId((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  Find my User ID
                </button>
                <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>
            {showFindUserId && (
              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
                <p className="text-xs text-muted-foreground">Enter company code and email to recover your User ID.</p>
                <form onSubmit={handleFindUserId} className="space-y-2">
                  <Input
                    placeholder="Company Code"
                    value={finder.companyCode}
                    onChange={(e) => setFinder((p) => ({ ...p, companyCode: e.target.value }))}
                    className="h-9"
                    required
                  />
                  <Input
                    type="email"
                    placeholder="Email"
                    value={finder.email}
                    onChange={(e) => setFinder((p) => ({ ...p, email: e.target.value }))}
                    className="h-9"
                    required
                  />
                  <Button type="submit" variant="outline" className="h-9 w-full" disabled={finding}>
                    <Search className="h-4 w-4 mr-2" />
                    {finding ? "Finding..." : "Find User ID"}
                  </Button>
                </form>
                {foundUserIds.length > 0 && (
                  <div className="text-xs rounded border border-emerald-200 bg-emerald-50 p-2">
                    <p className="font-medium text-emerald-800 mb-1">User ID found:</p>
                    {foundUserIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className="block text-emerald-800 underline"
                        onClick={() => {
                          setFormData((p) => ({ ...p, companyCode: finder.companyCode.trim(), identifier: id }));
                          setShowFindUserId(false);
                        }}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button type="submit" className="w-full h-11 text-base shadow-md" disabled={isLoggingIn}>
              {isLoggingIn ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account? <Link href="/register" className="text-primary font-medium hover:underline">Register your organization</Link>
          </div>
          <div className="mt-4 pt-4 border-t border-border/50">
            <a
              href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/admin/login`}
              className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Terminal className="h-3.5 w-3.5" />
              Admin Control Center
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
