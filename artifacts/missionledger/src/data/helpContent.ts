export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  link?: string;
  linkLabel?: string;
  icon: string;
}

export interface Article {
  id: string;
  category: string;
  title: string;
  summary: string;
  steps: string[];
  tips?: string[];
  tags: string[];
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  tags: string[];
}

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "connect-bank",
    title: "Step 1 — Connect a Bank Account",
    description:
      "Link your organization's checking or savings account through Plaid. MissionLedger pulls real-time transactions automatically, eliminating manual data entry.",
    link: "/bank-accounts",
    linkLabel: "Go to Bank Accounts",
    icon: "🏦",
  },
  {
    id: "create-fund",
    title: "Step 2 — Create a Restricted Fund",
    description:
      "Add your first restricted fund (e.g., 'Building Fund' or 'Youth Ministry'). Every dollar coming in or going out can then be tagged to the right fund for clean grant reporting.",
    link: "/funds",
    linkLabel: "Go to Funds",
    icon: "📂",
  },
  {
    id: "categorize-transaction",
    title: "Step 3 — Categorize Your First Transaction",
    description:
      "Open the Bank Register, find your most recent transaction, and assign it a Chart of Accounts category and a Fund. This is the core loop of nonprofit accounting.",
    link: "/bank-register",
    linkLabel: "Go to Bank Register",
    icon: "📋",
  },
];

