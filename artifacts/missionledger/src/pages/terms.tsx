import { ArrowLeft } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LAST_UPDATED = "March 20, 2026";
const CONTACT_EMAIL = "legal@missionledger.app";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => window.history.back()} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <img src={`${BASE}/images/logo.png`} alt="MissionLedger" className="h-7 object-contain" />
          <span className="text-sm font-medium text-slate-700">Terms of Service</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 prose prose-slate max-w-none">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-slate-500 mb-8">Last updated: {LAST_UPDATED}</p>

          <p>Please read these Terms of Service ("Terms") carefully before using MissionLedger. By accessing or using the service, you agree to be bound by these Terms.</p>

          <h2>1. Acceptance of Terms</h2>
          <p>By creating an account or using MissionLedger ("Service," "we," "us," or "our"), you ("User," "you," or "your Organization") agree to these Terms. If you do not agree, you may not use the Service.</p>

          <h2>2. Description of Service</h2>
          <p>MissionLedger is a cloud-based financial management platform designed for nonprofit organizations, churches, and membership associations. The Service includes fund accounting, bank register management, journal entries, financial reporting, and related tools.</p>

          <h2>3. Account Registration</h2>
          <p>You must provide accurate, current, and complete information when creating an account. You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account. Notify us immediately at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> of any unauthorized access.</p>

          <h2>4. Subscription and Payment</h2>
          <p>MissionLedger offers a free trial period followed by paid subscription plans. Subscription fees are billed in advance on a monthly or annual basis depending on your chosen plan. All payments are processed securely through Stripe. You may cancel your subscription at any time through the Billing section of your account.</p>

          <h2>5. Acceptable Use</h2>
          <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:</p>
          <ul>
            <li>Use the Service to store or transmit unlawful, fraudulent, or harmful financial data</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Reverse-engineer or attempt to extract the source code</li>
            <li>Use the Service to infringe any third-party rights</li>
          </ul>

          <h2>6. Data and Privacy</h2>
          <p>Your use of the Service is also governed by our <a href={`${BASE}/privacy`}>Privacy Policy</a>, which is incorporated into these Terms by reference. You retain ownership of all financial data you enter into the Service.</p>

          <h2>7. Data Security</h2>
          <p>We implement industry-standard security measures to protect your data. However, no method of electronic transmission or storage is 100% secure. You are responsible for maintaining appropriate security controls within your organization.</p>

          <h2>8. Limitation of Liability</h2>
          <p>To the fullest extent permitted by applicable law, MissionLedger shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, profits, or goodwill, arising from your use of the Service. MissionLedger does not provide tax, legal, or accounting advice.</p>

          <h2>9. Disclaimers</h2>
          <p>The Service is provided "as is" without warranty of any kind. We do not warrant that the Service will be uninterrupted, error-free, or free of viruses. MissionLedger is a financial management tool — it does not replace the advice of a qualified accountant or auditor.</p>

          <h2>10. Termination</h2>
          <p>We may suspend or terminate your account for violation of these Terms. You may cancel your account at any time. Upon termination, your right to use the Service will immediately cease. Data may be retained for up to 90 days following termination before deletion.</p>

          <h2>11. Changes to Terms</h2>
          <p>We may modify these Terms at any time. We will notify you of significant changes via email or within the application. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>

          <h2>12. Governing Law</h2>
          <p>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.</p>

          <h2>13. Contact</h2>
          <p>Questions about these Terms? Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        </div>
      </main>
    </div>
  );
}
