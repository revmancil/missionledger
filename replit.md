# MissionLedger

## Overview

MissionLedger is a full-stack nonprofit financial management SaaS app for churches, membership organizations, and nonprofits. Built as a pnpm monorepo with React+Vite frontend and Express API backend.

## Application Features

- **Dashboard**: KPIs (total donations, expenses, net income), charts (monthly bar, expense pie), recent activity
- **Donations**: Track donor contributions with fund/account allocation, donation type
- **Expenses**: Record expenses by category with vendor and fund association
- **Funds**: Fund accounting with balance tracking (donations − expenses per fund)
- **Chart of Accounts**: 26 default nonprofit accounts auto-created on registration
- **Vendors**: Vendor management with contact info and tax ID
- **Bills**: Accounts payable with partial payment tracking
- **Pledges**: Multi-year pledge tracking with frequency and fulfillment status
- **Bank Accounts**: Track checking/savings accounts with balances; each account can be linked to a real bank via Plaid for automated transaction sync
- **Bank Register**: QuickBooks-style double-row transaction register — Row 1 (Date, Check#, Payee, Payment, Deposit, Balance, Status), Row 2 (Account/Category, Fund, Memo). Supports filtering by bank account and status, inline clear/void actions, running balance column, footer totals.
- **Chart of Accounts (new)**: Dedicated `chart_of_accounts` table with 56 pre-seeded accounts: 4000-series Income (Individual Contributions, Grants, Membership Dues, etc.) and 8000-series Expense (Personnel, Occupancy, Program, Admin, Professional Services, Travel, Marketing, etc.). Auto-seeded per company on registration.
- **Transactions**: Full `transactions` table for the bank register: soft-void only (no deletes), DEBIT/CREDIT types, UNCLEARED/CLEARED/RECONCILED/VOID statuses.
- **Reports**: P&L, Balance Sheet, Cash Flow, Budget vs Actual
- **Bank Reconciliation**: 4-phase module (history → setup → workspace → done); two-column cleared/uncleared table, live math footer, Difference badge, locks cleared transactions as RECONCILED
- **Executive Dashboard**: KPI cards (Total Cash, Net Monthly Income, Budget %, Monthly Deposits), spending by category donut, 6-month income/expenses bar chart, budget tracker with over-budget alerts, recent activity feed
- **Opening Balance Wizard**: Three-column wizard (Assets 1000s / Liabilities 2000s / Equity 3000s); accounting equation check Assets = Liabilities + Equity; Cash/Accrual toggle (Cash hides Liabilities column); creates a posted journal entry on finalize; stores `accountingMethod` on the company record; "Edit Balances" re-voids and replaces the prior entry
- **Stripe Billing** (`/billing`): Subscription management page showing current plan status (TRIAL/ACTIVE/etc.) and three pricing tiers (Starter $19/mo, Professional $49/mo, Enterprise $99/mo). Checkout via Stripe Checkout sessions; billing portal for existing subscribers. Stripe products seeded via `src/seeds/stripe-products.ts`. Uses Replit native Stripe connector for credentials.
- **Plaid Bank Linking**: Each bank account card on `/bank-accounts` has a "Link Bank via Plaid" button. On click, fetches a Plaid Link token (`POST /api/plaid/create-link-token`), opens Plaid Link modal, exchanges the public token (`POST /api/plaid/exchange-token`), stores `plaidAccessToken` + `plaidItemId` + `plaidInstitutionName` + `isPlaidLinked` on the bank account. Sync button (`POST /api/plaid/sync/:id`) fetches 90 days of transactions. Unlink via `DELETE /api/plaid/unlink/:id`. Uses sandbox credentials.
- **Responsive Design**: Full mobile + tablet support — sidebar collapses to a slide-over drawer with hamburger toggle on mobile; all tables wrapped in horizontal scroll containers; form grids stack to single column on small screens; page headers wrap instead of overflowing
- **Authentication**: Cookie-based JWT sessions with company code + email + password
- **Multi-Tenant Architecture**: Every table uses `company_id` as the tenant firewall. All queries are filtered by `companyId` from the JWT. Application-level RLS is enforced on every route.
- **Organization Users (`organization_users`)**: Join table enabling a single user to belong to multiple organizations. Used by the Org Switcher to let users switch context without re-logging in.
- **Platform Admin Console** (`/master-admin`): Separate view (guarded by `isPlatformAdmin` flag on users) showing all organizations across the platform with stats, user counts, subscription status. Supports: suspend/activate orgs (which blocks all logins for that org), impersonate (view any org's books as a support admin with a 2-hour session), and org detail/user drill-down.
- **Org Switcher**: Shown in the sidebar when a user belongs to multiple organizations. Calls `POST /auth/switch-org` to re-issue the JWT for the selected org.
- **Impersonation Banner**: When a platform admin is viewing an org via impersonation, an amber banner appears in the sidebar showing "Viewing as [Org Name]" with an Exit button. Impersonation is time-limited (2h JWT).
- **Account Suspension**: Setting `company.isActive = false` causes the `requireAuth` middleware to return `403 ACCOUNT_SUSPENDED` on all subsequent requests from users of that org.
- **Double-Entry GL Engine**: `gl_entries` table + engine (`lib/gl.ts`) that generates balanced debit/credit pairs for every transaction. Strict balance enforcement — partial entries are never persisted.
- **Trial Balance**: `/trial-balance` page with account groups (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE), collapsible rows, balance banner (green/red), Sync GL Entries button, and GAAP note.
- **Period & Year-End Close Wizard**: `/period-close` — multi-step wizard with:
  - Pre-Close Health Check (3 automated checks: reconciliation, uncategorized transactions, trial balance)
  - Monthly/Period Soft Lock: sets `company.closedUntil`; transactions in locked period become read-only
  - Year-End Hard Close: posts a multi-line closing journal entry zeroing income/expense accounts to retained earnings
  - Finalized financial statement snapshots (Statement of Activities + Balance Sheet) saved to `financial_snapshots` table
  - Reopen Protocol: MASTER_ADMIN only, requires reason, logged permanently to `audit_logs` table
  - Bank Register shows amber lock banner + lock icon on closed-period transactions

## Tech Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 with cookie-parser
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + shadcn/ui + Tailwind CSS
- **Charts**: Recharts
- **Auth**: bcryptjs + jsonwebtoken (Cookie: `ml_session`, 7-day expiry)

## Auth Flow

- Registration creates company + admin user + 26 legacy accounts + 56 chart_of_accounts (4000/8000 series) + "General Fund"
- Login requires: `companyCode` (6-char alphanumeric), `email`, `password`
- Company code is shown after registration
- JWT stored in httpOnly cookie `ml_session`

## Color Scheme

- Primary blue: `hsl(210, 60%, 25%)`
- Accent teal: `hsl(174, 60%, 40%)`
- Background: `hsl(210, 40%, 98%)`

## Structure

```text
├── artifacts/
│   ├── api-server/         # Express 5 API (port from $PORT env)
│   │   └── src/
│   │       ├── app.ts      # CORS, cookie-parser, routes
│   │       ├── lib/auth.ts # JWT/bcrypt auth middleware
│   │       └── routes/     # 18 route files (auth, dashboard, CRUD)
│   └── missionledger/      # React+Vite frontend (previewPath: /)
│       └── src/
│           ├── App.tsx     # Router with all 10 protected routes
│           ├── pages/      # 10 pages (landing, auth, dashboard, modules)
│           ├── hooks/      # Auth and CRUD hooks
│           └── components/ # AppLayout, AppSidebar
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   │   └── src/custom-fetch.ts  # credentials: "include" for cookies
│   ├── api-zod/            # Generated Zod schemas
│   └── db/                 # Drizzle ORM schema (14 schema files)
│       └── src/schema/     # companies, users, funds, accounts, donations,
│                           # expenses, vendors, bills, pledges, journalEntries,
│                           # bankAccounts, bankTransactions, budgets, reconciliation
```

## Key Files

- `artifacts/api-server/src/routes/index.ts` — mounts all 18 routers
- `artifacts/api-server/src/lib/auth.ts` — JWT auth, default account creation
- `artifacts/missionledger/src/App.tsx` — full routing with all pages
- `lib/api-client-react/src/custom-fetch.ts` — `credentials: "include"` for cookie auth
- `lib/db/src/schema/index.ts` — barrel export of all 14 schema files

## Running

- API Server: `pnpm --filter @workspace/api-server run dev`
- Frontend: `pnpm --filter @workspace/missionledger run dev`
- DB Push: `pnpm --filter @workspace/db run push-force`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` with `composite: true`. Run `pnpm run typecheck` from root. Run codegen before typecheck if OpenAPI spec changes.
