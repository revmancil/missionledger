import React, { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { apiUrl } from "@/lib/api-base";

type Status = { enabled: boolean; encryptionConfigured: boolean };

async function mfaFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("ml_token");
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}

const inputClass =
  "w-full h-10 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent";
const buttonClass =
  "h-9 px-4 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold";

/** Platform-admin two-factor authentication: enroll an authenticator app, or turn it off. */
export function MfaCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function load() {
    try {
      setStatus(await mfaFetch("/api/auth/mfa/status"));
    } catch {
      setStatus(null);
    }
  }
  useEffect(() => { void load(); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (e: any) {
      setMessage({ kind: "error", text: e.message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  const startSetup = () =>
    run(async () => {
      setSetup(await mfaFetch("/api/auth/mfa/setup", { method: "POST" }));
      setCode("");
    });

  const confirmEnable = () =>
    run(async () => {
      await mfaFetch("/api/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setSetup(null);
      setCode("");
      setMessage({ kind: "ok", text: "Two-factor authentication is on. You will be asked for a code at every sign-in." });
      await load();
    });

  const confirmDisable = () =>
    run(async () => {
      await mfaFetch("/api/auth/mfa/disable", { method: "POST", body: JSON.stringify({ password, code }) });
      setDisabling(false);
      setPassword("");
      setCode("");
      setMessage({ kind: "ok", text: "Two-factor authentication has been turned off." });
      await load();
    });

  if (!status) return null;

  const groupedSecret = setup?.secret.match(/.{1,4}/g)?.join(" ") ?? "";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {status.enabled ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-amber-400" />}
          <h2 className="text-sm font-bold text-slate-200">Two-Factor Authentication</h2>
        </div>
        <span className={status.enabled ? "text-[11px] font-semibold text-emerald-400" : "text-[11px] font-semibold text-amber-400"}>
          {status.enabled ? "ENABLED" : "NOT ENABLED"}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4 text-sm text-slate-300">
        {message && (
          <div className={message.kind === "ok"
            ? "p-3 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs"
            : "flex items-start gap-2 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-400 text-xs"}>
            {message.kind === "error" && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {!status.enabled && !setup && (
          <>
            <p className="text-xs text-slate-400 leading-relaxed">
              This account can reach every organization's books. Add a second factor so a stolen password alone is not enough.
            </p>
            {!status.encryptionConfigured && (
              <p className="text-xs text-amber-400">
                Set <code>APP_ENCRYPTION_KEY</code> on the server first; the authenticator secret is stored encrypted.
              </p>
            )}
            <button className={buttonClass} disabled={busy || !status.encryptionConfigured} onClick={startSetup}>
              Set up authenticator app
            </button>
          </>
        )}

        {!status.enabled && setup && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              In your authenticator app (1Password, Authy, Google Authenticator…) add an account using
              “enter a setup key”, then type the 6-digit code it shows.
            </p>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Setup key</div>
              <code className="block p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 tracking-widest text-sm select-all">
                {groupedSecret}
              </code>
              <div className="text-[11px] text-slate-500 mt-1 break-all select-all">{setup.otpauthUri}</div>
            </div>
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <div className="flex gap-2">
              <button className={buttonClass} disabled={busy || code.length !== 6} onClick={confirmEnable}>
                Verify and turn on
              </button>
              <button className="h-9 px-4 rounded-lg border border-slate-700 text-slate-300 text-xs" disabled={busy} onClick={() => setSetup(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {status.enabled && !disabling && (
          <button
            className="h-9 px-4 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
            onClick={() => { setDisabling(true); setMessage(null); }}
          >
            Turn off two-factor authentication
          </button>
        )}

        {status.enabled && disabling && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Confirm with your password and a current code.</p>
            <input className={inputClass} type="password" autoComplete="current-password" placeholder="Password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <input className={inputClass} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <div className="flex gap-2">
              <button className={buttonClass} disabled={busy || !password || code.length !== 6} onClick={confirmDisable}>
                Turn off
              </button>
              <button className="h-9 px-4 rounded-lg border border-slate-700 text-slate-300 text-xs" disabled={busy}
                onClick={() => { setDisabling(false); setPassword(""); setCode(""); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
