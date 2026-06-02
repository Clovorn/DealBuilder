/**
 * leadsPortal.js — OneRonnoco-native rebuild.
 *
 * The original read assigned leads from the standalone distributor-leads
 * project and wrote status transitions back to it. In the OneRonnoco platform
 * leads live in the same database as everything else (public.leads), scoped to
 * a rep by the assigned_rep_id FK rather than by matching a display-name
 * string, with the activity trail in public.lead_events.
 *
 * The export surface is unchanged so the UI keeps working. "in_progress" — a
 * status the native leads.status check doesn't include (active|won|lost|
 * on_hold) — is represented natively as 'on_hold' (claimed by a rep, paused
 * from the active queue) and surfaced back to the UI as 'in_progress'.
 */
import { supabase } from './supabase.js';
import { currentUserId, userIdByEmail } from './oneronnoco.js';

export const isLeadsPortalConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ───────── native lead step model (integer <-> label) ───────── */

export const LEAD_STEP_LABELS = {
  lead_received:      'Lead received',
  awaiting_director:  'Awaiting director',
  awaiting_rep:       'Awaiting rep',
  rep_assigned:       'Rep assigned',
  customer_contacted: 'Contacted',
  follow_up:          'Follow-up',
};

const LEAD_STEP_TO_INT = {
  lead_received: 1, awaiting_director: 2, awaiting_rep: 3,
  rep_assigned: 4, customer_contacted: 5, follow_up: 6,
};
const INT_TO_LEAD_STEP = Object.fromEntries(
  Object.entries(LEAD_STEP_TO_INT).map(([k, v]) => [v, k])
);

function uiStatus(nativeStatus) {
  return nativeStatus === 'on_hold' ? 'in_progress' : nativeStatus;
}
function nativeStatus(uiStat) {
  return uiStat === 'in_progress' ? 'on_hold' : uiStat;
}

/** Hydrate a native leads row into the flat shape the UI's lead cards expect. */
function toUiLead(row) {
  if (!row) return row;
  const stepStr = INT_TO_LEAD_STEP[row.current_step] || 'rep_assigned';
  const nameParts = (row.customer_name || '').split(/\s+/);
  return {
    id: row.id,
    assigned_sales_rep: row._rep_name || null,
    dba_name: row.store_name || '',
    legal_business_name: row.store_name || '',
    customer_full_name: row.customer_name || '',
    customer_first_name: nameParts[0] || '',
    customer_last_name: nameParts.slice(1).join(' ') || '',
    contact_email: row.contact_email || '',
    phone: row.contact_phone || '',
    contact_number: row.contact_phone || '',
    store_address: '',
    customer_interest: '',
    current_step: stepStr,
    status: uiStatus(row.status),
    last_activity_at: row.updated_at,
    created_at: row.created_at,
    program_source: '',
    tradeshow_lead: '',
    deal_id: null,
    jotform_submission_id: row.jotform_submission_id || null,
    beverage_needs: '',
    notes: row.notes || '',
    which_program: '',
    distributor: row.distributor_rep || '',
    distributor_warehouse: '',
    distributor_sales_rep: row.distributor_rep || '',
    customer_distributor_number: '',
    num_locations: '',
    assigned_director_id: null,
    customer_id: row.customer_id || null,
    _native_current_step: row.current_step,
  };
}

/* ───────── reads ───────── */

export async function fetchMyLeads(repName) {
  // Native scoping by FK. repName may be a display name or email; resolve to id.
  let repId = await userIdByEmail(repName);
  if (!repId) {
    const { data: u } = await supabase
      .from('users').select('id, full_name, display_name')
      .or(`full_name.ilike.${repName},display_name.ilike.${repName}`)
      .maybeSingle();
    repId = u?.id || null;
  }
  if (!repId) return { data: [], error: null };

  const { data, error } = await supabase
    .from('leads').select('*')
    .eq('assigned_rep_id', repId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false, nullsFirst: false });
  return { data: (data || []).map(toUiLead), error };
}

export async function findLeadByDealId(dealId) {
  if (!dealId) return { data: null, error: null };
  // Native: deals carry lead_id; resolve the lead from the deal.
  const { data: deal } = await supabase.from('deals').select('lead_id').eq('id', dealId).maybeSingle();
  if (!deal?.lead_id) return { data: null, error: null };
  const { data, error } = await supabase
    .from('leads').select('*').eq('id', deal.lead_id).maybeSingle();
  return { data: data ? toUiLead(data) : null, error };
}

