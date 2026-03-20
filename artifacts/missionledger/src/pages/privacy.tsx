import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LAST_UPDATED = "March 20, 2026";
const CONTACT_EMAIL = "privacy@missionledger.app";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => window.history.back()} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <img src={`${BASE}/images/logo.png`} alt="MissionLedger" className="h-7 object-contain" />
          <span className="text-sm font-medium text-slate-700">Privacy Policy</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 prose prose-slate max-w-none">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-slate-500 mb-8">Last updated: {LAST_UPDATED}</p>

          <p>This Privacy Policy describes how MissionLedger ("we," "us," or "our") collects, uses, and protects information when you use our financial management platform.</p>

          <h2>1. Information We Collect</h2>
          <h3>Account Information</h3>
          <p>When you register, we collect your name, email address, organization name, EIN (Employer Identification Number), and organization type. This information is used to create and manage your account.</p>

          <h3>Financial Data</h3>
          <p>You enter financial data into MissionLedger, including transactions, journal entries, bank account information, fund allocations, and reports. This data belongs to you and your organization. We do not sell, rent, or share your financial data with third parties.</p>

          <h3>Bank Connection Data</h3>
          <p>If you connect a bank account via Plaid, we receive read-only transaction data from your bank. We do not store your bank login credentials. Plaid's use of your data is governed by <a href="https://plaid.com/legal/privacy-statement/" target="_blank" rel="noopener noreferrer">Plaid's Privacy Policy</a>.</p>

          <h3>Usage Data</h3>
          <p>We automatically collect information about how you use the Service, including log data, IP addresses, browser type, pages visited, and actions taken. This helps us improve the Service and diagnose issues.</p>

          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>To provide, maintain, and improve the Service</li>
            <li>To process payments and manage your subscription via Stripe</li>
            <li>To send transactional emails (account confirmations, password resets, subscription updates)</li>
            <li>To provide customer support</li>
            <li>To comply with legal obligations</li>
            <li>To detect and prevent fraud or abuse</li>
          </ul>

          <h2>3. Data Sharing</h2>
          <p>We do not sell, trade, or rent your personal or financial data. We share information only with:</p>
          <ul>
            <li><strong>Service providers</strong> — Stripe (payments), Plaid (bank connections), Resend (email delivery), and hosting infrastructure providers — strictly to operate the Service</li>
            <li><strong>Legal requirements</strong> — when required by law, regulation, or valid legal process</li>
          </ul>

          <h2>4. Data Storage and Security</h2>
          <p>Your data is stored in secure, encrypted databases in the United States. We use HTTPS encryption for all data in transit. We implement access controls, audit logging, and monitoring to protect your information.</p>
          <p>Audit logs record all significant actions (transactions, journal entries, logins) for accountability. These logs are retained for compliance purposes.</p>

          <h2>5. Data Retention</h2>
          <p>We retain your data for as long as your account is active. If you cancel your subscription, your data is retained for 90 days to allow for export or reactivation, after which it is deleted. Audit logs may be retained longer to comply with accounting standards.</p>

          <h2>6. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and data</li>
            <li>Export your financial data</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>

          <h2>7. Cookies</h2>
          <p>MissionLedger uses a secure, HTTP-only session cookie to keep you logged in. We do not use third-party tracking cookies or advertising cookies.</p>

          <h2>8. Children's Privacy</h2>
          <p>The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information from minors.</p>

          <h2>9. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or within the application. Your continued use of the Service after changes constitutes acceptance of the updated policy.</p>

          <h2>10. Contact</h2>
          <p>Questions about this Privacy Policy? Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
        </div>
      </main>
    </div>
  );
}
