/**
 * dealPipeline.js — OneRonnoco-native rebuild.
 *
 * Preserves the exact export surface the UI already imports, but every
 * function now runs against the single OneRonnoco database using the native
 * model (deals.stage / integer current_step / assigned_rep_id / customer_id
 * and the deal_events audit table). The translation between the UI's old
 * phase/string-step vocabulary and the native columns lives in oneronnoco.js.
 *
 * Because the app is now single-DB, isDealPipelineConfigured is always true
 * when the Supabase env vars are present.
 */
import { supabase } from './supabase.js';
import {
  toNativeStageStep, fromNativeRow, currentUserId, userIdByEmail,
  matchOrCreateCustomer,
} from './oneronnoco.js';

export const isDealPipelineConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ───────── payload translation: old pipeline shape -> native deals row ───────── */

/**
 * Translate the flat pipeline payload the DealBuilder builds into a native
 * OneRonnoco deals row. Anything without a native column is preserved inside
 * jotform_answers so no data is lost and the dashboards can still read it.
 */
async function toNativeDeal(payload) {
  const { stage, current_step, current_step_name } =
    toNativeStageStep(payload.phase, payload.current_step);

  // Resolve rep + director to native user ids (email is the bridge).
  const assigned_rep_id = await userIdByEmail(payload.sales_rep_email);

  // Match-or-create the customer file (the deal creates/links the record of truth).
  let customer_id = null;
  try {
    customer_id = await matchOrCreateCustomer({
      storeName: payload.store_name,
      legalName: payload.legal_business_name,
      accountNumber: payload.customer_account,
      contactName: payload.contact_name,
      email: payload.contact_email || payload.email,
      phone: payload.contact_cell || payload.phone,
      city: payload.city,
      state: payload.state,
      zip: payload.zip_code,
      addressLine1: payload.address,
    });
  } catch (e) {
    console.warn('Customer match-or-create failed (deal still saved):', e?.message || e);
  }

  // Deal type: the UI uses labels like "Lease Equipment"; native enum is short.
  const dealTypeMap = {
    'Lease Equipment': 'lease',
    'Finance Equipment': 'finance',
    'Purchase Equipment': 'purchase',
    'Loan Equipment': 'loan',
  };
  const deal_type = dealTypeMap[payload.deal_type] || 'purchase';

  // Everything the native deals table doesn't have a column for is preserved
  // here so nothing is dropped and the pipeline dashboard keeps working.
  const overflow = {
    is_new_customer: payload.is_new_customer,
    store_phone: payload.store_phone,
    chain_group_num: payload.chain_group_num,
    prior_account_num: payload.prior_account_num,
    change_details: payload.change_details,
    sales_rep: payload.sales_rep,
    sales_rep_email: payload.sales_rep_email,
    route_number: payload.route_number,
    director_user_id: payload.director_user_id,
    rep_director_email: payload.rep_director_email,
    distribution_method: payload.distribution_method,
    delivery_recurrence: payload.delivery_recurrence,
    parts_service_option: payload.parts_service_option,
    parent_distributor_num: payload.parent_distributor_num,
    core_mark_div_num: payload.core_mark_div_num,
    distributor_rep_name: payload.distributor_rep_name,
    distributor_rep_phone: payload.distributor_rep_phone,
    rom_person: payload.rom_person,
    rom_email: payload.rom_email,
    rom: payload.rom,
  };

  return {
    // identity / linkage
    customer_id,
    assigned_rep_id,
    source: 'oneronnoco',
    source_system: 'deal_builder',
    // lifecycle (native)
    stage,
    current_step,
    current_step_name,
    deal_status: payload.deal_status || 'active',
    is_quote: payload.is_quote ?? false,
    customer_decision: payload.customer_decision || 'pending',
    // quote fields
    quote_number: payload.quote_number || null,
    quote_token: payload.quote_token || null,
    quote_cover_note: payload.quote_cover_note || null,
    quote_valid_until: payload.quote_valid_until || null,
    quote_first_sent_at: payload.quote_first_sent_at || null,
    quote_last_sent_at: payload.quote_last_sent_at || null,
    quote_revision: payload.quote_revision || 0,
    // director
    director_name: payload.director_name || null,
    director_email: payload.director_email || null,
    director_decision_by: payload.rep_director_email || null,
    // customer / store
    store_name: payload.store_name,
    legal_business_name: payload.legal_business_name,
    contact_name: payload.contact_name,
    contact_email: payload.contact_email,
    contact_phone: payload.contact_cell,
    first_name: payload.first_name,
    last_name: payload.last_name,
    email: payload.email,
    phone: payload.phone,
    customer_type: payload.customer_type,
    sub_group: payload.sub_group,
    address_line1: payload.address,
    city: payload.city,
    state: payload.state,
    zip: payload.zip_code,
    customer_account_number: payload.customer_account,
    is_chain: payload.chain_store === 'Yes' || payload.chain_store === true,
    chain_store: payload.chain_store === 'Yes' || payload.chain_store === true,
    is_henderson_account: !!payload.henderson_account,
    is_change_of_ownership: !!payload.change_of_ownership,
    // distributor
    parent_distributor: payload.parent_distributor,
    distributor_customer_number: payload.distributor_customer_num,
    distributor_customer_num: payload.distributor_customer_num,
    distributor_warehouse: payload.distributor_warehouse,
    distributor_rep: payload.distributor_rep_name,
    distributor_rep_email: payload.distributor_rep_email,
    // coffee / delivery
    coffee_program: payload.coffee_program,
    current_coffee_supplier: payload.current_coffee_supplier,
    delivery_method: payload.delivery_method,
    coffee_spend_3mo: payload.coffee_spend_3mo,
    expected_monthly_sales: payload.expected_monthly_sales,
    avg_monthly_coffee_spend: payload.coffee_spend_3mo,
    // equipment / financials
    deal_type,
    equipment_selection: payload.equipment_selection,
    total_eq_cost: payload.total_eq_cost,
    // install
    target_install_date: payload.target_install_date || null,
    need_by_date: payload.need_by_date || null,
    emergency_install: payload.emergency_install === 'Yes',
    emergency_details: payload.emergency_install_details,
    // graphics
    graphics_package: payload.graphics_package,
    ship_graphics: !!payload.ship_graphics_with_equip,
    has_custom_graphics: !!payload.has_custom_graphics,
    notes: payload.notes,
    // snapshots
    raw_csv: payload.raw_csv || null,
    jotform_answers: overflow,
  };
}

