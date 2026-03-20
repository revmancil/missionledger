import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSearch } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 text-center">
      <img src={`${BASE}/images/logo.png`} alt="MissionLedger" className="h-12 object-contain mb-8 opacity-80" />

      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 border border-slate-200 mb-6">
        <FileSearch className="h-9 w-9 text-slate-400" />
      </div>

      <p className="text-5xl font-bold text-slate-200 mb-2 tracking-tight">404</p>
      <h1 className="text-2xl font-semibold text-slate-800 mb-3">Page not found</h1>
      <p className="text-slate-500 max-w-sm mb-8 leading-relaxed">
        The page you're looking for doesn't exist or may have been moved. Let's get you back on track.
      </p>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => window.history.back()}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Go Back
        </Button>
        <Button
          onClick={() => setLocation("/dashboard")}
          className="bg-[hsl(210,60%,25%)] hover:bg-[hsl(210,60%,20%)] text-white"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
