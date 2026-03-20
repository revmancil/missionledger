import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 text-center">
        <img src={`${BASE}/images/logo.png`} alt="MissionLedger" className="h-12 object-contain mb-8 opacity-80" />

        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-red-50 border border-red-200 mb-6">
          <AlertTriangle className="h-9 w-9 text-red-400" />
        </div>

        <p className="text-5xl font-bold text-slate-200 mb-2 tracking-tight">Oops</p>
        <h1 className="text-2xl font-semibold text-slate-800 mb-3">Something went wrong</h1>
        <p className="text-slate-500 max-w-sm mb-8 leading-relaxed">
          An unexpected error occurred. Your data is safe — please refresh the page to continue.
        </p>

        <div className="flex gap-3">
          <Button
            onClick={() => this.setState({ hasError: false, error: null })}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
          <Button
            onClick={() => { window.location.href = `${BASE}/dashboard`; }}
            className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
          >
            Go to Dashboard
          </Button>
        </div>

        {import.meta.env.DEV && this.state.error && (
          <details className="mt-8 text-left max-w-xl w-full">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
              Technical details (dev only)
            </summary>
            <pre className="mt-2 p-3 bg-slate-900 text-red-300 text-xs rounded-lg overflow-auto whitespace-pre-wrap">
              {this.state.error.toString()}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
