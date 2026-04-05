import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";

export default function GivePage() {
  const [zeffyUrl, setZeffyUrl] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("Our Organization");
  const [loading, setLoading] = useState(true);

  // Read org from URL query param: /give?org=NEXTCHURCH
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const org = params.get("org");
    if (!org) {
      setLoading(false);
      return;
    }

    fetch(apiUrl(`/api/zeffy/public-info?org=${encodeURIComponent(org)}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setZeffyUrl(data.zeffyFormUrl);
          setOrgName(data.orgName);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Give to {orgName}</h1>
          <p className="text-slate-500 text-lg">Your generosity makes a difference. Thank you for your support.</p>
        </div>

        {zeffyUrl ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <iframe
              src={zeffyUrl}
              title="Donation Form"
              width="100%"
              height="800px"
              frameBorder={0}
              allow="payment"
              className="w-full"
            />
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg mb-4">Online giving is not currently set up.</p>
            <p className="text-slate-400">Please contact the organization for giving options.</p>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by{" "}
          <a href="https://zeffy.com" target="_blank" rel="noopener noreferrer" className="underline">
            Zeffy
          </a>{" "}
          · Secure & Free for nonprofits
        </p>
      </div>
    </div>
  );
}
