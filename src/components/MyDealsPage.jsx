import { useEffect, useState } from 'react';
import { listMyDrafts, deleteDraft, renameDraft, insertDraft, defaultDraftName } from '../lib/draftStorage.js';
import {
  fetchMyDeals,
  fetchDealById,
  recordCustomerDecision,
  resubmitDeal,
  deleteDeal,
  canDeleteQuote,
  isDealPipelineConfigured,
} from '../lib/dealPipeline.js';
import { DECISIONS, getStepStatuses, isTerminalDenial, PHASE_LABELS, STEP_LABELS } from '../lib/pipelineSteps.js';
import DealDetailView from './DealDetailView.jsx';
import {
  fetchMyLeads, isLeadsPortalConfigured, leadStepLabel, bucketLeads,
  leadToDraftState, markLeadInProgress, revertLeadToActive, logLeadActivity,
  logRepContact, markLeadLost, fetchLeadActivity, findLeadByDealId,
} from '../lib/leadsPortal.js';
import { useDirector } from '../lib/useDirector.js';

/**
 * MyDealsPage — the rep's personal workspace.
 *
 * Two sections, each independently sourced:
 *
 *   1. **Drafts** — rows from the catalog DB's `deal_drafts` table, scoped
 *      by RLS to the current user. These are in-progress deal sheets the
 *      rep saved but didn't yet submit. Actions: Resume (re-opens the deal
 *      sheet hydrated with the saved state), Rename, Delete.
 *
 *   2. **Submitted** — rows from the pipeline DB's `deals` table, filtered
 *      by `sales_rep_email = session.user.email` (the rep stamps that on
 *      every submission so we can find their work later). Includes both
 *      quotes and direct-submit deals. Each row expands inline to show a
 *      detail panel:
 *        - Customer + store + equipment summary
 *        - Visual phase stepper (read-only) for the current process flow
 *        - For QUOTES (is_quote=true): Edit & re-send button + customer
 *          decision recorder (Lease/Finance/Purchase/Loan/Declined)
 *        - For DEALS (is_quote=false): read-only stepper, link to the
 *          Pipeline dashboard for anything beyond viewing
 *
 * The two sources are queried in parallel on mount. Each section renders
 * independently — a slow/failed pipeline query doesn't block the drafts
 * list (and vice-versa).
 */
