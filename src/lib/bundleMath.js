/**
 * bundleMath.js — single source of truth for distributor-bundle pricing math.
 *
 * Used (or will be used in Increment B) by:
 *   - BundlesAdmin live preview (this session)
 *   - DealBuilder rep-side live preview (next session)
 *   - Deal submit payload (next session)
 *   - QuoteView customer-facing rendering (next session)
 *
 * The math is:
 *   hardware    = sum(equipment.list_price × quantity)
 *   soft_cost   = hardware × bundle.soft_cost_pct
 *   reserve     = bundle.service_reserve
 *   leaseBasis  = hardware + soft_cost + reserve
 *   monthlyRaw  = leaseBasis × bundle.lease_rate
 *   monthlyCharged = roundHalfUp(monthlyRaw)   ← whole dollar; customer-visible
 *
 * Eligibility:
 *   eligible = leaseBasis >= LEASE_MIN_PRICE   (default $5,000)
 *
 * Output: a frozen object with all intermediate and final numbers, so callers
 * can render any level of detail (rep sees everything; customer sees only
 * monthlyCharged and the term).
 */

import { LEASE_MIN_PRICE } from './leasing.js';

/**
 * Round half-up to the nearest integer. Different from Math.round() in
 * JavaScript — Math.round(2.5) = 3 but Math.round(-2.5) = -2. For currency
 * we always want .5 to go up regardless of sign, but bundle monthlies are
 * always positive so Math.round() actually does the right thing here.
 * Kept as a named helper anyway to make the intent explicit and to give us
 * one place to swap rounding behavior if business rules change.
 */
function roundHalfUp(n) {
  return Math.round(n);
}

/**
 * Calibrate the service reserve so that, at the bundle's default equipment
 * load, the customer's monthly equals the bundle's target_monthly_fee.
 *
 * Math:
 *   target_lease_basis = target_monthly_fee / lease_rate
 *   reserve = target_lease_basis - default_hardware - default_hardware × soft_cost_pct
 *   reserve = max(reserve, reserve_floor)
 *
 * v27.2 policy: reserveFloor defaults to 0 (not the old $1,080). The reserve
 * back-solves to hit the marketing number exactly, and we only protect
 * against a negative reserve. A negative result means the bundle's target
 * is too low for its default hardware — admin should raise the target or
 * trim the default load. `wasNegative` surfaces that in BundlesAdmin.
 *
 * Returns:
 *   {
 *     reserve:   number  ← the calibrated reserve to use
 *     wasFloored: bool   ← true if math wanted lower than floor; floor was applied
 *     wasNegative: bool  ← true if math produced negative (bundle target too low
 *                          for its equipment — admin should fix)
 *     shortfall: number  ← how much MORE the math would need to clear the floor
 *                          (or 0 if no flooring happened)
 *   }
 *
 * If target_monthly_fee is not set / not numeric, returns null — the caller
 * should fall back to the stored bundle.service_reserve.
 */
export function calibrateBundleReserve({
  targetMonthlyFee,
  leaseRate = 0.0395,
  softCostPct = 0.25,
  defaultHardware = 0,
  reserveFloor = 0,
} = {}) {
  if (targetMonthlyFee == null || !Number.isFinite(Number(targetMonthlyFee))) return null;
  const target = Number(targetMonthlyFee);
  if (target <= 0) return null;

  const targetLeaseBasis = target / numberOr(leaseRate, 0.0395);
  const softCost = numberOr(defaultHardware, 0) * numberOr(softCostPct, 0.25);
  const raw = targetLeaseBasis - numberOr(defaultHardware, 0) - softCost;

  // numberOr falls back to its second arg ONLY when the first is non-finite.
  // We want reserveFloor = 0 to be a valid, honored value, so use ?? not numberOr.
  const floor = Number.isFinite(Number(reserveFloor)) ? Number(reserveFloor) : 0;
  const wasNegative = raw < 0;
  const floored = Math.max(raw, floor);
  const wasFloored = raw < floor && !wasNegative;
  const shortfall = wasFloored ? (floor - raw) : 0;

  return {
    reserve: floored,
    wasFloored,
    wasNegative,
    shortfall,
    raw,
  };
}