export async function fetchLeadActivity(leadId) {
  const { data, error } = await supabase
    .from('lead_events')
    .select('id, event_type, actor_name, from_step, to_step, note, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(30);
  // Shape to the UI's activity_log expectation.
  const mapped = (data || []).map(e => ({
    id: e.id,
    action: e.event_type,
    actor_role: e.actor_name,
    from_step: e.from_step,
    to_step: e.to_step,
    note: e.note,
    created_at: e.created_at,
  }));
  return { data: mapped, error };
}

/* ───────── status transitions ───────── */

export async function stampLeadConverted(leadId, dealId) {
  // Native: link the deal to the lead and mark the lead won.
  const { error } = await supabase
    .from('leads').update({ status: 'won', updated_at: new Date().toISOString() })
    .eq('id', leadId);
  if (!error && dealId) {
    await supabase.from('deals').update({ lead_id: leadId }).eq('id', dealId);
  }
  return { error };
}

export async function markLeadInProgress(leadId /*, draftId */) {
  // Claimed by a rep -> on_hold (drops out of the active queue).
  const { error } = await supabase
    .from('leads').update({ status: 'on_hold', updated_at: new Date().toISOString() })
    .eq('id', leadId);
  return { error };
}

export async function revertLeadToActive(leadId) {
  const { error } = await supabase
    .from('leads').update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', leadId);
  return { error };
}

export async function markLeadLost(leadId, currentStep, reason) {
  const { error } = await supabase
    .from('leads')
    .update({ status: 'lost', lost_reason: reason || null, updated_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) return { error };
  await logLeadActivity(leadId, 'ronnoco_rep', 'Marked as lost', currentStep, null, reason);
  return { error: null };
}

/* ───────── activity logging (lead_events) ───────── */

export async function logLeadActivity(leadId, actorRole, action, fromStep, toStep, note) {
  try {
    await supabase.from('lead_events').insert({
      lead_id: leadId,
      event_type: action,
      actor_name: actorRole || null,
      from_step: LEAD_STEP_TO_INT[fromStep] || null,
      to_step: LEAD_STEP_TO_INT[toStep] || null,
      note: note || null,
      source_system: 'deal_builder',
    });
  } catch (err) {
    console.warn('Could not log lead activity:', err);
  }
}

export async function logRepContact({ leadId, currentStep, method, reached, note }) {
  const METHOD_LABELS = { call: 'Call', email: 'Email', text: 'Text', visit: 'In-person' };
  const methodLabel = METHOD_LABELS[method] || method;

  let toStep = currentStep;
  if (reached) {
    if (['rep_assigned', 'lead_received', 'awaiting_director', 'awaiting_rep'].includes(currentStep)) {
      toStep = 'customer_contacted';
    } else if (currentStep === 'customer_contacted') {
      toStep = 'follow_up';
    }
  }
  const stepped = toStep !== currentStep;
  const action = stepped
    ? `${methodLabel} — reached customer: ${LEAD_STEP_LABELS[toStep] || toStep}`
    : `${methodLabel} — ${reached ? 'reached customer' : 'attempted contact'}`;

  const updatePayload = { updated_at: new Date().toISOString() };
  if (stepped) {
    updatePayload.current_step = LEAD_STEP_TO_INT[toStep] || null;
    updatePayload.current_step_name = LEAD_STEP_LABELS[toStep] || null;
  }
  const { error: updateError } = await supabase.from('leads').update(updatePayload).eq('id', leadId);
  if (updateError) return { toStep: currentStep, error: updateError };

  await logLeadActivity(leadId, 'ronnoco_rep', action, currentStep, stepped ? toStep : null, note);
  return { toStep, error: null };
}

/* ───────── helpers (unchanged behavior) ───────── */

export function leadStepLabel(step) {
  return LEAD_STEP_LABELS[step] || step || 'Unknown';
}

export function bucketLeads(leads) {
  const needContact = leads.filter((l) => l.current_step === 'rep_assigned');
  const inFollowUp  = leads.filter((l) =>
    l.current_step === 'customer_contacted' || l.current_step === 'follow_up');
  const other = leads.filter((l) =>
    l.current_step !== 'rep_assigned' &&
    l.current_step !== 'customer_contacted' &&
    l.current_step !== 'follow_up');
  return { needContact, inFollowUp, other };
}

export const PROGRAM_SOURCE_TO_DISTRIBUTOR = {
  'Java Select': 'HT Hackney',
  'Sledd':       'Team Sledd',
  'CoreMark':    'CoreMark',
};

export function leadToDraftState(lead, dealType = '') {
  const firstName = lead.customer_first_name
    || (lead.customer_full_name || '').split(/\s+/)[0] || '';
  const lastName = lead.customer_last_name
    || (lead.customer_full_name || '').split(/\s+/).slice(1).join(' ') || '';
  const notesParts = [lead.beverage_needs, lead.notes].filter(Boolean);

  return {
    store_name:               lead.dba_name || lead.legal_business_name || '',
    legal_business_name:      lead.legal_business_name || '',
    address:                  lead.store_address || '',
    contact_first_name:       firstName,
    contact_last_name:        lastName,
    contact_cell:             lead.phone || lead.contact_number || '',
    contact_email:            lead.contact_email || '',
    parent_distributor:       PROGRAM_SOURCE_TO_DISTRIBUTOR[lead.program_source]
                                || lead.program_source || '',
    distributor_warehouse:    lead.distributor_warehouse || '',
    distributor_customer_num: lead.customer_distributor_number || '',
    distributor_rep_name:     lead.distributor_sales_rep || lead.distributor || '',
    deal_type:                dealType || '',
    notes:                    notesParts.join('\n\n'),
    _fromLeadId:              lead.id || null,
    _fromJotformSubmissionId: lead.jotform_submission_id || null,
    _fromCustomerId:          lead.customer_id || null,
  };
}
