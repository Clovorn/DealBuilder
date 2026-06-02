import { useEffect, useMemo, useState } from 'react';
import {
  fetchTeamDeals,
  approveDeal,
  rejectDeal,
  isDealPipelineConfigured,
} from '../lib/dealPipeline.js';
import {
  DIRECTOR_DECISIONS,
  PHASE_LABELS,
  STEP_LABELS,
} from '../lib/pipelineSteps.js';
import DealDetailView from './DealDetailView.jsx';

/**
 * MyTeamPage — the director's (or admin's) approval workspace.
 *
 * Two stacked sections, both sourced from a single fetchTeamDeals call:
 *
 *   1. **Pending approvals** — the action queue. Deals where
 *      `phase === 'pending_director'` and `director_decision` is NULL or
 *      'pending'. These are deals that the customer accepted as Purchase or
 *      Loan and are now waiting on the director's go/no-go before they
 *      move to operations. Shown prominently at the top with Approve / Reject
 *      buttons on each row.
 *
 *   2. **Team activity** — the broader rep-grouped history. Every other
 *      deal the director has authority over, grouped by sales rep, collapsed
 *      by default. Each rep group expands to a small table of their deals
 *      with status badges, customer decision, director decision, and
 *      resubmission count if any. This is read-only — directors view team
 *      history here but act only on the queue above.
 *
 * Scope:
 *   - For directors (role === 'director'): always 'mine' scope. Shows only
 *     deals whose `rep_director_email` equals their session email.
 *   - For admins (role === 'admin'): defaults to 'all' scope (cross-team
 *     view) but offers a toggle to switch to 'mine' if the admin is also
 *     assigned as someone's director and wants their personal queue.
 *
 * Refresh model:
 *   - Initial fetch on mount.
 *   - After each approve/reject decision, refetch the full team list (one
 *     round-trip, simpler than splicing the updated row in). The decision
 *     modal closes itself; the page state stays put (no remount).
 */
