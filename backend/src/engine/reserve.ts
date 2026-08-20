import Decimal from "decimal.js";

export interface ReserveContribution {
  id: string;
  amount: number;
  contributedAtIso: string;
  deployedAmount: number; // running total deployed from this specific contribution
}

export interface ReserveSummary {
  totalContributed: number;
  totalDeployed: number;
  available: number;
  oldestUndeployedContribution: ReserveContribution | null;
  oldestUndeployedAgeMonths: number | null;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  const dayFraction = (to.getDate() - from.getDate()) / 30;
  return years * 12 + months + dayFraction;
}

export function summarizeReserve(
  contributions: ReserveContribution[],
  asOfIso: string
): ReserveSummary {
  let totalContributed = new Decimal(0);
  let totalDeployed = new Decimal(0);
  let oldest: ReserveContribution | null = null;

  for (const c of contributions) {
    totalContributed = totalContributed.plus(c.amount);
    totalDeployed = totalDeployed.plus(c.deployedAmount);
    const remaining = new Decimal(c.amount).minus(c.deployedAmount);
    if (remaining.greaterThan(0)) {
      if (!oldest || new Date(c.contributedAtIso) < new Date(oldest.contributedAtIso)) {
        oldest = c;
      }
    }
  }

  return {
    totalContributed: totalContributed.toDecimalPlaces(2).toNumber(),
    totalDeployed: totalDeployed.toDecimalPlaces(2).toNumber(),
    available: totalContributed.minus(totalDeployed).toDecimalPlaces(2).toNumber(),
    oldestUndeployedContribution: oldest,
    oldestUndeployedAgeMonths: oldest ? monthsBetween(oldest.contributedAtIso, asOfIso) : null,
  };
}

/**
 * Suggested deployment for a newly-triggered threshold, capped by whatever
 * reserve is actually available. Never suggests more than is available —
 * the reserve is ammunition, not a guarantee.
 */
export function suggestedDeployment(
  configuredAmount: number,
  reserveAvailable: number
): number {
  const amount = Decimal.min(new Decimal(configuredAmount), new Decimal(Math.max(reserveAvailable, 0)));
  return amount.toDecimalPlaces(2).toNumber();
}

/**
 * Cash-drag / reserve-expiry logic: any contribution older than
 * `expiryMonths` with undeployed balance releases `releasePercent`% of its
 * *remaining undeployed balance* per evaluation into the normal SIP
 * allocation, continuing period over period until fully deployed.
 * Returns the amount to sweep into the normal SIP for each stale
 * contribution. Disabled entirely when expiryMonths is null/0.
 */
export function calculateCashDragRelease(
  contributions: ReserveContribution[],
  asOfIso: string,
  expiryMonths: number | null,
  releasePercent: number
): Array<{ contributionId: string; releaseAmount: number; ageMonths: number }> {
  if (!expiryMonths || expiryMonths <= 0) return [];

  const releases: Array<{ contributionId: string; releaseAmount: number; ageMonths: number }> = [];
  for (const c of contributions) {
    const remaining = new Decimal(c.amount).minus(c.deployedAmount);
    if (remaining.lessThanOrEqualTo(0)) continue;
    const ageMonths = monthsBetween(c.contributedAtIso, asOfIso);
    if (ageMonths < expiryMonths) continue;
    const releaseAmount = remaining.times(releasePercent).dividedBy(100);
    if (releaseAmount.greaterThan(0)) {
      releases.push({
        contributionId: c.id,
        releaseAmount: releaseAmount.toDecimalPlaces(2).toNumber(),
        ageMonths,
      });
    }
  }
  return releases;
}