/** Hydrate a native deals row back into the flat shape the UI expects. */
function toUiDeal(row) {
  if (!row) return row;
  const { phase, current_step } = fromNativeRow(row);
  const of = row.jotform_answers || {};
  return {
    ...row,
    phase,
    current_step,                       // string step the UI stepper expects
    sales_rep: of.sales_rep ?? null,
    sales_rep_email: of.sales_rep_email ?? null,
    rep_director_email: of.rep_director_email ?? row.director_email ?? null,
    parent_distributor_num: of.parent_distributor_num ?? null,
    distributor_rep_name: row.distributor_rep ?? of.distributor_rep_name ?? null,
    distributor_rep_phone: of.distributor_rep_phone ?? null,
    address: row.address_line1 ?? null,
    zip_code: row.zip ?? null,
    store_phone: of.store_phone ?? null,
  };
}

/* ───────────────────────── deal writes ───────────────────────── */

export async function submitDealToPipeline(payload) {
  try {
    const native = await toNativeDeal(payload);
    const { data, error } = await supabase.from('deals').insert(native).select().single();
    if (error) return { data: null, error };
    return { data: toUiDeal(data), error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message || String(err) } };
  }
}

export async function deleteDeal(dealId) {
  if (!dealId) return { error: { message: 'Missing deal id.' } };
  const { error } = await supabase.from('deals').delete().eq('id', dealId);
  return { error };
}

export function canDeleteQuote(row) {
  if (!row || row.is_quote !== true) return false;
  const declined = row.customer_decision === 'declined';
  const neverViewed = !row.quote_first_viewed_at;
  return declined || neverViewed;
}

export async function generateQuoteNumber() {
  const { data, error } = await supabase.rpc('generate_quote_number');
  return { data, error };
}

export async function fetchQuoteForCustomer(quoteNumber, token) {
  if (!quoteNumber || !token) return { data: null, error: { message: 'Missing quote number or token.' } };
  const { data, error } = await supabase
    .from('deals').select('*')
    .eq('quote_number', quoteNumber).eq('quote_token', token)
    .maybeSingle();
  return { data: data ? toUiDeal(data) : null, error };
}

export async function recordQuoteView(quoteNumber, token) {
  if (!quoteNumber || !token) return;
  try {
    const now = new Date().toISOString();
    await supabase.from('deals')
      .update({ quote_last_viewed_at: now, quote_first_viewed_at: now })
      .eq('quote_number', quoteNumber).eq('quote_token', token)
      .is('quote_first_viewed_at', null);
    await supabase.from('deals')
      .update({ quote_last_viewed_at: now })
      .eq('quote_number', quoteNumber).eq('quote_token', token);
  } catch (err) {
    console.warn('Quote view tracking failed (non-fatal):', err);
  }
}