export const knowledgeBase: Article[] = [
  {
    id: "track-restricted-grant",
    category: "Restricted Funds",
    title: "How to Track a Restricted Grant",
    summary:
      "Walk through the full lifecycle of a restricted grant — from receiving the City of The Colony award to reporting on remaining balances.",
    steps: [
      "Go to Funds and click 'New Fund'. Name it exactly as the grant is titled (e.g., 'City of The Colony — Community Grant 2025'). Set Fund Type to 'Restricted'.",
      "When the grant deposit hits your bank register, open the transaction, set Type to 'Credit', choose the income account (e.g., 4100 · Grant Income), and assign the fund you just created.",
      "As you spend grant money, tag each expense transaction to the same restricted fund. This ensures the fund balance automatically reflects unused grant dollars.",
      "To see a snapshot of fund balances, go to Reports → Balance Sheet. Each restricted fund will appear as a separate equity line, showing how much remains unspent.",
      "When the grant period ends, go to Opening Balance if an adjustment is needed, or use a Journal Entry to close the fund balance to Unrestricted Net Assets.",
    ],
    tips: [
      "Name funds with the year (e.g., 'Building Fund 2025') so you can distinguish annual grants.",
      "Grant agreements often restrict spending categories — use sub-accounts in Chart of Accounts to match the grant budget line by line.",
    ],
    tags: ["grant", "restricted", "fund", "city", "colony", "tracking", "reporting"],
  },
  {
    id: "split-transaction",
    category: "Bank Register",
    title: "Recording a Split Transaction (Processing Fees vs. Income)",
    summary:
      "When an online giving platform (e.g., Stripe, PayPal) deposits net revenue after deducting its fee, use a split transaction to record gross income and the fee separately.",
    steps: [
      "In the Bank Register, open the deposit transaction from your giving platform.",
      "Toggle 'Split Transaction' on. A second row will appear.",
      "Row 1: Set Account to your income account (e.g., 4000 · Contribution Income), Amount = the gross donation amount received (e.g., $1,000). Fund = General Fund.",
      "Row 2: Set Account to an expense account (e.g., 6800 · Merchant Fees), Amount = the processing fee (e.g., $29). Fund = General Fund. Type = Debit.",
      "The net of the two rows should equal the actual deposit amount ($971). MissionLedger validates this automatically.",
      "Save the transaction. Your income statement will now show full gross income and the fee as a separate line.",
    ],
    tips: [
      "Ask your giving platform for a monthly fee summary — some charge at month-end rather than per transaction.",
      "If your processor batches multiple donations into one deposit, use the memo field to note the date range.",
    ],
    tags: ["split", "fee", "processing", "stripe", "paypal", "income", "deposit"],
  },
  {
    id: "board-balance-sheet",
    category: "Reports",
    title: "Running a Board-Ready Balance Sheet",
    summary:
      "Generate a Statement of Financial Position (Balance Sheet) formatted for your board meeting in two clicks.",
    steps: [
      "Go to Reports from the left sidebar.",
      "Select 'Balance Sheet' from the report list.",
      "Set the 'As of' date to the last day of the period you want to report (e.g., December 31, 2024).",
      "Click 'Generate'. The report shows Assets, Liabilities, and Net Assets (broken out by restricted and unrestricted funds).",
      "To share with your board, use the Export to PDF or Print button in the top-right corner of the report.",
      "For a comparative report (this year vs. last year), toggle 'Show Prior Period' — MissionLedger will add a second column automatically.",
    ],
    tips: [
      "Run the balance sheet the day before your board meeting to capture any last-minute transactions.",
      "Net Assets on the balance sheet must equal Total Assets minus Total Liabilities — if it doesn't, check for un-posted Opening Balance entries.",
    ],
    tags: ["balance sheet", "report", "board", "financial position", "net assets", "pdf", "export"],
  },
  {
    id: "opening-balance",
    category: "Opening Balance",
    title: "Setting Up an Opening Balance",
    summary:
      "When you start using MissionLedger mid-year, enter your starting balances so your books agree with your prior bank statements.",
    steps: [
      "Go to Opening Balance from the left sidebar.",
      "Set the 'Opening Date' to the first day you want MissionLedger to take over (e.g., January 1, 2025).",
      "In the Assets section, enter the balance for each bank account and any other assets as of that date.",
      "In the Liabilities section, enter any outstanding loans, credit card balances, or accounts payable.",
      "In the Fund Equity section, distribute your net assets across each fund (unrestricted, restricted, etc.).",
      "Click 'Post Opening Balance'. MissionLedger creates the corresponding journal entry automatically.",
      "If you need to correct a number later, click 'Void & Re-enter' — this safely reverses the old entry and lets you start fresh.",
    ],
    tips: [
      "Use a bank statement from your opening date as the source of truth for all balances.",
      "After posting, run a Balance Sheet to confirm Assets = Liabilities + Net Assets.",
    ],
    tags: ["opening balance", "setup", "start", "beginning", "history", "migration"],
  },
  {
    id: "reconciliation",
    category: "Reconciliation",
    title: "Reconciling Your Bank Account",
    summary:
      "Monthly reconciliation confirms your MissionLedger records match your official bank statement — the backbone of clean nonprofit audits.",
    steps: [
      "Go to Reconciliation from the left sidebar and select the bank account.",
      "Enter the ending balance from your bank statement and the statement date.",
      "MissionLedger lists all uncleared transactions. Check off each one that appears on your bank statement.",
      "The 'Difference' field at the bottom should reach $0.00 when all matching transactions are cleared.",
      "Click 'Finish Reconciliation'. MissionLedger locks those transactions and records the reconciliation date.",
      "If there is a remaining difference, look for missing transactions, duplicate entries, or bank fees not yet recorded.",
    ],
    tips: [
      "Reconcile every month — the longer you wait, the harder it becomes to find discrepancies.",
      "Small rounding differences (under $1) are often bank interest or fee rounding — record a journal entry to clear them.",
    ],
    tags: ["reconciliation", "bank statement", "cleared", "audit", "match", "monthly"],
  },
  {
    id: "journal-entry",
    category: "Journal Entries",
    title: "Making a Manual Journal Entry",
    summary:
      "Use journal entries for adjustments, depreciation, accruals, and any transaction that doesn't flow through the bank register.",
    steps: [
      "Go to Journal Entries from the left sidebar and click 'New Entry'.",
      "Set the date and add a clear description (e.g., 'Monthly depreciation — vehicles').",
      "Add at least two lines: one Debit and one Credit. The total debits must equal total credits.",
      "Assign each line to a Chart of Accounts account and optionally a Fund.",
      "Click 'Post'. The entry immediately updates your financial reports.",
      "To reverse a posted entry, open it and click 'Reverse' — MissionLedger creates an offsetting entry dated the following period.",
    ],
    tips: [
      "Always add a memo explaining why the entry was made — your future auditor (or you in six months) will thank you.",
      "Never edit a posted journal entry that has been reconciled. Reverse and re-enter instead.",
    ],
    tags: ["journal entry", "debit", "credit", "adjustment", "depreciation", "accrual", "manual"],
  },
];

