import React, { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Lock, AlertTriangle, Eye, EyeOff, Terminal } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminLoginPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
     const data = await res.json();
if (!res.ok) {
  setError(data.message ?? data.error ?? "Authentication failed.");
  return;
}
if (data.token) localStorage.setItem("ml_token", data.token);
setLocation("/admin");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Decorative grid overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(220,38,38,0.08)_0%,transparent_60%)] pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Logo / badge */}
        <div className="flex items-center justify-center mb-8 gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-700 flex items-center justify-center shadow-lg shadow-red-900/50">
            <Terminal className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-xl font-bold text-white tracking-tight">MissionLedger</div>
            <div className="text-[11px] font-mono text-red-400 uppercase tracking-widest">Platform Admin Portal</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-red-500 shrink-0" />
            <h2 className="text-lg font-bold text-white">Administrator Authentication</h2>
          </div>

          <div className="mb-6 p-3 rounded-lg border border-amber-800/60 bg-amber-950/40">
            <p className="text-[11px] text-amber-400 font-mono leading-relaxed">
              RESTRICTED ACCESS — This portal is exclusively for MissionLedger platform administrators.
              Unauthorized access attempts are logged and monitored.
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-950/60 border border-red-800 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Admin Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@missionledger.com"
                required
                autoComplete="username"
                className="w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full h-10 px-3 pr-10 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full h-10 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Authenticating…</>
              ) : (
                <><Lock className="h-4 w-4" /> Authenticate</>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          MissionLedger Platform Admin · Restricted Access
        </p>
      </div>
    </div>
  );
}
