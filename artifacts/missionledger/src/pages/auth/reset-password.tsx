import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !!token;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please request a new reset link.");
        return;
      }
      setDone(true);
      setTimeout(() => setLocation("/login"), 3000);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <div className="flex justify-center mb-6">
            <img src={`${BASE}/images/logo.png`} alt="MissionLedger" className="h-16 object-contain" />
          </div>

          {!token ? (
            <div className="text-center">
              <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Invalid reset link</h2>
              <p className="text-sm text-slate-500 mb-4">This link is missing a valid token.</p>
              <Link href="/forgot-password">
                <Button className="w-full bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white">
                  Request a new link
                </Button>
              </Link>
            </div>
          ) : done ? (
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-800 mb-2">Password updated!</h2>
              <p className="text-sm text-slate-500">
                Your password has been changed successfully. Redirecting you to sign in…
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-slate-800 mb-1">Set a new password</h2>
                <p className="text-sm text-slate-500">Must be at least 8 characters.</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-700 mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="password" className="text-sm">New password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="At least 8 characters"
                      className="pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirm" className="text-sm">Confirm new password</Label>
                  <Input
                    id="confirm"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                    className={`mt-1 ${mismatch ? "border-red-400 focus-visible:ring-red-300" : ""}`}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                  {mismatch && (
                    <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
                  disabled={loading || !canSubmit}
                >
                  {loading ? "Updating…" : "Set New Password"}
                </Button>
              </form>

              <div className="mt-5 text-center">
                <Link href="/login" className="text-sm text-[hsl(210,60%,35%)] hover:underline">
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
