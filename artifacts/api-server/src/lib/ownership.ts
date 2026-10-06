import { pool } from "@workspace/db";

/**
 * Request bodies carry IDs of related records (bank account, fund, vendor, ...). Every
 * table is tenant-scoped, so an ID that doesn't belong to the caller's company must be
 * rejected — otherwise a user could link their books to another organization's records.
 */
type Kind = "bankAccount" | "glAccount" | "fund" | "vendor" | "donor" | "campaign";

// Fixed identifiers only — never built from request input.
const TABLES: Record<Kind, string[]> = {
  bankAccount: ["bank_accounts"],
  // JE lines and legacy records may reference either the chart of accounts or the legacy accounts table.
  glAccount: ["chart_of_accounts", "accounts"],
  fund: ["funds"],
  vendor: ["vendors"],
  donor: ["donors"],
  campaign: ["pledge_campaigns"],
};

const LABELS: Record<Kind, string> = {
  bankAccount: "Bank account",
  glAccount: "Account",
  fund: "Fund",
  vendor: "Vendor",
  donor: "Donor",
  campaign: "Campaign",
};

export type OwnershipRefs = Partial<Record<Kind, unknown>>;

/** Returns an error message for the first ID that is not owned by `companyId`, or null when all are fine. */
export async function foreignIdError(companyId: string, refs: OwnershipRefs): Promise<string | null> {
  for (const kind of Object.keys(refs) as Kind[]) {
    const raw = refs[kind];
    const list = Array.isArray(raw) ? raw : [raw];
    const ids = [...new Set(list.filter((v) => v !== null && v !== undefined && v !== ""))];
    if (ids.length === 0) continue;
    if (ids.some((v) => typeof v !== "string")) return `Invalid ${LABELS[kind].toLowerCase()} id.`;

    const found = new Set<string>();
    for (const table of TABLES[kind]) {
      const { rows } = await pool.query(
        `SELECT id FROM ${table} WHERE company_id = $1 AND id = ANY($2::text[])`,
        [companyId, ids],
      );
      for (const r of rows) found.add(r.id as string);
    }
    if (ids.some((id) => !found.has(id as string))) return `${LABELS[kind]} not found in this organization.`;
  }
  return null;
}
