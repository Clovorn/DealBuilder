/**
 * Pipeline phase & step constants — single source of truth for what stage a
 * deal is in, and what the next/previous step should look like.
 *
 * IMPORTANT: these constants are DUPLICATED in the Pipeline Dashboard's
 * inline script (Clovorn/ronnoco-deal-dashboard repo, index.html). When the
 * dashboard team renames or reorders a step there, this file has to follow.
 * Keep the two in lockstep. The values used in the `current_step` column of
 * the pipeline `deals` table are the snake_case keys below; the dashboard
 * UI labels and the Deal Builder UI labels both render from STEP_LABELS so
 * a rename only needs to happen in one place per app.
 *
 * Phase transitions (per v22c business rules):
 *   Sales (quoted) ─┬─ customer decision: lease/finance ─► Leasing (submitted)
 *                   ├─ customer decision: purchase/loan  ─► Ops (customer_setup)
 *                   └─ customer decision: declined       ─► closed (deal_status='closed')
 *   Leasing (funded) ─► Ops (customer_setup)                  [auto, last leasing step]
 *   Ops (installation) ─► Complete                            [deal_status='complete'? — TBD]
 *
 * The auto-transitions (Leasing→Ops on funded, decision→phase) are
 * implemented in MyDealsPage.jsx's recordCustomerDecision handler. The
 * Leasing→Ops transition isn't triggered from Deal Builder — the leasing
 * team advances it in the Pipeline Dashboard.
 */

/* ─────────────── Phase sequences ─────────────── */

/**
 * Ordered list of `current_step` values for each phase, earliest → latest.
 * The stepper renders this sequence with the deal's actual `current_step`
 * highlighted.
 *
 * `credit_denied` is NOT in the leasing sequence — it's a *terminal branch*
 * off `credit_received`. The stepper renders it as a side-branch when it's
 * the deal's current step. See `isTerminalDenial()` below.
 */
export const PHASE_STEPS = {
  sales: ['quoted'],
  leasing: [
    'submitted',
    'notify_lender',
    'credit_sent',
    'credit_received',
    'credit_approved',
    'paperwork_sent',
    'paperwork_received',
    'funded',
  ],
  // v31: Director-approval phase. Purchase and Loan decisions from a quote
  // land here for the rep's assigned director to approve or reject before
  // the deal moves to ops. Single step — the deal is either approved (and
  // advances), rejected (terminal-ish, can be resubmitted), or still pending.
  pending_director: [
    'awaiting_review',
  ],
  ops: [
    'customer_setup',
    'equip_ordered',
    'equip_received',
    'install_scheduled',
    'dist_notified',
    'installation',
  ],
};

/* ─────────────── Display labels ─────────────── */

/**
 * Human-readable labels for every `current_step` value, including off-path
 * states (`credit_denied`, `complete`). Used by the stepper and any place
 * that needs to render a step name.
 */
export const STEP_LABELS = {
  // Sales
  quoted: 'Quoted',
  // Leasing
  submitted: 'Submitted',
  notify_lender: 'Notify Lender',
  credit_sent: 'Credit App Sent',
  credit_received: 'Credit App Received',
  credit_approved: 'Credit Approved',
  credit_denied: 'Credit Denied',
  paperwork_sent: 'Paperwork Sent',
  paperwork_received: 'Paperwork Received',
  funded: 'Funded',
  // Pending-director (v31)
  awaiting_review: 'Awaiting Director Review',
  // Ops
  customer_setup: 'Customer Setup',
  equip_ordered: 'Equip Ordered',
  equip_received: 'Equip Received',
  install_scheduled: 'Install Scheduled',
  dist_notified: 'Dist. Notified',
  installation: 'Installation',
  // Terminal / closed
  complete: 'Complete',
};

/**
 * Phase labels — the human-readable name for `phase` values.
 */
export const PHASE_LABELS = {
  sales: 'Sales',
  leasing: 'Financing',  // dashboard tab says "In Financing"; we call it Financing
  pending_director: 'Director Review',
  ops: 'Operations',
};

/* ─────────────── Customer decision constants ─────────────── */

/**
 * Customer decisions that move a quote forward. The phase a decision lands
 * the deal in is encoded here so the recordCustomerDecision handler stays
 * declarative — adding a new decision type only requires adding a row.
 *
 * v31 change: purchase and loan no longer jump straight to ops. They now
 * land in `pending_director` (step `awaiting_review`) so the rep's assigned
 * director can approve before the deal moves into operations. Once the
 * director approves, the deal advances to ops/customer_setup via approveDeal()
 * in dealPipeline.js. Lease and finance still go to leasing/submitted as
 * before — those go through the lender's credit review, not director review.
 *
 * 'pending' is the default before the customer responds and isn't in this
 * map (it's not a "decision" yet, just absence of one).
 */
export const DECISIONS = [
  { value: 'lease',    label: 'Accepted — Lease',    nextPhase: 'leasing',          nextStep: 'submitted' },
  { value: 'finance',  label: 'Accepted — Finance',  nextPhase: 'leasing',          nextStep: 'submitted' },
  { value: 'purchase', label: 'Accepted — Purchase', nextPhase: 'pending_director', nextStep: 'awaiting_review' },
  { value: 'loan',     label: 'Accepted — Loan',     nextPhase: 'pending_director', nextStep: 'awaiting_review' },
  { value: 'declined', label: 'Declined',            nextPhase: null,               nextStep: null, closed: true },
];