export default function MyTeamPage({ profile, session, navigate }) {
  const role = profile?.role || 'sales';
  const isAdmin = role === 'admin';
  const myEmail = session?.user?.email || null;

  /* ─── Scope toggle ─── */
  // Admins default to 'all' (cross-director view); directors are locked to 'mine'.
  // Stored separately from the role check so an admin who is also a director
  // can flip back to their personal queue.
  const [scope, setScope] = useState(isAdmin ? 'all' : 'mine');

  /* ─── Data state ─── */
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ─── Decision modal state ─── */
  // When non-null, the modal is open and acting on this deal. The kind
  // ('approve' | 'reject') drives the modal's labels, color, and required-
  // notes behavior.
  const [pendingAction, setPendingAction] = useState(null);  // { deal, kind } | null

  /* ─── Rep group expansion state ─── */
  // Keys are rep emails. A rep group is expanded when its email is in this set.
  // Pending-queue items aren't grouped — only the activity section uses this.
  const [expandedReps, setExpandedReps] = useState(() => new Set());

  /* ─── Pending-queue expansion state (v31 follow-up) ─── */
  // Keys are deal IDs. When a queue row is expanded, the director sees the
  // full detail breakdown (equipment, contact, distributor, notes, economics)
  // inline beneath the row without leaving the page. Multiple rows can be
  // expanded at once — useful when comparing two pending deals side-by-side.
  const [expandedPending, setExpandedPending] = useState(() => new Set());

  /**
   * Load the team's deals. Called on mount, when scope changes, and after
   * any director action (approve / reject) so the queue reflects the new
   * state without remounting the page.
   */
  function loadDeals() {
    if (!isDealPipelineConfigured) {
      setError('Deal pipeline is not configured. Set VITE_DEAL_PIPELINE_URL and VITE_DEAL_PIPELINE_ANON_KEY in Netlify env vars.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchTeamDeals(myEmail, { scope })
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
          setDeals([]);
        } else {
          setDeals(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unknown error');
        setLoading(false);
      });
  }

  // Initial + scope-change fetch
  useEffect(() => {
    loadDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, myEmail]);

  /* ─── Pending queue & rep grouping (derived) ─── */

  // Pending = needs action from a director. The DB allows director_decision
  // to be NULL (never decided) or 'pending' (explicitly queued by a customer
  // decision handler that wants to be explicit). Both count.
  const pendingDeals = useMemo(
    () => deals.filter(
      (d) => d.phase === 'pending_director'
          && (d.director_decision == null || d.director_decision === 'pending')
    ),
    [deals]
  );

  // Activity = everything else the director has authority over. Could be
  // already-approved (in ops), already-rejected (waiting on the rep to fix),
  // or in some other phase entirely (e.g., a leasing deal that the director
  // is the rep's assigned director on — they can see it for context).
  const activityDeals = useMemo(
    () => deals.filter(
      (d) => !(d.phase === 'pending_director'
            && (d.director_decision == null || d.director_decision === 'pending'))
    ),
    [deals]
  );

  // Group activity deals by sales rep email so the section can render
  // one collapsible group per rep. Sort by group size desc so most-active
  // reps surface at the top.
  const repGroups = useMemo(() => {
    const map = new Map();
    for (const d of activityDeals) {
      const key = d.sales_rep_email || '(no rep)';
      if (!map.has(key)) {
        map.set(key, {
          email: key,
          name: d.sales_rep || key,
          deals: [],
        });
      }
      map.get(key).deals.push(d);
    }
    return Array.from(map.values()).sort((a, b) => b.deals.length - a.deals.length);
  }, [activityDeals]);

  /* ─── Action handlers ─── */

  function openApprove(deal) {
    setPendingAction({ deal, kind: 'approve' });
  }
  function openReject(deal) {
    setPendingAction({ deal, kind: 'reject' });
  }
  function closeModal() {
    setPendingAction(null);
  }

  /**
   * Actually invoke the director decision. The DecisionModal collects notes
   * + confirmation; this commits the call to the pipeline and refreshes.
   *
   * Returns void — the modal will display its own success/error state if
   * needed, but in practice success closes the modal and refreshes; errors
   * surface via the modal's submit handler.
   */
  async function submitDecision(kind, notes) {
    if (!pendingAction) return { error: { message: 'Nothing to submit' } };
    const deal = pendingAction.deal;
    const actor = profile?.display_name || myEmail || 'Director';
    const fn = kind === 'approve' ? approveDeal : rejectDeal;
    const { error: actionError } = await fn({
      dealId: deal.id,
      notes: notes || null,
      actor,
      currentRevision: deal.quote_revision || 0,
    });
    if (actionError) {
      return { error: actionError };
    }
    closeModal();
    loadDeals();
    return { ok: true };
  }

  function toggleRepExpansion(email) {
    setExpandedReps((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }

  function toggleDealExpansion(dealId) {
    setExpandedPending((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId); else next.add(dealId);
      return next;
    });
  }

  /* ─── Render ─── */

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6 max-w-5xl">
      <div className="mb-5 md:mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
            {isAdmin ? 'Admin' : 'Director'} Workspace
          </p>
          <h1 className="text-2xl md:text-3xl font-light text-slate-900">My team</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Approve or reject Purchase and Loan deals from your reps before they move to operations.
          </p>
        </div>

        {/* Scope toggle — admins only. Directors are locked to their own team. */}
        {isAdmin && (
          <div className="flex items-center gap-1 bg-page-100 rounded-md p-0.5 border border-page-200">
            <ScopeButton
              active={scope === 'mine'}
              onClick={() => setScope('mine')}
              label="My direct reports"
            />
            <ScopeButton
              active={scope === 'all'}
              onClick={() => setScope('all')}
              label="All teams"
            />
          </div>
        )}
      </div>

      {/* Configuration / fetch errors. Renders in both sections' place when present. */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ─── Pending approval queue ─── */}
      <PendingQueueSection
        deals={pendingDeals}
        loading={loading}
        onApprove={openApprove}
        onReject={openReject}
        expandedDeals={expandedPending}
        onToggleExpand={toggleDealExpansion}
      />

      {/* ─── Team activity, grouped by rep ─── */}
      <TeamActivitySection
        repGroups={repGroups}
        loading={loading}
        expandedReps={expandedReps}
        onToggleRep={toggleRepExpansion}
      />

      {/* ─── Decision modal ─── */}
      {pendingAction && (
        <DecisionModal
          action={pendingAction}
          onCancel={closeModal}
          onSubmit={(notes) => submitDecision(pendingAction.kind, notes)}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Scope toggle button ───────────────────────── */

function ScopeButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs uppercase tracking-wider font-medium rounded transition-colors
        ${active
          ? 'bg-white text-navy-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900'}`}
    >
      {label}
    </button>
  );
}

/* ───────────────────────── Pending queue ───────────────────────── */

function PendingQueueSection({ deals, loading, onApprove, onReject, expandedDeals, onToggleExpand }) {
  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <header className="bg-navy-900 text-chalk-50 px-4 md:px-5 py-3 flex items-center justify-between gap-3">
        <h2 className="text-sm md:text-base font-medium flex items-center gap-2">
          Pending approval
          {!loading && deals.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full bg-accent-500 text-navy-900 text-[11px] font-bold">
              {deals.length}
            </span>
          )}
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-chalk-300 font-medium">
          Action required
        </span>
      </header>

      <div className="p-4 md:p-5">
        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Loading queue…</div>
        ) : deals.length === 0 ? (
          <EmptyQueueState />
        ) : (
          <ul className="space-y-2">
            {deals.map((d) => (
              <PendingQueueRow
                key={d.id}
                deal={d}
                onApprove={() => onApprove(d)}
                onReject={() => onReject(d)}
                expanded={expandedDeals.has(d.id)}
                onToggleExpand={() => onToggleExpand(d.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyQueueState() {
  return (
    <div className="text-center py-8">
      <div className="w-12 h-12 rounded-full bg-page-50 border border-page-200
                      flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      </div>
      <p className="text-sm text-slate-700 font-medium mb-1">All caught up</p>
      <p className="text-xs text-slate-500">No deals waiting on your approval right now.</p>
    </div>
  );
}

function PendingQueueRow({ deal, onApprove, onReject, expanded, onToggleExpand }) {
  const customerName =
    deal.contact_name ||
    [deal.first_name, deal.last_name].filter(Boolean).join(' ') ||
    '(no name)';
  const location = [deal.city, deal.state].filter(Boolean).join(', ');
  const dealTypeRaw = deal.deal_type || '';
  const dealTypeShort = dealTypeRaw.replace(/ Equipment$/, '');
  const decisionLabel = deal.customer_decision
    ? deal.customer_decision[0].toUpperCase() + deal.customer_decision.slice(1)
    : '';
  const submittedAgo = formatRelativeTime(deal.customer_decision_at || deal.updated_at || deal.created_at);

  return (
    <li className={`bg-page-50 border rounded transition-colors overflow-hidden
                    ${expanded ? 'border-accent-500/60' : 'border-accent-500/30 hover:border-accent-500/60'}`}>
      <div className="p-3 md:p-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded
                               bg-accent-500/15 text-accent-700 text-[10px]
                               uppercase tracking-wider font-bold">
                {decisionLabel || 'Customer accepted'}
              </span>
              {deal.quote_number && (
                <span className="text-[11px] font-mono font-medium text-slate-700">
                  {deal.quote_number}
                </span>
              )}
              {deal.resubmission_count > 0 && (
                <span className="text-[10px] uppercase tracking-wider font-medium text-warn-700"
                      title="This deal has been resubmitted after a prior rejection">
                  Attempt {deal.resubmission_count + 1}
                </span>
              )}
            </div>
            <h3 className="text-sm md:text-base font-medium text-slate-900 truncate">
              {deal.store_name || customerName}
            </h3>
            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
              <span>{customerName}</span>
              {location && <><span>·</span><span>{location}</span></>}
              {dealTypeShort && <><span>·</span><span>{dealTypeShort}</span></>}
              {deal.total_eq_cost && <><span>·</span><span className="font-mono">{deal.total_eq_cost}</span></>}
              <span>·</span>
              <span>From {deal.sales_rep || deal.sales_rep_email || 'a rep'}</span>
              <span>·</span>
              <span>{submittedAgo}</span>
            </div>

            {/* If this is a resubmission, surface the rep's notes (lives in
                deal_revisions in the DB, but the most recent customer_decision_notes
                is reused for the resubmit message in v31's first cut). */}
            {deal.resubmission_count > 0 && deal.customer_decision_notes && (
              <div className="mt-2 text-xs text-slate-600 bg-white border border-page-200 rounded px-2 py-1.5">
                <span className="text-slate-500 font-medium">Rep's note: </span>
                {deal.customer_decision_notes}
              </div>
            )}
          </div>

          {/* Action buttons — stack on mobile, inline on desktop. The Details
              toggle sits to the left so the destructive/primary actions stay
              at the right edge where the eye expects them. */}
          <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
            <button
              onClick={onToggleExpand}
              aria-expanded={expanded}
              className="px-3 py-1.5 bg-white border border-page-300 text-slate-700
                         rounded text-xs font-medium hover:bg-page-100 hover:border-page-400
                         transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>{expanded ? 'Hide details' : 'Details'}</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              onClick={onReject}
              className="px-3 py-1.5 bg-white border border-page-300 text-slate-700
                         rounded text-xs font-medium hover:bg-red-50 hover:text-bad
                         hover:border-red-300 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              className="px-3 py-1.5 bg-navy-900 text-chalk-50 rounded text-xs
                         font-medium hover:bg-navy-800 transition-colors"
            >
              Approve →
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-accent-500/30 bg-white">
          <DealDetailView deal={deal} />
        </div>
      )}
    </li>
  );
}

/* ───── Pending-deal detail moved to DealDetailView.jsx (v32) ───── */

/* ───────────────────────── Team activity (rep-grouped) ───────────────────────── */

function TeamActivitySection({ repGroups, loading, expandedReps, onToggleRep }) {
  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden">
      <header className="bg-page-100 border-b border-page-200 px-4 md:px-5 py-3 flex items-center justify-between gap-3">
        <h2 className="text-sm md:text-base font-medium text-slate-900">
          Team activity
          {!loading && repGroups.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {repGroups.length} {repGroups.length === 1 ? 'rep' : 'reps'}
            </span>
          )}
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
          Read-only history
        </span>
      </header>

      <div className="p-4 md:p-5">
        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Loading activity…</div>
        ) : repGroups.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            No team activity yet. Once your reps submit and customers respond to quotes,
            their decisions will appear here.
          </p>
        ) : (
          <ul className="space-y-2">
            {repGroups.map((group) => (
              <RepGroup
                key={group.email}
                group={group}
                expanded={expandedReps.has(group.email)}
                onToggle={() => onToggleRep(group.email)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function RepGroup({ group, expanded, onToggle }) {
  const counts = useMemo(() => {
    const c = { approved: 0, rejected: 0, other: 0 };
    for (const d of group.deals) {
      if (d.director_decision === 'approved') c.approved += 1;
      else if (d.director_decision === 'rejected') c.rejected += 1;
      else c.other += 1;
    }
    return c;
  }, [group.deals]);

  return (
    <li className={`bg-page-50 border rounded transition-colors overflow-hidden
                    ${expanded ? 'border-navy-300' : 'border-page-200 hover:border-page-300'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 md:p-4 hover:bg-page-100/50 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-900 truncate">{group.name}</div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
              <span>{group.deals.length} deal{group.deals.length === 1 ? '' : 's'}</span>
              {counts.approved > 0 && (
                <span className="text-ok">{counts.approved} approved</span>
              )}
              {counts.rejected > 0 && (
                <span className="text-bad">{counts.rejected} rejected</span>
              )}
              {counts.other > 0 && (
                <span>{counts.other} other</span>
              )}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-page-200 bg-white overflow-x-auto">
          <table className="w-full text-xs md:text-sm">
            <thead className="bg-page-50 border-b border-page-200">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                <th className="px-3 py-2 font-medium">Store / Customer</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Director</th>
                <th className="px-3 py-2 font-medium text-right">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-page-200">
              {group.deals.map((d) => <RepDealRow key={d.id} deal={d} />)}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

function RepDealRow({ deal }) {
  const customerName =
    deal.contact_name ||
    [deal.first_name, deal.last_name].filter(Boolean).join(' ') ||
    '(no name)';
  const dealTypeShort = (deal.deal_type || '').replace(/ Equipment$/, '');
  return (
    <tr className="hover:bg-page-50/60 transition-colors">
      <td className="px-3 py-2">
        <div className="font-medium text-slate-900 truncate max-w-[16rem]">
          {deal.store_name || customerName}
        </div>
        <div className="text-[11px] text-slate-500 truncate max-w-[16rem]">
          {customerName}
          {deal.quote_number && <span className="ml-2 font-mono">{deal.quote_number}</span>}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{dealTypeShort || '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <CustomerDecisionBadge value={deal.customer_decision} />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <DirectorDecisionBadge value={deal.director_decision} resubmissions={deal.resubmission_count} />
      </td>
      <td className="px-3 py-2 text-right text-[11px] text-slate-500 whitespace-nowrap">
        {formatRelativeTime(deal.updated_at || deal.created_at)}
      </td>
    </tr>
  );
}

/* ───────────────────────── Decision modal ───────────────────────── */

/**
 * Modal that captures the director's notes (optional on approve, required
 * on reject) and confirms the action.
 *
 * Renders as a fixed overlay rather than a route — the page state behind
 * stays intact, and closing it is just a state flip in the parent. Escape
 * key closes it. The submit button is disabled while in-flight to prevent
 * double-clicks creating two audit rows.
 */
function DecisionModal({ action, onCancel, onSubmit }) {
  const { deal, kind } = action;
  const isReject = kind === 'reject';
  const spec = DIRECTOR_DECISIONS.find((d) => d.value === (isReject ? 'rejected' : 'approved'));
  const requiresNotes = spec?.requiresNotes || isReject;

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Close on Escape — common modal pattern, no library needed.
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape' && !submitting) onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel, submitting]);

  const notesValid = !requiresNotes || notes.trim().length > 0;

  async function handleSubmit() {
    setSubmitError(null);
    if (!notesValid) {
      setSubmitError('A reason is required when rejecting.');
      return;
    }
    setSubmitting(true);
    const { error } = await onSubmit(notes.trim() || null);
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message || 'Could not save the decision. Try again.');
    }
    // Success → parent closes the modal.
  }

  const customerName =
    deal.contact_name ||
    [deal.first_name, deal.last_name].filter(Boolean).join(' ') ||
    '(no name)';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
         onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-modal-title"
        className="bg-white rounded-lg shadow-elevated w-full max-w-md overflow-hidden animate-fadein"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`px-5 py-4 ${isReject ? 'bg-bad text-white' : 'bg-navy-900 text-chalk-50'}`}>
          <h2 id="decision-modal-title" className="text-base font-medium">
            {isReject ? 'Reject this deal' : 'Approve this deal'}
          </h2>
          <p className={`text-xs mt-0.5 ${isReject ? 'text-white/80' : 'text-chalk-300'}`}>
            {deal.store_name || customerName}
            {deal.quote_number && <span className="ml-2 font-mono">{deal.quote_number}</span>}
          </p>
        </header>

        <div className="p-5 space-y-4">
          <div className="text-sm text-slate-700 leading-relaxed">
            {isReject ? (
              <>
                Rejecting sends this back to <span className="font-medium">{deal.sales_rep || 'the rep'}</span>.
                They'll see your reason and can either revise or close the deal.
              </>
            ) : (
              <>
                Approving advances this to operations. The customer setup team will pick it up next.
              </>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
              {isReject ? 'Reason' : 'Notes (optional)'}
              {requiresNotes && <span className="text-bad ml-1">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              autoFocus
              disabled={submitting}
              placeholder={isReject
                ? 'Explain why — the rep sees this and uses it to fix or close the deal.'
                : 'Anything the operations team should know? Leave blank if not.'}
              className="w-full p-2.5 border border-page-300 rounded text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-navy-300 focus:border-navy-400
                         resize-none disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {submitError && (
            <div className="text-xs text-bad bg-red-50 border border-red-200 rounded p-2">
              {submitError}
            </div>
          )}
        </div>

        <footer className="bg-page-50 px-5 py-3 flex items-center justify-end gap-2 border-t border-page-200">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-page-100
                       rounded disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !notesValid}
            className={`px-4 py-2 text-sm font-medium text-white rounded
                        disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                        ${isReject
                          ? 'bg-bad hover:bg-red-700'
                          : 'bg-navy-900 hover:bg-navy-800'}`}
          >
            {submitting
              ? (isReject ? 'Rejecting…' : 'Approving…')
              : (isReject ? 'Reject deal' : 'Approve deal')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────────────────── Status badges ───────────────────────── */

function CustomerDecisionBadge({ value }) {
  if (!value || value === 'pending') {
    return <span className="text-[11px] text-slate-500">—</span>;
  }
  const map = {
    lease:    { label: 'Lease',    cls: 'bg-navy-50 text-navy-800 border-navy-200' },
    finance:  { label: 'Finance',  cls: 'bg-navy-50 text-navy-800 border-navy-200' },
    purchase: { label: 'Purchase', cls: 'bg-accent-500/15 text-accent-700 border-accent-500/30' },
    loan:     { label: 'Loan',     cls: 'bg-accent-500/15 text-accent-700 border-accent-500/30' },
    declined: { label: 'Declined', cls: 'bg-page-100 text-slate-600 border-page-200' },
  };
  const spec = map[value] || { label: value, cls: 'bg-page-100 text-slate-700 border-page-200' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-medium ${spec.cls}`}>
      {spec.label}
    </span>
  );
}

function DirectorDecisionBadge({ value, resubmissions }) {
  if (value === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-medium bg-ok/10 text-ok border-ok/30">
        Approved
      </span>
    );
  }
  if (value === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-medium bg-red-50 text-bad border-red-200">
        Rejected
        {resubmissions > 0 && (
          <span className="ml-1 font-normal text-slate-500 normal-case">· {resubmissions}× resubmitted</span>
        )}
      </span>
    );
  }
  if (value === 'pending') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-medium bg-warn/10 text-warn-700 border-warn/30">
        Pending
      </span>
    );
  }
  return <span className="text-[11px] text-slate-500">—</span>;
}

/* ───────────────────────── Formatting helpers ───────────────────────── */

/**
 * Same shape as MyDealsPage's formatRelativeTime — kept inline rather than
 * extracted to a util because it's small and the two pages don't share
 * any other code. If a third caller appears, lift to a shared util.
 */
function formatRelativeTime(isoString) {
  if (!isoString) return 'recently';
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1)   return 'just now';
  if (diffMin < 60)  return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24)   return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7)   return `${diffDay} days ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Note: PHASE_LABELS and STEP_LABELS are imported but currently unused —
 * they're available for future inline stepper rendering if we want to
 * expand the RepDealRow into a fuller detail view. Keeping the imports
 * documents the intent and avoids re-adding them later. */
void PHASE_LABELS;
void STEP_LABELS;
