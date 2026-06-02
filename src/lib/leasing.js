/**
 * Leasing business rules — kept in one place so the threshold and rate can
 * be adjusted without hunting through every component.
 *
 * These defaults mirror the values in the `business_config` table. The
 * server is the source of truth — these are fallbacks only used if the
 * config row isn't loaded (it's loaded on every catalog query through
 * v_catalog, which already includes lease_monthly_estimate).
 */
export const LEASE_MIN_PRICE = 5000;
export const LEASE_RATE = 0.0395;

/**
 * Compute the monthly lease estimate for a given list price.
 * Returns null if the price is below the minimum or missing.
 *
 * NOTE: when displaying values from v_catalog, prefer the server-computed
 * `lease_monthly_estimate` field — it's the authoritative version.
 * This client helper is for cases where we only have list_price.
 */
export function computeLeaseMonthly(listPrice) {
  if (listPrice == null || listPrice < LEASE_MIN_PRICE) return null;
  return Math.round(listPrice * LEASE_RATE * 100) / 100;
}

/**
 * Is this item lease-eligible as a standalone purchase?
 * (Items below the minimum can still appear in lease bundles, but not on their own.)
 */
export function isLeaseEligible(item) {
  if (!item) return false;
  // Trust the database flag when present — it allows admin overrides
  // (e.g., an item priced over $5K but excluded for vendor reasons).
  if (typeof item.lease_eligible === 'boolean') return item.lease_eligible;
  return (item.list_price ?? 0) >= LEASE_MIN_PRICE;
}

/**
 * Format a lease monthly amount as "$NNN/mo" — used everywhere a lease badge
 * needs to display the number.
 */
export function formatLeaseMonthly(amount) {
  if (amount == null) return null;
  return `$${Math.round(amount).toLocaleString()}/mo`;
}