export const faqItems: FaqItem[] = [
  {
    id: "balance-not-updated",
    question: "Why hasn't my bank balance updated?",
    answer:
      "There are two possible causes. (1) Plaid sync: If your bank is connected via Plaid, new transactions typically appear within a few hours but can take up to 24 hours depending on your bank's feed. You can trigger a manual sync from the Bank Accounts page. (2) Opening Balance: If you recently edited or re-posted your Opening Balance, the bank register balance is recalculated automatically — but if you used an older version of MissionLedger, you may need to click 'Recalculate' on the Opening Balance page to force a re-post. After recalculating, the Bank Register balance and Dashboard total will reflect the correct figures.",
    tags: ["balance", "sync", "plaid", "update", "opening balance", "recalculate"],
  },
  {
    id: "fix-opening-balance-typo",
    question: "How do I fix a typo in an Opening Balance?",
    answer:
      "Go to the Opening Balance page. At the top, click 'Void & Re-enter' (or 'Recalculate' if one is available). This safely reverses all the journal entries from the original posting so your books are clean. Then re-enter your correct balances and click 'Post Opening Balance' again. Important: Do not manually edit the underlying journal entry — always use the Void & Re-enter workflow to avoid orphaned GL entries that inflate account balances.",
    tags: ["opening balance", "typo", "fix", "error", "correct", "void", "re-enter"],
  },
  {
    id: "restricted-vs-unrestricted",
    question: "What is the difference between Restricted and Unrestricted funds?",
    answer:
      "Unrestricted funds can be used for any organizational purpose at leadership's discretion. Restricted funds are donations or grants given for a specific purpose (e.g., a building project or a youth camp) — you are legally obligated to spend them only as the donor or grantor specified. MissionLedger tracks both separately in your Balance Sheet under Net Assets, making it easy to show donors and auditors that restricted dollars were used correctly.",
    tags: ["restricted", "unrestricted", "fund", "difference", "donor", "grant"],
  },
  {
    id: "duplicate-transaction",
    question: "I see a duplicate transaction in my bank register — what do I do?",
    answer:
      "First, verify which transaction is the duplicate by comparing amounts, dates, and payees against your actual bank statement. Once identified, open the duplicate transaction and click 'Void' (the trash icon or void button). Do not delete — voiding keeps an audit trail. If the duplicate came from a Plaid import, it usually means a transaction was manually entered AND auto-imported. Void the manual one and keep the Plaid-imported version.",
    tags: ["duplicate", "transaction", "void", "plaid", "import", "bank register"],
  },
  {
    id: "import-bank-csv",
    question: "How do I import transactions from a bank statement?",
    answer:
      "On the Bank Register, click Import. Choose CSV (recommended: your bank’s transaction export) or PDF (only if the PDF has selectable text — scanned statements won’t work). Pick the MissionLedger bank account the file belongs to, then upload. We match date, amount, and description; duplicates are skipped. CSV is more reliable than PDF because every bank formats PDFs differently. You need admin permission to import.",
    tags: ["import", "csv", "pdf", "bank statement", "upload", "bank register", "transactions"],
  },
  {
    id: "chart-of-accounts",
    question: "How do I add a new Chart of Accounts category?",
    answer:
      "Go to Settings → Chart of Accounts (or Chart of Accounts from the sidebar). Click 'Add Account'. Choose the account type (Asset, Liability, Equity, Revenue, or Expense), assign an account number following your numbering convention (e.g., 6900s for new expenses), and give it a descriptive name. The new account is immediately available in the Bank Register, Journal Entries, and all reports.",
    tags: ["chart of accounts", "category", "account", "add", "new", "coa"],
  },
  {
    id: "period-close",
    question: "How do I close a financial period?",
    answer:
      "Go to Period Close from the left sidebar. Select the period end date (e.g., December 31, 2024) and click 'Close Period'. MissionLedger locks all transactions dated on or before that date — nobody can edit or add transactions in the closed period without an admin override. This protects your audited financials from accidental changes. To reopen a closed period, an admin must use the override option in Period Close settings.",
    tags: ["period close", "lock", "year end", "close", "protect", "audit"],
  },
  {
    id: "fund-balance-report",
    question: "How do I see the balance of each fund?",
    answer:
      "Go to Reports → Balance Sheet. Under the Net Assets section, each fund appears as a separate line showing its current balance. For a more detailed breakdown, go to Reports → Statement of Activities filtered by a specific fund — this shows all income and expenses tagged to that fund over any date range. You can also see a quick summary on the Dashboard which shows total cash by fund.",
    tags: ["fund", "balance", "report", "net assets", "statement of activities", "dashboard"],
  },
  {
    id: "unreconciled-alert",
    question: "What does the 'Unreconciled' alert on my dashboard mean?",
    answer:
      "This means at least one bank account has transactions from a prior month that have not been reconciled yet. This is usually harmless day-to-day, but it is important to reconcile monthly to catch errors early and to maintain clean records for your annual audit. Click the alert or go to the Reconciliation page to start reconciling the flagged account.",
    tags: ["reconciliation", "alert", "unreconciled", "dashboard", "warning"],
  },
];