/* ───────────────────────── deal reads ───────────────────────── */

export async function fetchMyDeals(email) {
  // Native scoping: resolve email -> users.id, filter by assigned_rep_id.
  const repId = await userIdByEmail(email);
  if (!repId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('deals').select('*')
    .eq('assigned_rep_id', repId)
    .order('created_at', { ascending: false });
  return { data: (data || []).map(toUiDeal), error };
}

export async function fetchDealById(dealId) {
  if (!dealId) return { data: null, error: { message: 'Missing deal id.' } };
  const { data, error } = await supabase.from('deals').select('*').eq('id', dealId).maybeSingle();
  return { data: data ? toUiDeal(data) : null, error };
}

export async function updateQuote(dealId, patch) {
  const now = new Date().toISOString();
  // patch arrives in UI vocabulary; translate the lifecycle fields if present.
  const native = { ...patch, quote_last_sent_at: now, updated_at: now };
  if (patch.phase || patch.current_step) {
    Object.assign(native, toNativeStageStep(patch.phase, patch.current_step));
    delete native.phase;
  }
  const { data, error } = await supabase.from('deals').update(native).eq('id', dealId).select().single();
  return { data: data ? toUiDeal(data) : null, error };
}

/* ───────────────────────── audit trail (deal_events) ───────────────────────── */

export async function logDealActivity(dealId, action, detail, actor) {
  if (!dealId) return;
  try {
    await supabase.from('deal_events').insert({
      deal_id: dealId,
      event_type: action,
      note: detail || null,
      actor_name: actor || null,
      source_system: 'deal_builder',
    });
  } catch (err) {
    console.warn('Could not log deal activity:', err);
  }
}

export async function logDealRevision({ dealId, revision, changedBy, changeKind, diff, notes }) {
  if (!dealId) return { error: { message: 'Missing deal id.' } };
  try {
    const { error } = await supabase.from('deal_events').insert({
      deal_id: dealId,
      event_type: `revision:${changeKind}`,
      actor_name: changedBy || null,
      note: notes || (diff ? JSON.stringify(diff) : null),
      source_system: 'deal_builder',
    });
    if (error) console.warn('Could not log deal revision:', error);
    return { error };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

/* ───────────────────────── customer decision ───────────────────────── */

export async function recordCustomerDecision({ dealId, decision, notes, actor, currentRevision }) {
  const now = new Date().toISOString();
  const patch = {
    customer_decision: decision.value,
    customer_decision_at: now,
    customer_decision_notes: notes || null,
    updated_at: now,
  };
  if (decision.nextPhase) {
    Object.assign(patch, toNativeStageStep(decision.nextPhase, decision.nextStep));
  }
  if (decision.closed) {
    patch.deal_status = 'closed';
    patch.stage = 'lost';
  }
  const { data: updated, error } = await supabase
    .from('deals').update(patch).eq('id', dealId).select().single();
  if (error) return { data: null, error };

  await logDealRevision({
    dealId, revision: (currentRevision || 0) + 1, changedBy: actor,
    changeKind: 'decision',
    diff: { decision: decision.value, next_phase: decision.nextPhase, closed: !!decision.closed },
    notes,
  });
  await logDealActivity(
    dealId, `Customer decision: ${decision.label}`,
    decision.nextPhase ? `Advanced to ${decision.nextPhase}` : 'Closed', actor
  );
  return { data: toUiDeal(updated), error: null };
}

/* ───────────────────────── bundles ───────────────────────── */

export async function insertDealBundle(payload) {
  // payload is the old deal_bundles shape; map the common fields, keep the rest in snapshot.
  const row = {
    deal_id: payload.deal_id,
    bundle_id: payload.bundle_id || null,
    bundle_name: payload.bundle_name || payload.name || null,
    target_monthly_fee: payload.target_monthly_fee ?? null,
    term_months: payload.term_months ?? null,
    lease_rate: payload.lease_rate ?? null,
    total_monthly_charged: payload.total_monthly_charged ?? null,
    snapshot: payload.snapshot || payload,
  };
  const { data, error } = await supabase.from('deal_bundles').insert(row).select().single();
  return { data, error };
}

export async function setDealTotalMonthly(dealId, totalMonthlyCharged) {
  const { error } = await supabase.from('deals')
    .update({ total_monthly_charged: totalMonthlyCharged }).eq('id', dealId);
  return { error };
}

export async function fetchDealBundle(dealId) {
  if (!dealId) return { bundle: null, error: null };
  const { data, error } = await supabase.from('deal_bundles').select('*').eq('deal_id', dealId).maybeSingle();
  if (error) { console.warn('Could not fetch deal_bundle:', error); return { bundle: null, error }; }
  return { bundle: data, error: null };
}

/* ───────────────────────── director approval (My Team) ───────────────────────── */

export async function fetchTeamDeals(directorEmail, { scope = 'mine' } = {}) {
  if (scope === 'mine' && !directorEmail) return { data: [], error: null };

  if (scope === 'all') {
    // Admin cross-director view: deals in director review OR with a recorded decision.
    const { data, error } = await supabase
      .from('deals').select('*')
      .or('stage.eq.finance,director_decision.eq.approved,director_decision.eq.rejected')
      .order('customer_decision_at', { ascending: false, nullsFirst: false });
    return { data: (data || []).map(toUiDeal), error };
  }

  // Director's own queue: deals whose rep reports to this director.
  const dirId = await userIdByEmail(directorEmail);
  if (!dirId) return { data: [], error: null };
  const { data: reps } = await supabase.from('users').select('id').eq('director_id', dirId);
  const repIds = (reps || []).map(r => r.id);
  if (!repIds.length) return { data: [], error: null };
  const { data, error } = await supabase
    .from('deals').select('*')
    .in('assigned_rep_id', repIds)
    .order('customer_decision_at', { ascending: false, nullsFirst: false });
  return { data: (data || []).map(toUiDeal), error };
}

async function _directorDecision({ dealId, patch, changeKind, diff, activityAction, activityDetail, actor, currentRevision, notes }) {
  if (!dealId) return { data: null, error: { message: 'Missing deal id.' } };
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('deals').update({ ...patch, updated_at: now }).eq('id', dealId).select().single();
  if (error) return { data: null, error };
  await logDealRevision({ dealId, revision: (currentRevision || 0) + 1, changedBy: actor, changeKind, diff, notes });
  await logDealActivity(dealId, activityAction, activityDetail, actor);
  return { data: toUiDeal(updated), error: null };
}

export async function approveDeal({ dealId, notes, actor, currentRevision }) {
  const now = new Date().toISOString();
  const ns = toNativeStageStep('ops', 'customer_setup');
  return _directorDecision({
    dealId, currentRevision, actor, notes,
    patch: {
      director_decision: 'approved', director_decision_at: now,
      director_decision_by: actor || null, director_decision_notes: notes?.trim() || null,
      deal_status: 'active', ...ns,
    },
    changeKind: 'director_approval',
    diff: { decision: 'approved' },
    activityAction: 'Director approved',
    activityDetail: `${actor || 'Director'} approved — advanced to operations`,
  });
}

export async function rejectDeal({ dealId, notes, actor, currentRevision }) {
  if (!notes || !notes.trim()) console.warn('rejectDeal called without notes — UI should enforce this');
  const now = new Date().toISOString();
  return _directorDecision({
    dealId, currentRevision, actor, notes,
    patch: {
      director_decision: 'rejected', director_decision_at: now,
      director_decision_by: actor || null, director_decision_notes: notes?.trim() || null,
      deal_status: 'rejected',
    },
    changeKind: 'director_rejection',
    diff: { decision: 'rejected', reason: notes?.trim() || null },
    activityAction: 'Director rejected',
    activityDetail: `${actor || 'Director'} rejected${notes?.trim() ? `: ${notes.trim()}` : ''}`,
  });
}

export async function resubmitDeal({ dealId, notes, actor, currentRevision, currentResubmissionCount }) {
  const ns = toNativeStageStep('pending_director', 'awaiting_review');
  return _directorDecision({
    dealId, currentRevision, actor, notes,
    patch: {
      director_decision: null, director_decision_at: null, director_decision_by: null,
      director_decision_notes: null, deal_status: 'active',
      resubmission_count: (currentResubmissionCount || 0) + 1, ...ns,
    },
    changeKind: 'rep_resubmit',
    diff: { action: 'resubmit', new_count: (currentResubmissionCount || 0) + 1 },
    activityAction: 'Rep resubmitted for director review',
    activityDetail: `Resubmitted (attempt ${(currentResubmissionCount || 0) + 1})${notes?.trim() ? `: ${notes.trim()}` : ''}`,
  });
}

/* Compatibility alias: a few call sites reference the raw client object as
 * `dealPipeline`. In the single-DB model that is just the main supabase client. */
export { supabase as dealPipeline };
