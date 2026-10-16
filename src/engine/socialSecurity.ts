// Social Security claiming adjustments per SSA rules:
// - Early: 5/9 of 1% per month for the first 36 months before FRA, 5/12 of 1% per month beyond.
// - Delayed: 8% per year (2/3 of 1% per month) after FRA, up to age 70, for those born 1943 or later.

export function fullRetirementAgeMonths(birthYear: number): number {
  if (birthYear <= 1954) return 66 * 12;
  if (birthYear >= 1960) return 67 * 12;
  return 66 * 12 + (birthYear - 1954) * 2;
}

/** Benefit as a fraction of PIA when claiming at a whole age. */
export function claimingFactor(claimAge: number, birthYear: number): number {
  const fra = fullRetirementAgeMonths(birthYear);
  const claim = Math.min(Math.max(claimAge, 62), 70) * 12;
  if (claim >= fra) return 1 + (claim - fra) * (2 / 3 / 100);
  const early = fra - claim;
  return 1 - Math.min(early, 36) * (5 / 9 / 100) - Math.max(early - 36, 0) * (5 / 12 / 100);
}