export default function MyDealsPage({ profile, session, navigate }) {
  /* ─── Drafts state ─── */
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState(null);

  /* ─── Submissions state ─── */
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [submissionsError, setSubmissionsError] = useState(null);

  /* ─── UI state ─── */
  // Filter for the submissions section: 'all' | 'quote' | 'deal'.
  // Default 'all' so a rep landing here sees everything; they can narrow.
  const [submissionsFilter, setSubmissionsFilter] = useState('all');

  // Which submission row is currently expanded (deal id). Only one open at
  // a time — clicking another row closes the previous one. null = none open.
  const [expandedId, setExpandedId] = useState(null);

  /* ─── My Leads state ─── */
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState(null);
  const [expandedLeadId, setExpandedLeadId] = useState(null);
  const [leadsSearch, setLeadsSearch] = useState('');
  const [leadsStageFilter, setLeadsStageFilter] = useState('all'); // 'all' | 'needContact' | 'followUp'
  // Convert modal state
  const [convertTarget, setConvertTarget] = useState(null);    // lead row being converted
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState(null);
  // v33.2: deal type chosen in the convert modal. Drives phase routing
  // (see leadToDealPayload). Resets when the modal opens/closes.
  const [convertDealType, setConvertDealType] = useState('');

  // v33.2: the rep's assigned director, needed when converting a lead as
  // 'Loan Equipment' (lands in pending_director and needs rep_director_email
  // stamped so the director's My Team queue picks it up).
  const { director: myDirector } = useDirector();

  /* ─── v31 resubmit modal state ─── */
  // When non-null, the resubmit modal is open and pointing at this deal row.
  // The modal collects optional notes from the rep (e.g. "fixed the address
  // and tightened the equipment list per the director's note") and flips the
  // deal back into the director queue via resubmitDeal().
  const [resubmitTarget, setResubmitTarget] = useState(null);
  const [resubmitSubmitting, setResubmitSubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState(null);

  /**
   * Load both sections on mount and whenever the user changes (rare, but
   * defensive — if the session swaps under us we don't want to keep
   * showing the prior user's data).
   */
  useEffect(() => {
    let cancelled = false;
    // Drafts — RLS handles scoping, we just need to call.
    setDraftsLoading(true);
    listMyDrafts()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setDraftsError(error.message);
        setDrafts(data);
        setDraftsLoading(false);
      });
    // Submissions — explicit email filter.
    setSubmissionsLoading(true);
    fetchMyDeals(session?.user?.email)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setSubmissionsError(error.message);
        setSubmissions(data);
        setSubmissionsLoading(false);
      });

    // Leads from the Distributor Leads portal — matched by rep display name.
    // Only fetched for sales / non-admin roles; admins and directors see the
    // full pipeline via their own views so we don't clutter their workspace.
    const repName = profile?.display_name;
    if (repName && isLeadsPortalConfigured) {
      setLeadsLoading(true);
      fetchMyLeads(repName)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) setLeadsError(error.message);
          setLeads(data ?? []);
          setLeadsLoading(false);
        });
    } else {
      setLeadsLoading(false);
    }

    return () => { cancelled = true; };
  }, [session?.user?.email, profile?.display_name]);

  /**
   * Refresh a single submission row in place — used after the rep records a
   * customer decision so the row's badges + stepper update without re-fetching
   * the whole list (which would also blow away the expanded state).
   */
  async function refreshSubmission(dealId) {
    const { data, error } = await fetchDealById(dealId);
    if (error || !data) return;
    setSubmissions((prev) => prev.map((row) => (row.id === dealId ? { ...row, ...data } : row)));
  }

  /* ─── Action handlers ─── */

  function handleResume(draftId) {
    navigate('deal', { draftId });
  }

  function handleEditQuote(dealId) {
    navigate('deal', { editQuoteId: dealId });
  }

  function handleToggleExpand(dealId) {
    setExpandedId((prev) => (prev === dealId ? null : dealId));
  }

  /**
   * v31: open the resubmit modal pointing at a rejected deal row.
   *
   * Called from the rejected-deal banner inside DealActions. We snapshot
   * the row at the moment of opening so the modal renders the customer +
   * director-note context even if the underlying list re-orders mid-modal
   * (e.g. from a background refresh).
   */
  function openResubmitModal(row) {
    setResubmitError(null);
    setResubmitTarget(row);
  }

  /**
   * v31: submit the resubmit. Calls resubmitDeal() which:
   *   - clears director_decision back to null
   *   - flips deal_status from 'rejected' back to 'active'
   *   - leaves phase at 'pending_director' (queue stays the same)
   *   - bumps resubmission_count
   *   - writes a deal_revisions audit row with the rep's note
   *   - logs an activity row visible in the Pipeline dashboard
   *
   * On success, closes the modal, refreshes the affected row in place so
   * the pill flips from "Director rejected" to "Pending director · retry N",
   * and keeps the row expanded so the rep sees the updated state directly.
   * On failure, surfaces the error inside the modal (doesn't close).
   */
  async function submitResubmit(row, notes) {
    setResubmitError(null);
    setResubmitSubmitting(true);
    const actor = profile?.display_name || session?.user?.email || 'rep';
    const { error } = await resubmitDeal({
      dealId: row.id,
      notes: notes || null,
      actor,
      currentRevision: row.quote_revision || 1,
      currentResubmissionCount: row.resubmission_count || 0,
    });
    if (error) {
      setResubmitError(error.message || 'Resubmit failed.');
      setResubmitSubmitting(false);
      return;
    }
    setResubmitSubmitting(false);
    setResubmitTarget(null);
    await refreshSubmission(row.id);
    // Keep the row expanded so the rep sees the updated state — no nav change.
    setExpandedId(row.id);
  }

  /**
   * Convert a lead to a deal:
   *   1. Duplicate-check (jotform_submission_id uniqueness)
   *   2. Insert deal row into pipeline DB
   *   3. Stamp lead with deal_id + status='won'
   *   4. Log activity on both sides
   *   5. Navigate to My Deals so the rep sees their new deal
   */
  /**
   * v33.4: Convert a lead into a Deal Builder DRAFT (not a pipeline deals row).
   *
   * Why: a converted lead is still a deal-in-progress. The rep needs to add
   * equipment, terms, install dates, etc., before it should be visible to the
   * leasing/sales/ops pipeline. Pre-v33.4 we inserted a deals row immediately,
   * which made the deal appear in the Pipeline Dashboard's "Submitted" column
   * before any actual work was done — confusing for directors and for the rep.
   *
   * Flow:
   *   1. Duplicate check — has this lead already been converted?
   *      a) A draft with _fromLeadId = lead.id exists in deal_drafts, OR
   *      b) A deals row with jotform_submission_id = lead.jotform_submission_id
   *         exists in the pipeline (caught for safety even though the new flow
   *         won't create one until Submit).
   *   2. Build draft_state from the lead + chosen deal type.
   *   3. INSERT into deal_drafts (catalog DB, RLS-scoped to the rep).
   *   4. Stamp the lead as won with deal_id = draft.id as a placeholder.
   *      When the rep later clicks Submit in Deal Builder, that handler
   *      overwrites the lead's deal_id with the real deals.id (see the
   *      stampLeadConverted call in DealBuilder's submit path).
   *   5. Log activity on both sides.
   *   6. Navigate the rep straight to #/deal?draft=<id> so they land in the
   *      Builder ready to add equipment — they're mid-flow, the convert click
   *      shouldn't force a "now go find your draft" step.
   */
  async function handleConvertLead(lead) {
    setConvertError(null);
    setConverting(true);
    try {
      // ── Step 1 — duplicate check ────────────────────────────────────────
      // 1a. Already a draft? (the new common case)
      const { data: existingDrafts } = await supabaseSafeRpc(async () => {
        const { supabase } = await import('../lib/supabase.js');
        return supabase
          .from('deal_drafts')
          .select('id, draft_name')
          .filter('draft_state->>_fromLeadId', 'eq', lead.id)
          .limit(1);
      });
      if (existingDrafts && existingDrafts.length > 0) {
        const existing = existingDrafts[0];
        setConvertError(
          `This lead is already a draft ("${existing.draft_name}"). ` +
          `Open it from the Drafts tab to continue.`
        );
        setConverting(false);
        return;
      }
      // 1b. Already a submitted deal? (legacy data + safety net)
      if (lead.jotform_submission_id) {
        const { data: existing } = await import('../lib/dealPipeline.js').then(m =>
          m.dealPipeline
            ? m.dealPipeline.from('deals')
                .select('id')
                .eq('jotform_submission_id', lead.jotform_submission_id)
                .maybeSingle()
            : { data: null }
        );
        if (existing?.id) {
          setConvertError(
            `This lead is already a submitted deal (ID: ${existing.id.slice(0, 8)}…). ` +
            `Check the Submissions tab or the Pipeline Dashboard.`
          );
          setConverting(false);
          return;
        }
      }

      // ── Step 2 — build draft state ──────────────────────────────────────
      const draftState = leadToDraftState(lead, convertDealType);
      // Sensible default name so the Drafts list reads naturally.
      const storeName = draftState.store_name?.trim();
      const draftName = storeName
        ? `${storeName} — from lead`
        : defaultDraftName(draftState);

      // ── Step 3 — insert draft ───────────────────────────────────────────
      // submit_mode default: Loan deals can't be quoted (isQuoteable === false),
      // so seed them in 'deal' mode. Everything else seeds in 'quote' to match
      // the typical workflow (rep usually sends a quote first).
      const submitMode = convertDealType === 'Loan Equipment' ? 'deal' : 'quote';
      const { data: newDraft, error: draftError } = await insertDraft({
        userId:         session?.user?.id,
        email:          session?.user?.email || '',
        submitMode,
        draft:          draftState,
        equipmentItems: [],          // rep adds equipment in the Builder
        draftName,
      });
      if (draftError || !newDraft) {
        setConvertError(`Couldn't create draft: ${draftError?.message || 'Unknown error'}`);
        setConverting(false);
        return;
      }

      // ── Step 4 — mark lead in_progress (best-effort) ───────────────────
      // We store the draft id in lead.deal_id as a placeholder, and switch
      // status to 'in_progress' so the lead disappears from the rep's
      // active leads queue (which filters by status='active'). The real
      // deals.id and status='won' will be stamped when DealBuilder submits
      // (see DealBuilder.restampLeadIfFromLead).
      //
      // If the rep later deletes the draft before submitting, we revert
      // the lead to 'active' so it reappears in their queue (see the
      // draft-delete handler below).
      const { error: stampError } = await markLeadInProgress(lead.id, newDraft.id);
      if (stampError) {
        // Draft created, lead not stamped. Warn but don't undo — the rep
        // can still find the draft in their Drafts tab. The lead will
        // still appear in their active leads list, which means they could
        // convert it twice; admin should keep an eye out.
        setConvertError(
          `Draft created ("${newDraft.draft_name}") but couldn't mark the lead ` +
          `as in-progress. The lead may still appear in your active leads list.`
        );
        // Continue — don't return.
      }

      // ── Step 5 — activity logs (best-effort) ───────────────────────────
      // logLeadActivity signature: (leadId, actorRole, action, fromStep, toStep, note)
      await logLeadActivity(
        lead.id,
        'ronnoco_rep',
        `Converted to Deal Builder draft (${convertDealType})`,
        lead.current_step,
        null,
        `Draft ID: ${newDraft.id}`
      );

      // ── Step 6 — refresh drafts list + navigate ────────────────────────
      // Pull the fresh draft list so the count badge on the Drafts tab is
      // accurate when the rep eventually navigates back.
      const { data: refreshedDrafts } = await listMyDrafts();
      if (refreshedDrafts) setDrafts(refreshedDrafts);

      // Drop the lead from the in-memory leads list (it's now WON in the
      // portal and won't come back on next fetch anyway).
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));

      // Close the modal cleanly.
      setConvertTarget(null);
      setConvertDealType('');
      setConverting(false);

      // Send the rep straight into the Deal Builder, draft pre-loaded. They
      // were in convert flow → most natural next step is to keep building.
      navigate('deal', { draftId: newDraft.id });
    } catch (err) {
      setConvertError(`Unexpected error: ${err.message}`);
      setConverting(false);
    }
  }

  // Small wrapper used by the duplicate-check step. The supabase client lives
  // in a module-level singleton; wrapping the import in a function lets us
  // tolerate it not being configured (returns {data:null} silently rather
  // than throwing — the duplicate check just won't fire and we'll insert).
  async function supabaseSafeRpc(fn) {
    try {
      const { data } = await fn();
      return { data };
    } catch (err) {
      console.warn('Duplicate check skipped:', err.message);
      return { data: null };
    }
  }

  async function handleDelete(draft) {
    // v33.5: if this draft was created by converting a Distributor Lead, the
    // lead is currently parked in status='in_progress'. Surface that in the
    // confirm dialog so the rep knows the lead will come back to their queue.
    const fromLeadId = draft.draft_state?._fromLeadId || null;
    const ok = window.confirm(
      fromLeadId
        ? `Delete draft "${draft.draft_name}"?\n\n` +
          `This lead will return to your active leads list so you can re-convert ` +
          `or mark it lost later.`
        : `Delete draft "${draft.draft_name}"? This can't be undone.`
    );
    if (!ok) return;

    const { error } = await deleteDraft(draft.id);
    if (error) {
      window.alert(`Could not delete: ${error.message}`);
      return;
    }

    // v33.5: revert the parked lead so the rep can find it again.
    // Best-effort: failure leaves the lead stuck in 'in_progress', which the
    // rep can resolve by re-creating a draft via Convert or by an admin
    // bumping the lead's status manually. We log a warning but don't block.
    if (fromLeadId) {
      try {
        const { error: revertErr } = await revertLeadToActive(fromLeadId);
        if (revertErr) console.warn('Could not revert lead to active:', revertErr);
        await logLeadActivity(
          fromLeadId,
          'ronnoco_rep',
          'Deal Builder draft deleted; lead returned to active',
          null,
          null,
          `Deleted draft: ${draft.draft_name}`
        );
        // Re-fetch leads so the rep sees the lead reappear immediately.
        if (profile?.display_name && isLeadsPortalConfigured) {
          const { data: refreshed } = await fetchMyLeads(profile.display_name);
          if (refreshed) setLeads(refreshed);
        }
      } catch (err) {
        console.warn('Lead revert failed unexpectedly:', err);
      }
    }

    // Optimistic local removal — re-fetching would be heavier and the row
    // is already gone from the DB.
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
  }

  async function handleRename(draft) {
    const newName = window.prompt(`Rename "${draft.draft_name}" to:`, draft.draft_name);
    if (newName == null) return;                       // cancelled
    const trimmed = newName.trim();
    if (!trimmed || trimmed === draft.draft_name) return;
    const { data, error } = await renameDraft(draft.id, trimmed);
    if (error) {
      window.alert(`Could not rename: ${error.message}`);
      return;
    }
    setDrafts((prev) => prev.map((d) => (d.id === draft.id ? data : d)));
  }

  /**
   * Submit a customer decision for a quote. Wires the DECISIONS spec
   * through recordCustomerDecision (which handles the column updates and
   * audit log) and refreshes the row when done.
   */
  async function handleDecision(row, decisionValue, notes) {
    const decision = DECISIONS.find((d) => d.value === decisionValue);
    if (!decision) {
      window.alert(`Unknown decision: ${decisionValue}`);
      return { error: 'unknown decision' };
    }
    const actor = profile?.display_name || session?.user?.email || 'rep';
    const { data, error } = await recordCustomerDecision({
      dealId: row.id,
      decision,
      notes: notes || null,
      actor,
      currentRevision: row.quote_revision || 1,
    });
    if (error) {
      window.alert(`Could not record decision: ${error.message}`);
      return { error };
    }
    await refreshSubmission(row.id);
    return { data };
  }

  /**
   * Delete a quote permanently. Eligibility is enforced both at the UI layer
   * (button only renders when canDeleteQuote returns true) and again here as
   * defense in depth — never trust the UI to gate destructive ops.
   *
   * Order of operations matters:
   *   1. Reset the originating Distributor Lead first, if any. The lead
   *      points to the deal via lead.deal_id; if we destroyed the deal
   *      before resetting the lead, the lead would be stranded showing
   *      status='won' with a dangling deal_id. Best-effort — failures here
   *      log a warning but don't block the deletion the rep asked for.
   *   2. Delete the deal row. FK cascades clean up activity/revisions/
   *      bundles/notifications automatically (verified against the
   *      pipeline schema).
   *   3. Remove the row from local state so the UI reflects the deletion
   *      without waiting for a full refetch.
   */
  async function handleDeleteQuote(row) {
    if (!canDeleteQuote(row)) {
      window.alert("This quote can't be deleted — only declined quotes or quotes the customer hasn't viewed are eligible.");
      return { error: 'not eligible' };
    }

    // 1) If this deal came from a converted lead, reset the lead first.
    //    Best-effort — leads-portal hiccups shouldn't block the delete.
    try {
      const { data: lead } = await findLeadByDealId(row.id);
      if (lead?.id) {
        await revertLeadToActive(lead.id);
        await logLeadActivity(
          lead.id,
          'ronnoco_rep',
          'Quote deleted — lead returned to active',
          null,
          null,
          `Deal ${row.quote_number || row.id} was deleted by the rep; lead reopened for re-conversion.`,
        );
      }
    } catch (err) {
      // Don't block the user's destructive action over a logging miss.
      console.warn('Lead reset on delete failed (non-fatal):', err);
    }

    // 2) Delete the deal (cascades to activity/revisions/bundles/notifications).
    const { error } = await deleteDeal(row.id);
    if (error) {
      window.alert(`Could not delete quote: ${error.message}`);
      return { error };
    }

    // 3) Drop the row from local state so the UI updates immediately.
    setSubmissions((prev) => prev.filter((s) => s.id !== row.id));
    return { data: { ok: true } };
  }

  /* ─── Render ─── */

  const filteredSubmissions = submissions.filter((row) => {
    if (submissionsFilter === 'all') return true;
    if (submissionsFilter === 'quote') return row.is_quote === true;
    if (submissionsFilter === 'deal')  return row.is_quote !== true;
    return true;
  });

  // Derived counts for the tab badges
  const leadsCount       = leads.length;
  const draftsCount      = drafts.length;
  const submissionsCount = submissions.length;
  const needsAction      = submissions.filter((r) =>
    r.is_quote && r.customer_decision === 'pending'
  ).length;

  // Default tab: leads if the rep has any, otherwise submissions
  const [activeTab, setActiveTab] = useState(() =>
    leadsCount > 0 ? 'leads' : 'submissions'
  );

  function handleLeadUpdated(leadId, patch) {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, ...patch } : l));
    if (patch.status && patch.status !== 'active') {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    }
  }

  const TABS = [
    {
      id: 'leads',
      label: 'My Leads',
      count: leadsCount,
      dot: leadsCount > 0,
      dotColor: 'bg-emerald-500',
      show: true,
    },
    {
      id: 'drafts',
      label: 'Drafts',
      count: draftsCount,
      dot: false,
      show: true,
    },
    {
      id: 'submissions',
      label: 'Quotes & Deals',
      count: submissionsCount,
      dot: needsAction > 0,
      dotColor: 'bg-amber-500',
      show: true,
    },
  ];

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6 max-w-5xl">

      {/* ─── Page header ─── */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">Workspace</p>
          <h1 className="text-2xl md:text-3xl font-light text-slate-900">My workspace</h1>
        </div>
        <button
          onClick={() => navigate('deal')}
          className="self-start sm:self-auto px-4 py-2 bg-navy-900 text-chalk-50 text-sm
                     font-medium rounded hover:bg-navy-800 transition-colors whitespace-nowrap"
        >
          + New deal
        </button>
      </div>

      {/* ─── Summary stat cards ─── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCard
          label="Active leads"
          value={leadsLoading ? '—' : leadsCount}
          sub={leadsLoading ? '' : leadsCount === 0 ? 'None assigned' : 'Needs action'}
          color="emerald"
          onClick={() => setActiveTab('leads')}
          active={activeTab === 'leads'}
        />
        <StatCard
          label="Drafts"
          value={draftsLoading ? '—' : draftsCount}
          sub={draftsLoading ? '' : draftsCount === 0 ? 'None saved' : 'In progress'}
          color="slate"
          onClick={() => setActiveTab('drafts')}
          active={activeTab === 'drafts'}
        />
        <StatCard
          label="Submitted"
          value={submissionsLoading ? '—' : submissionsCount}
          sub={needsAction > 0 ? `${needsAction} awaiting decision` : 'Quotes & deals'}
          color={needsAction > 0 ? 'amber' : 'slate'}
          onClick={() => setActiveTab('submissions')}
          active={activeTab === 'submissions'}
        />
      </div>

      {/* ─── Tab bar ─── */}
      <div className="flex border-b border-page-200 mb-4 gap-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium
                        border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-navy-900 text-navy-900'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                activeTab === tab.id
                  ? 'bg-navy-100 text-navy-800'
                  : 'bg-page-100 text-slate-500'
              }`}>
                {tab.count}
              </span>
            )}
            {tab.dot && (
              <span className={`w-1.5 h-1.5 rounded-full ${tab.dotColor}`} />
            )}
          </button>
        ))}
      </div>

      {/* ─── Tab panels ─── */}

      {activeTab === 'leads' && (
        <MyLeadsSection
          leads={leads}
          loading={leadsLoading}
          error={leadsError}
          search={leadsSearch}
          onSearchChange={setLeadsSearch}
          stageFilter={leadsStageFilter}
          onStageFilterChange={setLeadsStageFilter}
          expandedLeadId={expandedLeadId}
          onToggleExpand={(id) => setExpandedLeadId((prev) => (prev === id ? null : id))}
          onConvert={(lead) => {
            setConvertError(null);
            setConvertDealType('');
            setConvertTarget(lead);
          }}
          onLeadUpdated={handleLeadUpdated}
        />
      )}

      {activeTab === 'drafts' && (
        <DraftsSection
          drafts={drafts}
          loading={draftsLoading}
          error={draftsError}
          onResume={handleResume}
          onDelete={handleDelete}
          onRename={handleRename}
          onStartNew={() => navigate('deal')}
        />
      )}

      {activeTab === 'submissions' && (
        <SubmissionsSection
          rows={filteredSubmissions}
          totalCount={submissions.length}
          loading={submissionsLoading}
          error={submissionsError}
          filter={submissionsFilter}
          onFilterChange={setSubmissionsFilter}
          configured={isDealPipelineConfigured}
          expandedId={expandedId}
          onToggleExpand={handleToggleExpand}
          onEditQuote={handleEditQuote}
          onDecision={handleDecision}
          onResubmit={openResubmitModal}
          onDelete={handleDeleteQuote}
        />
      )}

      {/* Modals — always rendered at page level so overlays aren't clipped */}
      {convertTarget && (
        <ConvertLeadModal
          lead={convertTarget}
          converting={converting}
          error={convertError}
          dealType={convertDealType}
          onDealTypeChange={setConvertDealType}
          hasDirector={!!myDirector?.director_email}
          onCancel={() => {
            setConvertTarget(null);
            setConvertError(null);
            setConvertDealType('');
          }}
          onConfirm={() => handleConvertLead(convertTarget)}
        />
      )}
      {resubmitTarget && (
        <ResubmitModal
          row={resubmitTarget}
          submitting={resubmitSubmitting}
          error={resubmitError}
          onCancel={() => { setResubmitTarget(null); setResubmitError(null); }}
          onSubmit={(notes) => submitResubmit(resubmitTarget, notes)}
        />
      )}
    </div>
  );
}

/* ───────────────────────── My Leads section ───────────────────────── */

const LEADS_PORTAL_URL = 'https://distributorleads.netlify.app';
const STALE_DAYS = 14;

function isStale(lastActivityAt) {
  if (!lastActivityAt) return false;
  const diffMs = Date.now() - new Date(lastActivityAt).getTime();
  return diffMs > STALE_DAYS * 24 * 60 * 60 * 1000;
}

function staleDays(lastActivityAt) {
  if (!lastActivityAt) return 0;
  return Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Shows unconverted leads from the Distributor Leads portal assigned to the
 * logged-in rep. Grouped into action buckets with search + stage filter.
 */
function MyLeadsSection({
  leads, loading, error,
  search, onSearchChange,
  stageFilter, onStageFilterChange,
  expandedLeadId, onToggleExpand, onConvert, onLeadUpdated,
}) {
  // Apply search filter
  const q = (search || '').toLowerCase().trim();
  const filtered = q
    ? leads.filter((l) => [
        l.dba_name, l.legal_business_name, l.customer_full_name,
        l.contact_email, l.phone, l.contact_number, l.customer_interest,
      ].some((v) => (v || '').toLowerCase().includes(q)))
    : leads;

  const { needContact, inFollowUp, other } = bucketLeads(filtered);

  const showNeed   = stageFilter === 'all' || stageFilter === 'needContact';
  const showFollow = stageFilter === 'all' || stageFilter === 'followUp';

  const totalVisible =
    (showNeed   ? needContact.length : 0) +
    (showFollow ? inFollowUp.length  : 0) +
    (stageFilter === 'all' ? other.length : 0);

  // Hide the whole section if portal is configured but there are truly no leads
  // (not loading, no error). Empty-state is shown only when section is visible.
  if (!loading && !error && leads.length === 0) {
    return (
      <div className="p-6 text-center bg-white border border-page-200 rounded-lg">
        <p className="text-sm text-slate-500">
          No new leads right now. Your director will route leads to you here.
        </p>
      </div>
    );
  }

  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">

      <div className="p-4 md:p-5">
        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Loading leads…</div>
        ) : error ? (
          <div className="text-sm text-bad p-3 bg-red-50 border border-red-200 rounded">
            Couldn’t load leads: {error}
          </div>
        ) : (
          <>
            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="search"
                placeholder="Search leads…"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="flex-1 text-sm border border-page-200 rounded px-3 py-1.5
                           placeholder-slate-400 focus:outline-none focus:border-emerald-400"
              />
              <div className="flex gap-1">
                {[['all', 'All'], ['needContact', 'Need contact'], ['followUp', 'Follow-up']].map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => onStageFilterChange(val)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                      stageFilter === val
                        ? 'bg-emerald-700 text-white'
                        : 'bg-page-50 border border-page-200 text-slate-600 hover:border-emerald-300'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {totalVisible === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No leads match your filter.</p>
            ) : (
              <div className="space-y-4">
                {showNeed && needContact.length > 0 && (
                  <LeadBucket
                    title="Need first contact"
                    leads={needContact}
                    expandedLeadId={expandedLeadId}
                    onToggleExpand={onToggleExpand}
                    onConvert={onConvert}
                    onLeadUpdated={onLeadUpdated}
                  />
                )}
                {showFollow && inFollowUp.length > 0 && (
                  <LeadBucket
                    title="In follow-up"
                    leads={inFollowUp}
                    expandedLeadId={expandedLeadId}
                    onToggleExpand={onToggleExpand}
                    onConvert={onConvert}
                    onLeadUpdated={onLeadUpdated}
                  />
                )}
                {stageFilter === 'all' && other.length > 0 && (
                  <LeadBucket
                    title="Other"
                    leads={other}
                    expandedLeadId={expandedLeadId}
                    onToggleExpand={onToggleExpand}
                    onConvert={onConvert}
                    onLeadUpdated={onLeadUpdated}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function LeadsSectionHeader({ totalActive, loading }) {
  return (
    <header className="bg-emerald-800 text-white px-4 md:px-5 py-3 flex items-center justify-between gap-3">
      <h2 className="text-sm md:text-base font-medium flex items-center gap-2">
        <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        My Leads
        {!loading && totalActive > 0 && (
          <span className="ml-1 text-xs font-normal text-emerald-200">
            {totalActive} active
          </span>
        )}
      </h2>
      <span className="text-xs text-emerald-200 font-normal">From Distributor Leads portal</span>
    </header>
  );
}

function LeadBucket({ title, leads, expandedLeadId, onToggleExpand, onConvert, onLeadUpdated }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        {title} <span className="font-normal normal-case">({leads.length})</span>
      </h3>
      <ul className="space-y-2">
        {leads.map((lead) => (
          <LeadRow
            key={lead.id}
            lead={lead}
            expanded={expandedLeadId === lead.id}
            onToggle={() => onToggleExpand(lead.id)}
            onConvert={() => onConvert(lead)}
            onLeadUpdated={onLeadUpdated}
          />
        ))}
      </ul>
    </div>
  );
}

function LeadRow({ lead, expanded, onToggle, onConvert, onLeadUpdated }) {
  const businessName = lead.dba_name || lead.legal_business_name || lead.customer_full_name || 'Unknown business';

  // Contact name derivation. Prefer the structured first/last fields when
  // present — they're more reliable than customer_full_name, which on some
  // Jotform imports got stuffed with the business name (e.g. an "Island
  // Oasis #4" lead where customer_full_name = "Island Oasis #4" and the
  // real contact lived in customer_first_name/customer_last_name).
  //
  // Fall back to customer_full_name only if the structured fields are empty,
  // and suppress the line entirely if the resulting name matches the business
  // name (which means we have no real contact info, not a useful duplicate).
  const fromParts = [lead.customer_first_name, lead.customer_last_name]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(' ');
  let contactName = fromParts || (lead.customer_full_name || '').trim();
  if (contactName && contactName.toLowerCase() === businessName.toLowerCase()) {
    contactName = null;
  }

  // Phone + email for click-to-call / mailto. tel: links honor the raw
  // digits — formatted strings like "(989) 916-8656" work fine in modern
  // browsers and on iOS/Android, but we strip everything except digits and
  // a leading + for the href to be safe.
  const phoneDisplay = (lead.phone || lead.contact_number || '').trim() || null;
  const phoneHref    = phoneDisplay
    ? `tel:${phoneDisplay.replace(/[^\d+]/g, '')}`
    : null;
  const emailDisplay = (lead.contact_email || '').trim() || null;
  const emailHref    = emailDisplay ? `mailto:${emailDisplay}` : null;

  const step         = leadStepLabel(lead.current_step);
  const stale        = isStale(lead.last_activity_at);
  const staleDaysAgo = stale ? staleDays(lead.last_activity_at) : 0;
  const lastActivity = lead.last_activity_at
    ? formatRelativeTime(lead.last_activity_at)
    : lead.created_at ? formatRelativeTime(lead.created_at) : null;

  // The whole row is a <button> that toggles expand/collapse. Phone/email
  // links sit inside it, so we stop propagation on link clicks — otherwise
  // tapping the phone number would expand the card instead of placing the
  // call.
  const stopToggle = (e) => e.stopPropagation();

  return (
    <li className="bg-page-50 border border-page-200 rounded overflow-hidden hover:border-emerald-300 transition-colors">
      {/* Summary row.

          This is a <div> rather than a <button> on purpose: the click-to-call
          and mailto links inside are <a> tags, and <a> inside <button> is
          invalid HTML (browser behavior is undefined — some strip the link,
          some break both). The div carries explicit button semantics — role,
          tabIndex, Enter/Space keyboard handling — so screen readers and
          keyboard users still see it as one big toggle target. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full text-left px-3 md:px-4 py-3 flex items-start justify-between gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-inset"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium
                             bg-emerald-100 text-emerald-800">
              {step}
            </span>
            {stale && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px]
                               font-medium bg-amber-100 text-amber-700">
                ⚠ {staleDaysAgo}d idle
              </span>
            )}
            {lead.tradeshow_lead && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium
                               bg-blue-100 text-blue-700">
                Tradeshow
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-900 truncate">{businessName}</p>
          {/* Contact name — bumped to its own line and given more weight
              than before so the rep doesn't have to expand the card to know
              who to ask for when they call. */}
          {contactName && (
            <p className="text-sm text-slate-700 truncate mt-0.5">{contactName}</p>
          )}
          {/* Email link, kept inline since most reps will call first and only
              email as a fallback. The phone number gets a dedicated tap-target
              button on the right side of the card — see below. */}
          {emailHref && (
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <a
                href={emailHref}
                onClick={stopToggle}
                className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 hover:underline truncate min-w-0"
                title={`Email ${contactName || businessName}`}
              >
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M3 8l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z" />
                </svg>
                <span className="truncate">{emailDisplay}</span>
              </a>
            </div>
          )}
          {lead.customer_interest && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{lead.customer_interest}</p>
          )}
          {lead.jotform_submission_id && (
            <p className="text-[11px] font-mono text-slate-400 mt-0.5">HTH: {lead.jotform_submission_id}</p>
          )}
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          {lastActivity && (
            <span className="text-xs text-slate-400 hidden md:inline">{lastActivity}</span>
          )}
          {/* Dedicated Call button. Sits on the right of the card so the rep
              has a big, finger-friendly tap target instead of a small inline
              text link. The button shows the phone number alongside the icon
              so they can read it before tapping. stopToggle prevents the
              card-expand handler from firing when the button is tapped. */}
          {phoneHref && (
            <a
              href={phoneHref}
              onClick={stopToggle}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-md
                         bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800
                         text-white text-sm font-medium whitespace-nowrap
                         transition-colors shadow-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-300"
              title={`Call ${contactName || businessName} at ${phoneDisplay}`}
              aria-label={`Call ${contactName || businessName} at ${phoneDisplay}`}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                      d="M3 5a2 2 0 0 1 2-2h2.28a1 1 0 0 1 .95.68l1.5 4.49a1 1 0 0 1-.5 1.21l-1.78.89a11 11 0 0 0 5.6 5.6l.89-1.78a1 1 0 0 1 1.21-.5l4.49 1.5a1 1 0 0 1 .68.95V19a2 2 0 0 1-2 2h-1C9.61 21 3 14.39 3 6V5Z" />
              </svg>
              <span className="hidden sm:inline">{phoneDisplay}</span>
            </a>
          )}
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded detail + interaction panel */}
      {expanded && (
        <LeadDetailPanel
          lead={lead}
          onConvert={onConvert}
          onLeadUpdated={onLeadUpdated}
        />
      )}
    </li>
  );
}

/* ───────────────────────── Lead detail + interaction panel ───────────────────────── */

const CONTACT_METHODS = [
  { value: 'call',  label: '☎ Call' },
  { value: 'email', label: '✉ Email' },
  { value: 'text',  label: '💬 Text' },
  { value: 'visit', label: '⌂ In-person' },
];

function LeadDetailPanel({ lead, onConvert, onLeadUpdated }) {
  // Local copy of the lead so optimistic updates render immediately
  const [localLead, setLocalLead] = useState(lead);
  // Contact logger state
  const [method, setMethod] = useState('call');
  const [reached, setReached] = useState(false);
  const [note, setNote] = useState('');
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState(null);
  const [logSuccess, setLogSuccess] = useState(null);
  // Activity feed
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  // Mark lost
  const [lostReason, setLostReason] = useState('');
  const [showLostForm, setShowLostForm] = useState(false);
  const [markingLost, setMarkingLost] = useState(false);

  // Load activity on mount
  useEffect(() => {
    setActivityLoading(true);
    fetchLeadActivity(lead.id).then(({ data }) => {
      setActivity(data);
      setActivityLoading(false);
    });
  }, [lead.id]);

  // Keep localLead in sync when parent re-renders (e.g. after bucket refresh)
  useEffect(() => { setLocalLead(lead); }, [lead]);

  async function handleLogContact() {
    if (!note.trim()) { setLogError('Describe what happened.'); return; }
    setLogError(null);
    setLogSuccess(null);
    setLogging(true);

    const { toStep, error } = await logRepContact({
      leadId: localLead.id,
      currentStep: localLead.current_step,
      method,
      reached,
      note: note.trim(),
    });

    if (error) {
      setLogError(`Couldn’t save: ${error.message}`);
      setLogging(false);
      return;
    }

    const stepped = toStep !== localLead.current_step;
    const successMsg = stepped
      ? `Logged — moved to “${leadStepLabel(toStep)}”`
      : 'Contact attempt logged.';

    // Optimistic update
    const patch = { current_step: toStep, last_activity_at: new Date().toISOString() };
    setLocalLead((prev) => ({ ...prev, ...patch }));
    onLeadUpdated(localLead.id, patch);

    // Prepend to activity feed
    const METHOD_LABELS = { call: 'Call', email: 'Email', text: 'Text', visit: 'In-person' };
    const action = stepped
      ? `${METHOD_LABELS[method]} — reached customer: ${leadStepLabel(toStep)}`
      : `${METHOD_LABELS[method]} — ${reached ? 'reached customer' : 'attempted contact'}`;
    setActivity((prev) => [{
      id: `tmp-${Date.now()}`,
      action,
      actor_role: 'ronnoco_rep',
      from_step: localLead.current_step,
      to_step: stepped ? toStep : null,
      note: note.trim(),
      created_at: new Date().toISOString(),
    }, ...prev]);

    setNote('');
    setReached(false);
    setLogging(false);
    setLogSuccess(successMsg);
    setTimeout(() => setLogSuccess(null), 4000);
  }

  async function handleMarkLost() {
    if (!lostReason.trim()) { setLogError('Please enter a reason.'); return; }
    setMarkingLost(true);
    const { error } = await markLeadLost(localLead.id, localLead.current_step, lostReason.trim());
    if (error) {
      setLogError(`Couldn’t mark lost: ${error.message}`);
      setMarkingLost(false);
      return;
    }
    onLeadUpdated(localLead.id, { status: 'lost' });
    setMarkingLost(false);
  }

  const phone = localLead.phone || localLead.contact_number;

  return (
    <div className="border-t border-page-200 bg-white">
      {/* Info grid */}
      <div className="px-3 md:px-4 pt-3 pb-2">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {localLead.contact_email && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Email</dt>
              <dd><a href={`mailto:${localLead.contact_email}`} className="hover:underline text-navy-800">{localLead.contact_email}</a></dd></>
          )}
          {phone && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Phone</dt>
              <dd><a href={`tel:${phone}`} className="hover:underline text-navy-800">{phone}</a></dd></>
          )}
          {localLead.store_address && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Address</dt>
              <dd className="text-slate-800">{localLead.store_address}</dd></>
          )}
          {localLead.customer_interest && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Interest</dt>
              <dd className="text-slate-800">{localLead.customer_interest}</dd></>
          )}
          {localLead.program_source && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Program</dt>
              <dd className="text-slate-800">{localLead.program_source}</dd></>
          )}
          {localLead.distributor && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Distributor</dt>
              <dd className="text-slate-800">{localLead.distributor}</dd></>
          )}
          {localLead.beverage_needs && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Beverage needs</dt>
              <dd className="text-slate-800">{localLead.beverage_needs}</dd></>
          )}
          {localLead.notes && (
            <><dt className="text-xs text-slate-500 font-medium uppercase tracking-wide">Notes</dt>
              <dd className="text-slate-800">{localLead.notes}</dd></>
          )}
        </dl>
      </div>

      {/* Contact logger */}
      <div className="mx-3 md:mx-4 mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 mb-2">Log contact</p>

        {/* Method picker */}
        <div className="flex gap-1.5 mb-2">
          {CONTACT_METHODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setMethod(value)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                method === value
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Reached checkbox */}
        <label className="flex items-center gap-2 text-sm text-slate-700 mb-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={reached}
            onChange={(e) => setReached(e.target.checked)}
            className="w-4 h-4 accent-emerald-700"
          />
          Made actual contact (not just voicemail)
        </label>

        {/* Note textarea — required so every action has a recorded response */}
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Notes <span className="text-bad">*</span>
          <span className="ml-1 text-slate-500 font-normal">— describe what happened on this contact</span>
        </label>
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was discussed, decided, or attempted? Required for every action."
          className="w-full text-sm border border-emerald-200 rounded px-3 py-2 mb-2
                     placeholder-slate-400 focus:outline-none focus:border-emerald-500 resize-none"
          aria-required="true"
        />

        {logError && (
          <p className="text-xs text-bad mb-2">{logError}</p>
        )}
        {logSuccess && (
          <p className="text-xs text-emerald-700 font-medium mb-2">✓ {logSuccess}</p>
        )}

        <button
          onClick={handleLogContact}
          disabled={logging || !note.trim()}
          title={!note.trim() ? 'Add a note before logging' : undefined}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm
                     font-medium rounded transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-700"
        >
          {logging ? 'Saving…' : 'Log contact'}
        </button>
      </div>

      {/* Activity feed */}
      <div className="mx-3 md:mx-4 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Activity</p>
        {activityLoading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="text-xs text-slate-400">No activity yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {activity.map((entry) => (
              <li key={entry.id} className="text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-slate-400 whitespace-nowrap mt-0.5">
                    {formatRelativeTime(entry.created_at)}
                  </span>
                  <div className="min-w-0">
                    <span className="font-medium text-slate-700">{entry.action}</span>
                    {entry.note && (
                      <span className="text-slate-500"> — {entry.note}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-3 md:px-4 pb-3 flex items-center gap-2 flex-wrap border-t border-page-100 pt-3">
        <button
          onClick={onConvert}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm
                     font-medium rounded transition-colors"
        >
          Convert to Deal
        </button>


        {/* Mark Lost */}
        {!showLostForm ? (
          <button
            onClick={() => setShowLostForm(true)}
            className="ml-auto px-3 py-2 text-xs text-slate-500 hover:text-bad
                       border border-page-200 hover:border-red-300 rounded transition-colors"
          >
            Mark as lost
          </button>
        ) : (
          <div className="w-full mt-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reason for loss <span className="text-bad">*</span>
              <span className="ml-1 text-slate-500 font-normal">— required, kept in the lead's history</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="Why is this lead lost? (price, customer went elsewhere, no answer after N tries…)"
                className="flex-1 text-sm border border-red-200 rounded px-3 py-1.5
                           placeholder-slate-400 focus:outline-none focus:border-red-400"
                aria-required="true"
              />
              <button
                onClick={handleMarkLost}
                disabled={markingLost || !lostReason.trim()}
                title={!lostReason.trim() ? 'Add a reason before confirming' : undefined}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs
                           font-medium rounded transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600"
              >
                {markingLost ? 'Saving…' : 'Confirm'}
              </button>
              <button
                onClick={() => { setShowLostForm(false); setLostReason(''); }}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700
                           border border-page-200 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Convert-to-deal modal ───────────────────────── */

/**
 * v33.4: Converting a lead creates a Deal Builder DRAFT, not a pipeline deals
 * row. The draft is pre-filled with the lead's customer info + the chosen
 * deal type, and lands in the rep's Drafts tab. Nothing reaches the Pipeline
 * Dashboard until the rep finishes filling out the draft and clicks Submit
 * in Deal Builder.
 *
 * The deal type the rep picks here drives:
 *   - Which submit modes are available (Loan can't be quoted → submit_mode='deal')
 *   - The phase routing applied at Submit time (handled inside DealBuilder)
 *
 * "Confirm Convert" is disabled until a type is picked. If the rep picks
 * Loan but has no director assigned, we warn them — Loan deals will need
 * director approval after submission, and without an assigned director the
 * eventual submitted deal won't surface in any director's queue.
 */
const CONVERT_DEAL_TYPES = [
  {
    value: 'Lease Equipment',
    label: 'Lease',
    blurb: 'Customer leases the equipment. Routes to the leasing pipeline on submit.',
  },
  {
    value: 'Finance Equipment',
    label: 'Finance',
    blurb: 'Customer finances the equipment. Routes to the leasing pipeline on submit.',
  },
  {
    value: 'Purchase Equipment',
    label: 'Purchase',
    blurb: 'Customer buys outright. Routes to sales on submit; rep can send a quote first.',
  },
  {
    value: 'Loan Equipment',
    label: 'Loan',
    blurb: 'Ronnoco lends the equipment. Routes to director review on submit.',
  },
];

function ConvertLeadModal({
  lead,
  converting,
  error,
  dealType,
  onDealTypeChange,
  hasDirector,
  onCancel,
  onConfirm,
}) {
  const businessName = lead.dba_name || lead.legal_business_name || lead.customer_full_name || 'this lead';
  const isLoan = dealType === 'Loan Equipment';
  const showDirectorWarning = isLoan && !hasDirector;
  const canConfirm = !!dealType && !converting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Convert to Deal</h2>
        <p className="text-sm text-slate-600 mb-4">
          Creates a new draft for <strong>{businessName}</strong> with the customer
          info pre-filled. You'll land in the Deal Builder to add equipment and
          finalize details before submitting.
        </p>

        <div className="bg-page-50 border border-page-200 rounded p-3 mb-4 text-xs text-slate-600 space-y-1">
          {lead.contact_email && <div><span className="font-medium">Email:</span> {lead.contact_email}</div>}
          {(lead.phone || lead.contact_number) && <div><span className="font-medium">Phone:</span> {lead.phone || lead.contact_number}</div>}
          {lead.program_source && <div><span className="font-medium">Program:</span> {lead.program_source}</div>}
          {lead.jotform_submission_id && <div className="font-mono">HTH: {lead.jotform_submission_id}</div>}
        </div>

        {/* Deal type picker — required */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-700 uppercase tracking-wider mb-2">
            Deal type <span className="text-bad">*</span>
          </label>
          <div className="space-y-1.5">
            {CONVERT_DEAL_TYPES.map((opt) => {
              const checked = dealType === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 p-2.5 border rounded cursor-pointer transition-colors
                    ${checked
                      ? 'border-navy-500 bg-navy-50'
                      : 'border-page-200 hover:border-page-300 hover:bg-page-50'}`}
                >
                  <input
                    type="radio"
                    name="convert-deal-type"
                    value={opt.value}
                    checked={checked}
                    onChange={() => onDealTypeChange(opt.value)}
                    disabled={converting}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{opt.blurb}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {showDirectorWarning && (
          <div className="text-xs text-amber-900 p-3 bg-amber-50 border border-amber-200 rounded mb-4">
            <strong>Heads up:</strong> Loan deals need director approval after submission.
            No director is currently assigned to you, so once you submit this draft it
            won't reach a director's queue until an admin assigns one in{' '}
            <span className="font-mono">Admin → Users</span>.
          </div>
        )}

        {error && (
          <div className="text-sm text-bad p-3 bg-red-50 border border-red-200 rounded mb-4">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={converting}
            className="px-4 py-2 text-sm text-slate-600 hover:text-navy-900 border border-page-200
                       hover:border-navy-300 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm
                       font-medium rounded transition-colors disabled:opacity-60
                       disabled:cursor-not-allowed"
            title={!dealType ? 'Pick a deal type first' : undefined}
          >
            {converting ? 'Converting…' : 'Confirm Convert'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Drafts section ───────────────────────── */

function DraftsSection({ drafts, loading, error, onResume, onDelete, onRename, onStartNew }) {
  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <div className="px-4 md:px-5 py-3 flex items-center justify-between gap-3
                      border-b border-page-200 bg-page-50">
        <p className="text-sm font-medium text-slate-700">
          Saved drafts
          {!loading && drafts.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-500">{drafts.length}</span>
          )}
        </p>
        <button
          onClick={onStartNew}
          className="text-xs font-medium text-navy-800 hover:text-navy-600
                     border border-navy-200 hover:border-navy-400 px-3 py-1 rounded transition-colors"
        >
          + Start new
        </button>
      </div>
      <div className="p-4 md:p-5">
        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Loading drafts…</div>
        ) : error ? (
          <div className="text-sm text-bad p-3 bg-red-50 border border-red-200 rounded">
            Couldn't load drafts: {error}
          </div>
        ) : drafts.length === 0 ? (
          <EmptyDraftsState onStartNew={onStartNew} />
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <DraftRow
                key={d.id}
                draft={d}
                onResume={() => onResume(d.id)}
                onDelete={() => onDelete(d)}
                onRename={() => onRename(d)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyDraftsState({ onStartNew }) {
  return (
    <div className="text-center py-6">
      <div className="w-12 h-12 rounded-full bg-page-50 border border-page-200
                      flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7 7h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v15a2 2 0 002 2z" />
        </svg>
      </div>
      <p className="text-sm text-slate-600 mb-3 max-w-sm mx-auto">
        No drafts yet. Use <span className="font-medium text-slate-800">Save draft</span> on
        the deal sheet to keep your work in progress for later.
      </p>
      <button
        onClick={onStartNew}
        className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                   hover:bg-navy-800 transition-colors"
      >
        Start a new deal
      </button>
    </div>
  );
}

function DraftRow({ draft, onResume, onDelete, onRename }) {
  const itemCount = Array.isArray(draft.equipment_items) ? draft.equipment_items.length : 0;
  const total = itemCount > 0
    ? draft.equipment_items.reduce((sum, it) => sum + (it.list_price ?? 0) * (it.quantity ?? 1), 0)
    : 0;
  const updatedRelative = formatRelativeTime(draft.updated_at);

  return (
    <li className="bg-page-50 border border-page-200 rounded p-3 md:p-4
                   hover:border-navy-300 transition-colors">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <ModePill mode={draft.submit_mode} />
            <h3 className="text-sm md:text-base font-medium text-slate-900 truncate">
              {draft.draft_name}
            </h3>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            <span>
              {itemCount === 0
                ? 'No equipment yet'
                : `${itemCount} item${itemCount === 1 ? '' : 's'} · $${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </span>
            <span>·</span>
            <span>Updated {updatedRelative}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onResume}
            className="px-3 py-1.5 bg-navy-900 text-chalk-50 text-xs font-medium rounded
                       hover:bg-navy-800 transition-colors whitespace-nowrap"
          >
            Resume
          </button>
          <button
            onClick={onRename}
            className="px-2 py-1.5 text-xs text-slate-600 hover:text-navy-900
                       hover:bg-page-100 rounded transition-colors"
            title="Rename"
          >
            Rename
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-slate-400 hover:text-bad hover:bg-red-50 rounded transition-colors"
            aria-label="Delete draft"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}

/* ───────────────────────── Submissions section ───────────────────────── */

function SubmissionsSection({ rows, totalCount, loading, error, filter, onFilterChange, configured, expandedId, onToggleExpand, onEditQuote, onDecision, onResubmit, onDelete }) {
  // Counts for the filter pills come from totalCount (unfiltered) so the
  // numbers don't shift as the rep flips between filters.
  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <div className="px-4 md:px-5 py-3 border-b border-page-200 bg-page-50">
        <p className="text-sm font-medium text-slate-700">
          Quotes &amp; deals
          {!loading && totalCount > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-500">{totalCount} total</span>
          )}
        </p>
      </div>

      {/* Filter pills — only render if there's anything to filter. */}
      {!loading && totalCount > 0 && (
        <div className="px-4 md:px-5 pt-3 flex gap-2 flex-wrap">
          <FilterPill active={filter === 'all'}   onClick={() => onFilterChange('all')}>All</FilterPill>
          <FilterPill active={filter === 'quote'} onClick={() => onFilterChange('quote')}>Quotes</FilterPill>
          <FilterPill active={filter === 'deal'}  onClick={() => onFilterChange('deal')}>Deals</FilterPill>
        </div>
      )}

      <div className="p-4 md:p-5">
        {!configured ? (
          <div className="text-sm text-slate-600 p-3 bg-warn/5 border border-warn/30 rounded">
            Submitted records are stored in the deal pipeline, which isn't configured.
            An admin needs to set the pipeline environment variables in Netlify before
            this section can load anything.
          </div>
        ) : loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Loading submissions…</div>
        ) : error ? (
          <div className="text-sm text-bad p-3 bg-red-50 border border-red-200 rounded">
            Couldn't load submissions: {error}
          </div>
        ) : totalCount === 0 ? (
          <EmptySubmissionsState />
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center">
            No matching {filter === 'quote' ? 'quotes' : 'deals'} yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <SubmissionRow
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => onToggleExpand(row.id)}
                onEditQuote={onEditQuote}
                onDecision={onDecision}
                onResubmit={onResubmit}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptySubmissionsState() {
  return (
    <div className="text-center py-6">
      <div className="w-12 h-12 rounded-full bg-page-50 border border-page-200
                      flex items-center justify-center mx-auto mb-3">
        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-sm text-slate-600 max-w-sm mx-auto">
        Nothing submitted yet. Once you send a quote or submit a deal, it shows up here.
      </p>
    </div>
  );
}

function SubmissionRow({ row, expanded, onToggle, onEditQuote, onDecision, onResubmit, onDelete }) {
  const isQuote = row.is_quote === true;
  const createdRelative = formatRelativeTime(row.created_at);
  const customerName =
    row.contact_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    '(no name)';
  const location = [row.city, row.state].filter(Boolean).join(', ');
  const totalDisplay = row.total_eq_cost || '';

  return (
    <li className={`bg-page-50 border rounded transition-colors overflow-hidden
                    ${expanded ? 'border-navy-400 shadow-sm' : 'border-page-200 hover:border-navy-300'}`}>
      {/* Header — clickable to toggle expansion. The whole row is the
          target (not just a chevron) so the touch surface is generous. */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 md:p-4 cursor-pointer hover:bg-page-100/40 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <TypePill isQuote={isQuote} />
              {/* v33.3: deal type badge — Lease / Finance / Purchase / Loan.
                  Renders null when deal_type is missing (legacy deals from
                  before v33.2 lead conversion, or older Jotform imports). */}
              <DealTypePill dealType={row.deal_type} />
              {isQuote && row.quote_number && (
                <span className="text-[11px] font-mono font-medium text-slate-700">
                  {row.quote_number}
                  {row.quote_revision > 1 && (
                    <span className="text-slate-400 font-normal"> · rev {row.quote_revision}</span>
                  )}
                </span>
              )}
              {isQuote && <QuoteDecisionPill decision={row.customer_decision} />}
              {!isQuote && row.phase && <PhasePill phase={row.phase} />}
              {!isQuote && row.current_step && <StepPill step={row.current_step} />}
              {/* v31: surface the director-approval state on the row. Renders
                  null for deals that never entered director review, so it
                  costs nothing on the common path. */}
              {!isQuote && (
                <DirectorDecisionPill
                  decision={row.director_decision}
                  resubmissionCount={row.resubmission_count || 0}
                />
              )}
              {isQuote && row.quote_first_viewed_at && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium text-slate-500"
                      title={`First viewed ${new Date(row.quote_first_viewed_at).toLocaleString()}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                  Viewed
                </span>
              )}
            </div>
            <h3 className="text-sm md:text-base font-medium text-slate-900 truncate">
              {row.store_name || customerName}
            </h3>
            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
              <span>{customerName}</span>
              {location && <><span>·</span><span>{location}</span></>}
              {totalDisplay && <><span>·</span><span className="font-mono">{totalDisplay}</span></>}
              <span>·</span>
              <span>Submitted {createdRelative}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 text-slate-400">
            <span className="text-[10px] uppercase tracking-wider font-medium">
              {expanded ? 'Hide' : 'Details'}
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </button>

      {/* Detail panel — rendered only when expanded. Border-top creates a
          visual seam between the header and the panel. */}
      {expanded && (
        <div className="border-t border-page-200 bg-white">
          <SubmissionDetail
            row={row}
            isQuote={isQuote}
            onEditQuote={onEditQuote}
            onDecision={onDecision}
            onResubmit={onResubmit}
            onDelete={onDelete}
          />
        </div>
      )}
    </li>
  );
}

/* ───────────────────────── Detail panel ───────────────────────── */

/**
 * The inline detail view shown when a submission row is expanded. Renders:
 *   - Customer info card (contact + store + address)
 *   - Equipment summary (from raw_csv.equipment_items if present, else the
 *     equipment_selection text blob)
 *   - Visual stepper for the current phase (read-only)
 *   - For quotes: edit button, copy-link/open-quote actions, customer
 *     decision form
 *   - For deals: a small note pointing reps to the Pipeline dashboard for
 *     any further edits
 */
function SubmissionDetail({ row, isQuote, onEditQuote, onDecision, onResubmit, onDelete }) {
  return (
    <div className="p-4 md:p-5 space-y-5">
      {/* Phase stepper — only render when phase is in {leasing, ops, pending_director}.
          Sales-phase quotes don't need a stepper (there's only one step). */}
      {(row.phase === 'leasing' || row.phase === 'ops' || row.phase === 'pending_director') && (
        <div>
          <SectionLabel>
            {PHASE_LABELS[row.phase] || row.phase} Progress
            {isTerminalDenial(row.current_step) && (
              <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-bad">
                · Credit Denied
              </span>
            )}
          </SectionLabel>
          <PhaseStepper phase={row.phase} currentStep={row.current_step} />
        </div>
      )}

      {/* Sales phase + quote — show a small notice instead of a stepper */}
      {row.phase === 'sales' && isQuote && (
        <div className="bg-accent-500/5 border border-accent-500/30 rounded p-3 text-xs text-slate-700">
          <div className="font-medium text-slate-900 mb-0.5">Quote sent — awaiting customer decision</div>
          Once the customer responds, record their decision below. That moves the deal forward into Financing or Operations.
        </div>
      )}

      {/* v32: Full deal detail view (same six sections the director sees on
          My Team). Replaces the narrower Customer/Store/Equipment trio that
          lived here previously. Reps can now see everything they submitted
          plus customer + director decision feedback inline, without needing
          access to the Pipeline dashboard. */}
      <div className="bg-white border border-page-200 rounded-lg overflow-hidden">
        <DealDetailView deal={row} />
      </div>

      {/* Actions — different for quotes vs deals */}
      {isQuote ? (
        <QuoteActions row={row} onEditQuote={onEditQuote} onDecision={onDecision} onDelete={onDelete} />
      ) : (
        <DealActions row={row} onResubmit={onResubmit} />
      )}
    </div>
  );
}

/* ───────────────────────── Stepper ───────────────────────── */

/**
 * Horizontal stepper showing every step in the phase's sequence, with the
 * current step highlighted. Read-only — the rep can see where the deal is
 * but can't advance it from here (that happens in the Pipeline dashboard).
 *
 * On mobile (< md breakpoint), wraps to multiple lines so labels stay
 * readable. On desktop, all steps fit on one row with connector lines.
 */
function PhaseStepper({ phase, currentStep }) {
  const statuses = getStepStatuses(phase, currentStep);
  if (statuses.length === 0) {
    return <div className="text-xs text-slate-500 italic">No phase steps to show.</div>;
  }

  return (
    <ol className="flex flex-wrap items-stretch gap-x-1 gap-y-3 md:gap-y-0">
      {statuses.map((step, idx) => (
        <li key={step.key} className="flex items-stretch min-w-0">
          <StepperNode label={step.label} status={step.status} />
          {idx < statuses.length - 1 && (
            <div className="hidden md:flex items-center px-1">
              <div className={`h-px w-6
                              ${step.status === 'past' ? 'bg-navy-700' : 'bg-page-300'}`} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function StepperNode({ label, status }) {
  const isPast    = status === 'past';
  const isCurrent = status === 'current';
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap
                    ${isCurrent ? 'bg-navy-900 text-chalk-50 ring-1 ring-navy-900' :
                      isPast    ? 'bg-ok/10 text-ok' :
                                  'bg-white border border-page-200 text-slate-500'}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px]
                       ${isCurrent ? 'bg-chalk-50/20' : isPast ? 'bg-ok/20' : 'bg-page-100'}`}>
        {isPast ? (
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        ) : isCurrent ? (
          <span className="w-1.5 h-1.5 rounded-full bg-chalk-50" />
        ) : null}
      </span>
      {label}
    </div>
  );
}

/* ───────────────────────── Quote actions + decision form ───────────────────────── */

function QuoteActions({ row, onEditQuote, onDecision, onDelete }) {
  const url = buildQuoteUrl(row.quote_number, row.quote_token);
  const [copied, setCopied] = useState(false);
  // Confirmation state for the destructive Delete action. Two-step
  // confirmation (button → modal → confirm) protects against misclicks on
  // an irreversible operation.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Only render the decision form when no decision has been recorded yet.
  // Once a decision exists, the deal has moved phases; further changes
  // happen in the Pipeline dashboard, not here.
  const showDecisionForm = !row.customer_decision || row.customer_decision === 'pending';

  // Eligibility — only declined quotes or quotes the customer hasn't viewed.
  // canDeleteQuote re-checks at submit time too (defense in depth).
  const deletable = canDeleteQuote(row);

  function copyLink() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await onDelete(row);
    setDeleting(false);
    if (!result?.error) setConfirmingDelete(false);
    // Error path already surfaced an alert in handleDeleteQuote; keep the
    // modal open so the rep sees the context.
  }

  return (
    <div className="space-y-4">
      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onEditQuote(row.id)}
          className="px-3 py-1.5 bg-navy-900 text-chalk-50 text-xs font-medium rounded
                     hover:bg-navy-800 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit & re-send
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 border border-page-300 bg-white text-slate-700 text-xs font-medium rounded
                     hover:bg-page-50 hover:border-navy-300 transition-colors whitespace-nowrap inline-flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open quote page
        </a>
        <button
          onClick={copyLink}
          className="px-3 py-1.5 border border-page-300 bg-white text-slate-700 text-xs font-medium rounded
                     hover:bg-page-50 hover:border-navy-300 transition-colors whitespace-nowrap"
          title="Copy customer-facing quote link"
        >
          {copied ? '✓ Link copied' : 'Copy link'}
        </button>

        {/* Delete — only renders for declined quotes or quotes the customer
            hasn't viewed. Subdued red styling so it doesn't compete with the
            primary actions but is still findable. ml-auto pushes it to the
            right end of the row to visually separate it from the primary
            actions. Opens a confirmation modal rather than firing on click. */}
        {deletable && (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="px-3 py-1.5 border border-red-200 bg-white text-red-700 text-xs font-medium rounded
                       hover:bg-red-50 hover:border-red-300 transition-colors whitespace-nowrap
                       inline-flex items-center gap-1.5 ml-auto"
            title="Permanently delete this quote"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
            </svg>
            Delete
          </button>
        )}
      </div>

      {/* Cover note (if any) — useful context when deciding what to edit */}
      {row.quote_cover_note && (
        <div className="bg-page-50 border border-page-200 rounded p-3">
          <SectionLabel>Cover note to customer</SectionLabel>
          <p className="text-xs text-slate-700 whitespace-pre-wrap">{row.quote_cover_note}</p>
        </div>
      )}

      {/* Decision form OR decision summary */}
      {showDecisionForm ? (
        <DecisionForm row={row} onDecision={onDecision} />
      ) : (
        <DecisionSummary row={row} />
      )}

      {/* Delete-confirmation modal. Renders at the page level (fixed inset)
          so it overlays everything. Click-outside cancels; the cancel/delete
          buttons disable themselves while the request is in flight. */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40"
          onClick={() => !deleting && setConfirmingDelete(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-medium text-slate-900 mb-2">
              Delete this quote?
            </h3>
            <p className="text-sm text-slate-700 mb-1">
              <span className="font-mono font-medium">{row.quote_number}</span>
              {row.store_name && <> — {row.store_name}</>}
            </p>
            <p className="text-sm text-slate-600 mb-4">
              This permanently removes the quote and all its history (revisions,
              activity log, customer-decision record). The customer-facing link
              will stop working. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 border border-page-300 bg-white text-slate-700 text-sm font-medium rounded
                           hover:bg-page-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded
                           hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Form for recording the customer's reply to the quote. The rep picks one
 * of the standard outcomes; on submit we update the deal and advance the
 * phase per the DECISIONS table's rules.
 *
 * Local state captures the selection so the rep can review before clicking
 * Save — accidentally clicking "Declined" and losing the quote would be
 * a frustrating mistake.
 */
function DecisionForm({ row, onDecision }) {
  const [selected, setSelected] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!selected) return;
    const decision = DECISIONS.find((d) => d.value === selected);
    const confirmMsg = decision.closed
      ? `Mark this quote as Declined? The deal will be closed and can't be reopened from here.`
      : `Record ${decision.label}? The deal will move into ${decision.nextPhase} phase.`;
    if (!window.confirm(confirmMsg)) return;
    setSaving(true);
    const { error } = await onDecision(row, selected, notes.trim() || null);
    setSaving(false);
    if (!error) {
      setSelected('');
      setNotes('');
    }
  }

  return (
    <div className="bg-page-50 border border-page-200 rounded p-3 md:p-4">
      <SectionLabel>Record customer decision</SectionLabel>
      <p className="text-xs text-slate-600 mb-3">
        When the customer replies to your quote, log their response here. The deal will
        automatically advance into the appropriate phase.
      </p>

      <div className="space-y-2 mb-3">
        {DECISIONS.map((d) => (
          <label key={d.value}
                 className={`flex items-start gap-3 p-2 rounded cursor-pointer border transition-colors
                            ${selected === d.value
                              ? 'border-navy-600 bg-white'
                              : 'border-page-200 bg-white hover:border-navy-300'}`}>
            <input
              type="radio"
              name={`decision-${row.id}`}
              value={d.value}
              checked={selected === d.value}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-0.5 accent-navy-700"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{d.label}</div>
              <div className="text-[11px] text-slate-500">
                {d.closed
                  ? 'Deal closed — customer is not moving forward'
                  : `Moves to ${PHASE_LABELS[d.nextPhase] || d.nextPhase} phase (${STEP_LABELS[d.nextStep] || d.nextStep})`}
              </div>
            </div>
          </label>
        ))}
      </div>

      <label className="block mb-3">
        <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
          Notes <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="e.g. Customer wants to delay install until next month."
          className="w-full px-3 py-2 bg-white border border-page-200 rounded text-sm
                     focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10
                     focus:outline-none transition-colors resize-y"
        />
      </label>

      <button
        onClick={handleSave}
        disabled={!selected || saving}
        className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                   hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
      >
        {saving ? 'Saving…' : 'Save decision'}
      </button>
    </div>
  );
}

/**
 * Read-only summary shown once a decision has been recorded. The decision
 * itself is in the row's status pill at the top of the row, but the notes
 * and timestamp belong here.
 */
function DecisionSummary({ row }) {
  const decision = DECISIONS.find((d) => d.value === row.customer_decision);
  if (!decision) return null;
  const when = row.customer_decision_at
    ? new Date(row.customer_decision_at).toLocaleString()
    : 'recently';
  return (
    <div className="bg-page-50 border border-page-200 rounded p-3">
      <SectionLabel>Customer decision</SectionLabel>
      <div className="text-sm text-slate-900 font-medium">{decision.label}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">Recorded {when}</div>
      {row.customer_decision_notes && (
        <p className="text-xs text-slate-700 mt-2 whitespace-pre-wrap">
          {row.customer_decision_notes}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── Deal actions (read-only) ───────────────────────── */

/**
 * v31: DealActions renders one of four panels at the bottom of the
 * SubmissionDetail for a non-quote (direct-submit) deal, picked by inspecting
 * `director_decision`:
 *
 *   1. **rejected** — the director sent the deal back. Red banner showing
 *      the director's note (`director_decision_notes`) and a prominent
 *      "Revise and resubmit" CTA that opens the resubmit modal. This is
 *      the only branch where the rep has an action to take.
 *
 *   2. **pending_director** (decision === 'pending') — amber waiting notice.
 *      Lets the rep know the deal is sitting in their director's queue and
 *      that there's nothing for them to do here.
 *
 *   3. **approved** — green confirmation showing the director's optional
 *      note. Usually visible only briefly before the deal advances out of
 *      pending_director into ops, but we render it gracefully if the row
 *      hasn't refreshed yet.
 *
 *   4. **default** — the original view-only panel pointing the rep at the
 *      Pipeline dashboard. Used for any deal that never entered the
 *      director-approval flow (leases / finance) or has already moved on.
 */
function DealActions({ row, onResubmit }) {
  const dec = row.director_decision;

  // Branch 1: rejected — surface the rejection reason + resubmit CTA
  if (dec === 'rejected') {
    const reason = row.director_decision_notes;
    const decidedBy = row.director_decision_by;
    const decidedAt = row.director_decision_at;
    const tries = row.resubmission_count || 0;
    return (
      <div className="bg-red-50 border border-bad/40 rounded p-3 md:p-4">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-bad flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-bad mb-1">
              Director rejected this deal
              {tries > 0 && (
                <span className="ml-2 text-[10px] uppercase tracking-wider font-medium text-bad/80 bg-bad/10 rounded-full px-2 py-0.5">
                  {tries === 1 ? '1 prior retry' : `${tries} prior retries`}
                </span>
              )}
            </div>
            {reason ? (
              <div className="text-xs text-slate-700 bg-white border border-bad/20 rounded p-2 mb-2 whitespace-pre-wrap">
                <span className="text-[10px] uppercase tracking-wider font-bold text-bad/70 block mb-0.5">
                  Director's note
                </span>
                {reason}
              </div>
            ) : (
              <div className="text-xs text-slate-600 italic mb-2">
                No reason was provided. Reach out to {decidedBy || 'your director'} for context.
              </div>
            )}
            <div className="text-[11px] text-slate-500 mb-3">
              {decidedBy && <>Decided by {decidedBy}</>}
              {decidedBy && decidedAt && <> · </>}
              {decidedAt && <>{formatRelativeTime(decidedAt)}</>}
            </div>
            <button
              type="button"
              onClick={() => onResubmit && onResubmit(row)}
              disabled={!onResubmit}
              className="inline-flex items-center gap-1.5 bg-navy-900 text-chalk-50 text-xs font-semibold uppercase tracking-wider px-3 py-2 rounded hover:bg-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Revise and resubmit
            </button>
            {row.id && (
              <div className="mt-2 text-[10px] text-slate-500 font-mono">Deal ID: {row.id}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Branch 2: pending — waiting on director, no action for the rep
  if (dec === 'pending') {
    return (
      <div className="bg-accent-500/10 border border-accent-500/40 rounded p-3 md:p-4">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-accent-700 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-accent-700 mb-0.5">
              Waiting on director approval
            </div>
            <div className="text-xs text-slate-700">
              This deal is in your director's queue. They'll either approve and advance it to
              operations, or send it back with notes so you can revise. There's nothing for you
              to do here — you'll see the result on this page when they decide.
            </div>
            {(row.resubmission_count || 0) > 0 && (
              <div className="text-[11px] text-accent-700/70 mt-2">
                This is retry {row.resubmission_count}. Hang tight.
              </div>
            )}
            {row.id && (
              <div className="mt-2 text-[10px] text-slate-500 font-mono">Deal ID: {row.id}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Branch 3: approved — green confirmation, optional director's note
  if (dec === 'approved') {
    const note = row.director_decision_notes;
    const decidedBy = row.director_decision_by;
    return (
      <div className="bg-ok/10 border border-ok/40 rounded p-3 md:p-4">
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ok mb-0.5">
              Director approved this deal
            </div>
            <div className="text-xs text-slate-700">
              {decidedBy ? `${decidedBy} approved this deal — it's been advanced to operations.` :
                "Approved — this deal has been advanced to operations."}
            </div>
            {note && (
              <div className="text-xs text-slate-700 bg-white border border-ok/20 rounded p-2 mt-2 whitespace-pre-wrap">
                <span className="text-[10px] uppercase tracking-wider font-bold text-ok/70 block mb-0.5">
                  Director's note
                </span>
                {note}
              </div>
            )}
            {row.id && (
              <div className="mt-2 text-[10px] text-slate-500 font-mono">Deal ID: {row.id}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Branch 4: default — the original view-only panel for non-approval-flow deals
  return (
    <div className="bg-page-50 border border-page-200 rounded p-3 text-xs text-slate-600">
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="font-medium text-slate-900 mb-0.5">View-only here</div>
          This deal is now in the leasing/operations team's hands. To update phase, advance steps,
          edit equipment, or close out the deal, use the Deal Pipeline dashboard — your admin can
          give you access if you don't have it yet.
          {row.id && (
            <div className="mt-2 text-[11px] text-slate-500 font-mono">Deal ID: {row.id}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Small primitives ───────────────────────── */

/** Summary stat card for the workspace header */
function StatCard({ label, value, sub, color, onClick, active }) {
  const colors = {
    emerald: {
      border:  active ? 'border-emerald-400' : 'border-page-200 hover:border-emerald-300',
      value:   'text-emerald-700',
      dot:     'bg-emerald-500',
    },
    amber: {
      border:  active ? 'border-amber-400' : 'border-page-200 hover:border-amber-300',
      value:   'text-amber-700',
      dot:     'bg-amber-500',
    },
    slate: {
      border:  active ? 'border-navy-400' : 'border-page-200 hover:border-navy-300',
      value:   'text-navy-900',
      dot:     'bg-slate-400',
    },
  };
  const c = colors[color] || colors.slate;
  return (
    <button
      onClick={onClick}
      className={`bg-white border-2 ${c.border} rounded-lg p-3 md:p-4 text-left
                  transition-colors w-full ${
        active ? 'shadow-sm' : 'hover:shadow-sm'
      }`}
    >
      <p className={`text-xl md:text-2xl font-semibold ${c.value}`}>{value}</p>
      <p className="text-xs font-medium text-slate-700 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </button>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">
      {children}
    </div>
  );
}

// DetailCard / DetailField removed in v32 — the rich SubmissionDetail
// now embeds DealDetailView (shared with MyTeamPage) rather than building
// its own narrower customer/store grid.

function StepPill({ step }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium
                     bg-slate-100 text-slate-700">
      {STEP_LABELS[step] || step}
    </span>
  );
}

/* ───────────────────────── Pills & primitives ───────────────────────── */

function ModePill({ mode }) {
  const isQuote = mode === 'quote';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold
                     ${isQuote
                       ? 'bg-accent-500/15 text-accent-700'
                       : 'bg-navy-900/10 text-navy-800'}`}>
      {isQuote ? 'Quote' : 'Deal'}
    </span>
  );
}

function TypePill({ isQuote }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold
                     ${isQuote
                       ? 'bg-accent-500/15 text-accent-700'
                       : 'bg-navy-900 text-chalk-50'}`}>
      {isQuote ? 'Quote' : 'Deal'}
    </span>
  );
}

/**
 * v33.3: DealTypePill — the deal_type badge on submission rows.
 *
 * Renders null when deal_type isn't set, so it's invisible on pre-v33.2 deals
 * and on rows where the type was never specified. Each of the four canonical
 * types gets its own subtle tint so reps can scan a list and spot all the
 * Purchases, all the Loans, etc. at a glance.
 *
 * Style choices:
 *   - Navy   for Lease    (the most common path; reads as the "default")
 *   - Navy-light for Finance (sibling to Lease, visually paired)
 *   - Accent for Purchase (highest-margin path; the differentiator)
 *   - Slate  for Loan     (Ronnoco-owned; internal-only, low-key)
 *
 * Unknown types fall through to a neutral pill so future deal_type values
 * (or anything custom on legacy data) render without crashing.
 */
function DealTypePill({ dealType }) {
  if (!dealType) return null;
  const styled = {
    'Lease Equipment':    { label: 'Lease',    cls: 'bg-navy-100 text-navy-800' },
    'Finance Equipment':  { label: 'Finance',  cls: 'bg-navy-50 text-navy-700' },
    'Purchase Equipment': { label: 'Purchase', cls: 'bg-accent-500/15 text-accent-700' },
    'Loan Equipment':     { label: 'Loan',     cls: 'bg-slate-200 text-slate-700' },
  }[dealType] || { label: dealType, cls: 'bg-page-100 text-slate-600' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium ${styled.cls}`}
          title={`Deal type: ${dealType}`}>
      {styled.label}
    </span>
  );
}

function PhasePill({ phase }) {
  // Pipeline phases: sales → leasing → ops, plus v31's pending_director.
  // Sales shouldn't appear here for direct-submit deals but we cover it for safety.
  const label = {
    sales:            'Sales',
    pending_director: 'Director Review',
    leasing:          'Leasing',
    ops:              'Operations',
  }[phase] || phase;
  // v31: pending_director gets accent styling so it visually separates from
  // the neutral slate pills used for the standard phases. This makes the
  // "needs attention" deals pop on a long list.
  const cls = phase === 'pending_director'
    ? 'bg-accent-500/15 text-accent-700'
    : 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium ${cls}`}>
      {label}
    </span>
  );
}

function QuoteDecisionPill({ decision }) {
  // customer_decision values: pending, lease, finance, purchase, loan, declined
  if (!decision || decision === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium
                       bg-page-100 text-slate-600">
        Awaiting reply
      </span>
    );
  }
  if (decision === 'declined') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium
                       bg-red-50 text-bad">
        Declined
      </span>
    );
  }
  // Any positive decision (lease, finance, purchase, loan) = accepted.
  const label = {
    lease:    'Accepted (Lease)',
    finance:  'Accepted (Finance)',
    purchase: 'Accepted (Purchase)',
    loan:     'Accepted (Loan)',
  }[decision] || `Accepted (${decision})`;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium
                     bg-ok/10 text-ok">
      {label}
    </span>
  );
}

/**
 * v31: DirectorDecisionPill — the director-approval status for a deal that
 * has been routed through the pending_director phase (Purchase or Loan).
 *
 * Renders only when there's something meaningful to show. Returns null for
 * deals that never entered the director-approval flow (e.g. leases, finance,
 * customer-declined quotes). The three states it surfaces are:
 *
 *   - 'pending'  — waiting on the director. Amber/neutral tone; gentle "in
 *                  progress" affordance so the rep knows it's normal.
 *   - 'rejected' — the director sent it back. Red tone to draw the eye; the
 *                  resubmission badge (rev N) appears alongside if the rep
 *                  has tried more than once.
 *   - 'approved' — green check; cleared for ops. Usually visible briefly
 *                  before the deal phase advances to ops, but we still show
 *                  it if the row hasn't refreshed yet.
 *
 * Resubmission count is surfaced as "(retry N)" appended to the pill text so
 * it stays compact in the row header. We start showing it at count >= 1
 * because count 0 just means "first submission" — not useful information.
 */
function DirectorDecisionPill({ decision, resubmissionCount }) {
  if (!decision) return null;

  if (decision === 'pending') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium
                       bg-accent-500/15 text-accent-700"
            title="Waiting on the director's approval">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-500 mr-1.5 animate-pulse" />
        Pending director
        {resubmissionCount > 0 && (
          <span className="ml-1 text-accent-700/70 font-normal normal-case">
            · retry {resubmissionCount}
          </span>
        )}
      </span>
    );
  }

  if (decision === 'rejected') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium
                       bg-red-50 text-bad"
            title="The director rejected this deal. Open the row to see why and resubmit.">
        Director rejected
        {resubmissionCount > 0 && (
          <span className="ml-1 text-bad/70 font-normal normal-case">
            · {resubmissionCount === 1 ? '1 retry' : `${resubmissionCount} retries`}
          </span>
        )}
      </span>
    );
  }

  if (decision === 'approved') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium
                       bg-ok/10 text-ok"
            title="The director approved this deal.">
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Director approved
      </span>
    );
  }

  return null;
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
                 ${active
                   ? 'bg-navy-900 text-chalk-50'
                   : 'bg-white border border-page-200 text-slate-700 hover:border-navy-300'}`}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── Utilities ───────────────────────── */

/**
 * "X ago" formatting for short, glanceable timestamps. We deliberately keep
 * the precision coarse — knowing whether a draft was last touched 2 minutes
 * or 5 minutes ago doesn't matter; whether it was today or last week does.
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
  // Beyond a week, an absolute short date is clearer than "27 days ago"
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Same shape as DealBuilder's buildQuoteUrl — the customer-facing route.
 * Inlined here to avoid pulling DealBuilder into this page just for one util.
 */
function buildQuoteUrl(quoteNumber, token) {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/#/quote/${quoteNumber}?t=${token}`;
}

/* ───────────────────────── v31 Resubmit modal ───────────────────────── */

/**
 * ResubmitModal — opened from the rejected-deal banner in DealActions.
 *
 * Workflow:
 *   1. Rep opens a rejected deal in My Deals
 *   2. Sees the red banner with the director's rejection reason
 *   3. Clicks "Revise and resubmit"
 *   4. THIS MODAL appears, collecting an optional note ("here's what I
 *      changed") that becomes part of the audit trail
 *   5. On Resubmit, the parent calls resubmitDeal() which flips the deal
 *      back into the director's queue
 *
 * The modal is intentionally light on form fields — the rep has presumably
 * already revised the deal elsewhere (or is about to once it lands back in
 * draft mode). This is purely the "send it back for another look" action.
 * If we later want the rep to revise the equipment list/customer info from
 * this exact flow, we'd add a "Open in Deal Builder" branch that hydrates
 * the deal back into a draft — but that's a separate workflow.
 *
 * Accessibility: Escape closes, click-outside closes, the textarea is
 * focused on open so a rep typing the note doesn't need to tab/click first.
 */
function ResubmitModal({ row, submitting, error, onCancel, onSubmit }) {
  const [notes, setNotes] = useState('');

  // Escape key closes the modal (unless we're mid-submit, to avoid losing
  // a request in flight). Mounted once per modal lifetime.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  function handleSubmit() {
    if (submitting) return;
    onSubmit(notes.trim() || null);
  }

  const customerName =
    row.contact_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    '(no name)';
  const rejectionReason = row.director_decision_notes;
  const priorRetries = row.resubmission_count || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="resubmit-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-navy-900 text-chalk-50 px-5 py-3 flex items-center justify-between gap-3 flex-shrink-0">
          <div>
            <h2 id="resubmit-modal-title" className="text-base font-semibold">
              Revise and resubmit
            </h2>
            <div className="text-[11px] uppercase tracking-wider text-chalk-50/70 mt-0.5">
              {row.store_name || customerName}
              {priorRetries > 0 && <> · attempt {priorRetries + 1}</>}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-chalk-50/70 hover:text-chalk-50 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1">
          {/* Surface the director's reason at the top of the modal so the
              rep can refer to it while writing their resubmit note. */}
          {rejectionReason && (
            <div className="bg-red-50 border border-bad/30 rounded p-3 text-xs text-slate-700">
              <div className="text-[10px] uppercase tracking-wider font-bold text-bad/80 mb-1">
                Why it was rejected
              </div>
              <div className="whitespace-pre-wrap">{rejectionReason}</div>
            </div>
          )}

          <div>
            <label htmlFor="resubmit-notes" className="block text-xs uppercase tracking-wider font-bold text-slate-700 mb-1">
              What changed? <span className="text-slate-400 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              id="resubmit-notes"
              autoFocus
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              placeholder="e.g. Updated the customer's address and removed the second espresso machine per the note above."
              className="w-full text-sm border border-page-300 rounded px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-navy-300 focus:border-navy-400 disabled:bg-page-50 disabled:text-slate-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Your note will be visible to the director when they review the resubmission.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-bad/40 rounded p-2.5 text-xs text-bad">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-page-50 border-t border-page-200 px-5 py-3 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="text-xs font-semibold uppercase tracking-wider px-3 py-2 rounded border border-page-300 text-slate-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="text-xs font-semibold uppercase tracking-wider px-3 py-2 rounded bg-navy-900 text-chalk-50 hover:bg-navy-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Resubmitting…' : 'Resubmit for review'}
          </button>
        </div>
      </div>
    </div>
  );
}
