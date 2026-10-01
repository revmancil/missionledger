/**
 * Small, deliberately-contained set of label overrides for church-type orgs.
 * Not a general i18n system — just the handful of spots where "donor"-flavored
 * nonprofit language reads oddly for a church's day-to-day giving terminology.
 */
export function isChurchOrg(organizationType: string | null | undefined): boolean {
  return organizationType === "CHURCH";
}

export function givingNavLabel(organizationType: string | null | undefined): string {
  return isChurchOrg(organizationType) ? "Tithes & Offerings" : "Donor Giving";
}

export function givingStatementTitle(organizationType: string | null | undefined): string {
  return isChurchOrg(organizationType) ? "Giving Statement" : "Donor Giving Statement";
}
