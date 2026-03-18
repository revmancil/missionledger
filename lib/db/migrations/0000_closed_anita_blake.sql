CREATE TYPE "public"."organization_type" AS ENUM('CHURCH', 'MEMBERSHIP', 'NONPROFIT');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('MASTER_ADMIN', 'ADMIN', 'VIEWER', 'PASTOR', 'OFFICER');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('ACTIVE', 'INACTIVE', 'TRIAL', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."donation_type" AS ENUM('CASH', 'CHECK', 'ONLINE', 'IN_KIND', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('PENDING', 'PARTIAL', 'PAID', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."pledge_frequency" AS ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME');--> statement-breakpoint
CREATE TYPE "public"."pledge_status" AS ENUM('ACTIVE', 'FULFILLED', 'CANCELLED', 'DEFAULTED');--> statement-breakpoint
CREATE TYPE "public"."journal_entry_status" AS ENUM('DRAFT', 'POSTED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."bank_transaction_status" AS ENUM('PENDING', 'POSTED', 'RECONCILED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."bank_transaction_type" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."coa_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('UNCLEARED', 'CLEARED', 'RECONCILED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"company_code" text NOT NULL,
	"name" text NOT NULL,
	"dba" text,
	"ein" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"organization_type" "organization_type" DEFAULT 'NONPROFIT' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"subscription_status" "subscription_status" DEFAULT 'TRIAL' NOT NULL,
	"default_fund_id" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_company_code_unique" UNIQUE("company_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "role" DEFAULT 'VIEWER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"parent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"donor_name" text NOT NULL,
	"donor_email" text,
	"amount" real NOT NULL,
	"date" timestamp NOT NULL,
	"type" "donation_type" DEFAULT 'CASH' NOT NULL,
	"fund_id" text,
	"account_id" text,
	"cash_account_id" text,
	"journal_entry_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"description" text NOT NULL,
	"amount" real NOT NULL,
	"date" timestamp NOT NULL,
	"category" text NOT NULL,
	"fund_id" text,
	"account_id" text,
	"cash_account_id" text,
	"vendor_id" text,
	"journal_entry_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"tax_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_id" text NOT NULL,
	"company_id" text NOT NULL,
	"amount" real NOT NULL,
	"date" timestamp NOT NULL,
	"cash_account_id" text,
	"journal_entry_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"vendor_id" text,
	"description" text NOT NULL,
	"amount" real NOT NULL,
	"due_date" timestamp NOT NULL,
	"status" "bill_status" DEFAULT 'PENDING' NOT NULL,
	"account_id" text,
	"fund_id" text,
	"journal_entry_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pledges" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"donor_name" text NOT NULL,
	"donor_email" text,
	"total_amount" real NOT NULL,
	"paid_amount" real DEFAULT 0 NOT NULL,
	"pledge_date" timestamp NOT NULL,
	"start_date" timestamp,
	"end_date" timestamp,
	"frequency" "pledge_frequency",
	"fund_id" text,
	"status" "pledge_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"entry_number" text NOT NULL,
	"date" timestamp NOT NULL,
	"description" text NOT NULL,
	"memo" text,
	"status" "journal_entry_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" text,
	"posted_at" timestamp,
	"voided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_entry_id" text NOT NULL,
	"company_id" text NOT NULL,
	"account_id" text NOT NULL,
	"debit" real DEFAULT 0 NOT NULL,
	"credit" real DEFAULT 0 NOT NULL,
	"description" text,
	"fund_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"account_type" text DEFAULT 'CHECKING' NOT NULL,
	"last_four" text,
	"current_balance" real DEFAULT 0 NOT NULL,
	"gl_account_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"bank_account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"description" text NOT NULL,
	"merchant_name" text,
	"amount" real NOT NULL,
	"type" "bank_transaction_type" NOT NULL,
	"status" "bank_transaction_status" DEFAULT 'PENDING' NOT NULL,
	"fund_id" text,
	"account_id" text,
	"journal_entry_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"company_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_items" (
	"id" text PRIMARY KEY NOT NULL,
	"reconciliation_id" text NOT NULL,
	"bank_transaction_id" text NOT NULL,
	"cleared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"bank_account_id" text NOT NULL,
	"statement_date" timestamp NOT NULL,
	"statement_balance" real NOT NULL,
	"opening_balance" real DEFAULT 0 NOT NULL,
	"cleared_balance" real,
	"difference" real,
	"status" "reconciliation_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"reconciled_by" text,
	"reconciled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"coa_type" "coa_type" NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"bank_account_id" text,
	"date" timestamp NOT NULL,
	"payee" text NOT NULL,
	"amount" real NOT NULL,
	"transaction_type" "transaction_type" DEFAULT 'DEBIT' NOT NULL,
	"transaction_status" "transaction_status" DEFAULT 'UNCLEARED' NOT NULL,
	"chart_account_id" text,
	"memo" text,
	"check_number" text,
	"reference_number" text,
	"fund_id" text,
	"journal_entry_id" text,
	"is_void" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