/* ─────────────── Director decision constants (v31) ─────────────── */

/**
 * What a director can do with a deal sitting in `pending_director`. Mirrors
 * the shape of DECISIONS so consumers can treat the two uniformly.
 *
 *   - approved → deal advances to ops/customer_setup, deal_status stays 'active'
 *   - rejected → deal stays in pending_director (so it doesn't disappear from
 *                the rep's My Deals stepper), but deal_status flips to
 *                'rejected'. The rep can then resubmit, which clears the
 *                rejection and bumps resubmission_count.
 *
 * A reason note is OPTIONAL on approve, REQUIRED on reject (enforced in the
 * UI — the DB doesn't constrain this so a director with direct DB access
 * isn't blocked).
 */
export const DIRECTOR_DECISIONS = [
  { value: 'approved', label: 'Approve',  nextPhase: 'ops',              nextStep: 'customer_setup', requiresNotes: false },
  { value: 'rejected', label: 'Reject',   nextPhase: 'pending_director', nextStep: 'awaiting_review', requiresNotes: true },
];

/**
 * True when a deal's customer decision means it needs director approval.
 * Used by the UI to decide whether to show the "pending director" badge,
 * and by dealPipeline.js to know whether to stamp rep_director_email at
 * decision time.
 */
export function requiresDirectorApproval(customerDecision) {
  return customerDecision === 'purchase' || customerDecision === 'loan';
}

/**
 * True when the deal type / mode is eligible to be sent out as a customer
 * quote. Used by DealBuilder to gate the "Submit as Quote" button.
 *
 * v31: Loan Equipment is NOT quoteable. A loan is an internal arrangement
 * (Ronnoco-owned equipment, no money changes hands monthly), so there's
 * nothing for the customer to "accept" via a quote page. Loan deals go
 * directly through the deal flow (which routes through director review
 * via the existing purchase/loan customer_decision path), they don't
 * generate a customer-facing quote.
 */
export function isQuoteable(dealType) {
  if (!dealType) return true;   // empty/unset: allow, validate later
  return dealType !== 'Loan Equipment';
}

/* ─────────────── Stepper helpers ─────────────── */

/**
 * For a given (phase, currentStep), return the step status for every step in
 * the phase's sequence: 'past' | 'current' | 'future'.
 *
 * If currentStep is not in the phase's sequence (e.g. credit_denied in a
 * leasing deal), all steps are returned with status 'past' UP TO the point
 * the off-path step would've branched from, and the rest are 'future'. The
 * stepper component handles drawing the off-path marker separately.
 *
 * Edge cases:
 *   - phase not in PHASE_STEPS (e.g. null phase on a brand-new quote in sales)
 *     → returns empty array. Caller should hide the stepper.
 *   - currentStep is null → entire phase shown as 'future'. The deal is
 *     in the phase but no specific step has been recorded.
 *   - currentStep is past the last step in the phase (e.g. 'complete' in ops)
 *     → all steps marked 'past'. Caller can show a terminal badge.
 */
export function getStepStatuses(phase, currentStep) {
  const sequence = PHASE_STEPS[phase];
  if (!sequence) return [];

  const idx = sequence.indexOf(currentStep);

  // currentStep is null OR an off-sequence value (credit_denied, complete, etc.)
  if (idx === -1) {
    // For credit_denied specifically, mark everything through credit_received as past
    if (currentStep === 'credit_denied' && phase === 'leasing') {
      const branchIdx = sequence.indexOf('credit_received');
      return sequence.map((step, i) => ({
        key: step,
        label: STEP_LABELS[step] || step,
        status: i <= branchIdx ? 'past' : 'future',
      }));
    }
    // For 'complete' on an ops deal, mark all ops steps past
    if (currentStep === 'complete' && phase === 'ops') {
      return sequence.map((step) => ({
        key: step,
        label: STEP_LABELS[step] || step,
        status: 'past',
      }));
    }
    // Otherwise (null, unknown), show everything as future
    return sequence.map((step) => ({
      key: step,
      label: STEP_LABELS[step] || step,
      status: 'future',
    }));
  }

  // Normal case: currentStep is in the sequence
  return sequence.map((step, i) => ({
    key: step,
    label: STEP_LABELS[step] || step,
    status: i < idx ? 'past' : i === idx ? 'current' : 'future',
  }));
}

/** True when the given current_step represents a terminal denial/decline. */
export function isTerminalDenial(currentStep) {
  return currentStep === 'credit_denied';
}

/** True when the deal has rolled past the end of its phase (i.e. 'complete'). */
export function isPhaseComplete(phase, currentStep) {
  if (currentStep === 'complete') return true;
  const sequence = PHASE_STEPS[phase];
  if (!sequence || !currentStep) return false;
  // funded is the last leasing step but it triggers a phase move; treating it
  // as "complete" for the leasing stepper makes the UI feel right ("they're
  // done with financing").
  if (phase === 'leasing' && currentStep === 'funded') return true;
  if (phase === 'ops'     && currentStep === 'installation') return false; // last step but not "done" until ops complete
  return false;
}
