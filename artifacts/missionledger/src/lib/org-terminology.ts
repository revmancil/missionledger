/**
 * Small, deliberately-contained set of label overrides for church-type orgs.
 * Not a general i18n system — just the handful of spots where "donor"-flavored
 * nonprofit language reads oddly for a church's day-to-day giving terminology.
 */
export function isChurchOrg(organizationType: string | null | undefined): boolean {
  return organizationType === "CHURCH";
}

export function isMembershipOrg(organizationType: string | null | undefined): boolean {
  return organizationType === "MEMBERSHIP";
}

/**
 * True for orgs where the 501(c)(3)-specific IRS 990 "Public Support Test" and
 * charitable-contribution tax-deductibility language actually apply. Churches
 * are generally 990-exempt; membership/social organizations are typically
 * 501(c)(7), not 501(c)(3), so neither the public support test nor "this is a
 * tax-deductible donation" wording is correct for them.
 */
export function is501c3Oriented(organizationType: string | null | undefined): boolean {
  return !isChurchOrg(organizationType) && !isMembershipOrg(organizationType);
}

export function givingNavLabel(organizationType: string | null | undefined): string {
  return isChurchOrg(organizationType) ? "Tithes & Offerings" : "Donor Giving";
}

export function givingStatementTitle(organizationType: string | null | undefined): string {
  if (isChurchOrg(organizationType)) return "Giving Statement";
  if (isMembershipOrg(organizationType)) return "Dues & Payments Statement";
  return "Donor Giving Statement";
}

/**
 * The footer disclaimer on a giving/dues statement. 501(c)(3) orgs can tell a donor
 * "no goods or services were provided... retain this for your tax records" because the
 * gift is a deductible charitable contribution. That's not true for a 501(c)(7)
 * membership/social organization's dues — don't claim deductibility for them.
 */
export function givingStatementDisclaimer(organizationType: string | null | undefined): string {
  if (isMembershipOrg(organizationType)) {
    return "This statement summarizes your membership dues and payments for your records. Membership dues are generally not deductible as charitable contributions; consult your tax advisor about your specific situation.";
  }
  return "No goods or services were provided in exchange for these contributions unless noted above. Please retain this document for your tax records.";
}

export function giverDirectoryLabel(organizationType: string | null | undefined): string {
  return isChurchOrg(organizationType) ? "Members & Givers" : "Givers Directory";
}