/**
 * Compute everything from a bundle config + list of equipment items.
 *
 * v29: If `defaultEquipment` is provided AND the bundle has a
 * target_monthly_fee, the service reserve is back-solved at the default
 * load so the bundle's default equipment produces a monthly equal to the
 * target. Substitutions and additions then move the monthly forward as
 * the math runs.
 *
 * @param {Object} bundle - { soft_cost_pct, service_reserve, lease_rate, term_months, target_monthly_fee }
 * @param {Array}  equipment - [{ list_price, quantity }, ...]
 * @param {Array}  defaultEquipment - optional; the bundle's default items used for reserve back-solve
 * @returns {Object} frozen pricing breakdown
 */
export function calculateBundlePricing({ bundle, equipment, defaultEquipment = null }) {
  const softCostPct    = numberOr(bundle?.soft_cost_pct,    0.25);
  const storedReserve  = numberOr(bundle?.service_reserve,  1080.00);
  const leaseRate      = numberOr(bundle?.lease_rate,       0.0395);
  const termMonths     = intOr   (bundle?.term_months,      36);
  const target         = bundle?.target_monthly_fee;

  const items = Array.isArray(equipment) ? equipment : [];

  // Hardware total of the current deal (substitutions + add-ons baked in)
  const hardware = items.reduce((sum, it) => {
    const price = numberOr(it?.list_price, 0);
    const qty   = intOr(it?.quantity, 1);
    return sum + price * qty;
  }, 0);

  // Service reserve: if defaultEquipment + target are provided, back-solve
  // from the default load. Otherwise use the stored reserve as-is.
  let serviceReserve = storedReserve;
  let calibration = null;
  if (defaultEquipment && Array.isArray(defaultEquipment) && target != null) {
    const defaultHardware = defaultEquipment.reduce((sum, it) => {
      const price = numberOr(it?.list_price, 0);
      const qty   = intOr(it?.quantity, 1);
      return sum + price * qty;
    }, 0);
    calibration = calibrateBundleReserve({
      targetMonthlyFee: target,
      leaseRate,
      softCostPct,
      defaultHardware,
      reserveFloor: 0, // v27.2: hit marketing target exactly; only protect against negative
    });
    if (calibration) serviceReserve = calibration.reserve;
  }

  const softCost    = hardware * softCostPct;
  const reserve     = serviceReserve;
  const leaseBasis  = hardware + softCost + reserve;
  const monthlyRaw  = leaseBasis * leaseRate;
  const monthlyComputed = roundHalfUp(monthlyRaw);
  // v27.1 — customer_monthly is the HIGHER of (a) the math-derived monthly
  // and (b) the bundle's target_monthly_fee. When defaultEquipment + target
  // are both supplied, the back-solved reserve makes these equal at default
  // load; substitutions or add-ons can push monthlyComputed above target.
  // When defaultEquipment is NOT supplied (legacy path or thin config), the
  // computed monthly can come in below the target and we floor it. This
  // matches the rep direction: snapshot/pipeline uses whichever is higher.
  const targetNum = Number.isFinite(target) ? Number(target) : 0;
  const monthlyCharged = Math.max(monthlyComputed, targetNum);

  const eligible = leaseBasis >= LEASE_MIN_PRICE;
  const eligibilityShortfall = eligible ? 0 : (LEASE_MIN_PRICE - leaseBasis);

  const valid = bundle != null
    && Number.isFinite(softCostPct)
    && Number.isFinite(serviceReserve)
    && Number.isFinite(leaseRate)
    && termMonths > 0;

  return Object.freeze({
    valid,
    eligible,
    eligibilityShortfall,
    softCostPct,
    serviceReserve,
    leaseRate,
    termMonths,
    hardware,
    softCost,
    reserve,
    leaseBasis,
    monthlyRaw,
    monthlyCharged,
    // v29: calibration metadata when reserve was back-solved
    calibration,
  });
}

/**
 * Convenience formatter for currency values consistent across the app.
 * Two-decimal USD. Used by admin preview and (later) the deal builder.
 */
export function formatCurrency(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Whole-dollar formatter for the customer-visible monthly fee.
 * No cents — matches the rounding rule above.
 */
export function formatMonthly(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Format a soft-cost percentage as "25%" for display.
 */
export function formatSoftCost(pct) {
  if (pct == null || !Number.isFinite(pct)) return '—';
  return `${(pct * 100).toFixed(0)}%`;
}

// ───────────────────────────── internal helpers ───────────────────────────

function numberOr(v, fallback) {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function intOr(v, fallback) {
  if (v == null) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}
