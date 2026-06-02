/**
 * oneronnoco.js — native-model helpers shared by the deals and leads adapters.
 *
 * This is the translation layer that lets the existing UI (which speaks the
 * old deal-pipeline vocabulary of `phase` + string `current_step` + email-
 * based rep scoping) run unchanged against the OneRonnoco database, whose
 * `deals`/`leads` tables use the normalized native model:
 *
 *   - deals.stage           text  (sales|leasing|finance|ops|installation|complete|lost)
 *   - deals.current_step    int   + current_step_name text
 *   - deals.assigned_rep_id uuid  -> users.id   (replaces sales_rep_email matching)
 *   - deals.customer_id     uuid  -> customers.id (match-or-create on submit)
 *   - deal_events                 unified audit trail (replaces deal_activity + deal_revisions)
 *   - leads.assigned_rep_id uuid, leads.customer_id uuid, leads.status, int current_step
 *
 * Keeping this mapping in one place means the per-screen adapters stay thin
 * and the vocabulary translation is testable and consistent.
 */
import { supabase } from './supabase.js';

/* ───────────────────────── phase <-> stage ───────────────────────── */

// The old app's `phase` values map onto OneRonnoco's `deals.stage` enum.
// pending_director has no native stage of its own; it is represented as
// stage='sales' carrying a director-review marker on current_step_name and
// deal_status. We keep the mapping explicit so it round-trips.
export const PHASE_TO_STAGE = {
  sales: 'sales',
  leasing: 'leasing',
  pending_director: 'finance', // director review is a finance-side gate
  ops: 'ops',
};

export const STAGE_TO_PHASE = {
  sales: 'sales',
  leasing: 'leasing',
  finance: 'pending_director',
  ops: 'ops',
  installation: 'ops',
  complete: 'ops',
  lost: 'sales',
};

// Old string current_step -> {stage, step int, name}. Integer ordering keeps
// the native stepper coherent. Names are human-readable and stored in
// current_step_name so nothing depends on the integer alone.
export const STEP_MAP = {
  // sales
  quoted:             { phase: 'sales',            step: 1,  name: 'Quoted' },
  // pending director
  awaiting_review:    { phase: 'pending_director', step: 1,  name: 'Awaiting Director Review' },
  // leasing
  submitted:          { phase: 'leasing',          step: 1,  name: 'Submitted' },
  notify_lender:      { phase: 'leasing',          step: 2,  name: 'Notify Lender' },
  credit_sent:        { phase: 'leasing',          step: 3,  name: 'Credit App Sent' },
  credit_received:    { phase: 'leasing',          step: 4,  name: 'Credit App Received' },
  credit_approved:    { phase: 'leasing',          step: 5,  name: 'Credit Approved' },
  credit_denied:      { phase: 'leasing',          step: 5,  name: 'Credit Denied' },
  paperwork_sent:     { phase: 'leasing',          step: 6,  name: 'Paperwork Sent' },
  paperwork_received: { phase: 'leasing',          step: 7,  name: 'Paperwork Received' },
  funded:             { phase: 'leasing',          step: 8,  name: 'Funded' },
  // ops
  customer_setup:     { phase: 'ops',              step: 1,  name: 'Customer Setup' },
  equip_ordered:      { phase: 'ops',              step: 2,  name: 'Equip Ordered' },
  equip_received:     { phase: 'ops',              step: 3,  name: 'Equip Received' },
  install_scheduled:  { phase: 'ops',              step: 4,  name: 'Install Scheduled' },
  dist_notified:      { phase: 'ops',              step: 5,  name: 'Dist. Notified' },
  installation:       { phase: 'ops',              step: 6,  name: 'Installation' },
  complete:           { phase: 'ops',              step: 7,  name: 'Complete' },
};

// Reverse lookup: given a native (stage, step int) recover the old string step.
// Built once from STEP_MAP. When ambiguous we prefer the first match.
const REVERSE_STEP = (() => {
  const out = {};
  for (const [str, m] of Object.entries(STEP_MAP)) {
    const key = `${m.phase}:${m.step}`;
    if (!(key in out)) out[key] = str;
  }
  return out;
})();

/** Map an old (phase, current_step string) to native deal columns. */
export function toNativeStageStep(phase, currentStepStr) {
  const m = STEP_MAP[currentStepStr];
  if (m) {
    return {
      stage: PHASE_TO_STAGE[m.phase] || 'sales',
      current_step: m.step,
      current_step_name: m.name,
    };
  }
  // Fallback: map phase only.
  return {
    stage: PHASE_TO_STAGE[phase] || 'sales',
    current_step: 1,
    current_step_name: null,
  };
}

/** Recover the old (phase, current_step string) from a native deal row. */
export function fromNativeRow(row) {
  const phase = STAGE_TO_PHASE[row.stage] || 'sales';
  // Prefer reconstructing from the integer step within the phase.
  const stepStr =
    REVERSE_STEP[`${phase}:${row.current_step}`] ||
    // pending_director rows are stage=finance step 1
    (phase === 'pending_director' ? 'awaiting_review' : null) ||
    (phase === 'sales' ? 'quoted' : null) ||
    null;
  return { phase, current_step: stepStr };
}

/* ───────────────────────── rep / user resolution ───────────────────────── */

const _userCache = new Map();

/** Resolve a users row id from an email. Cached per session. */
export async function userIdByEmail(email) {
  if (!email) return null;
  const key = email.toLowerCase();
  if (_userCache.has(key)) return _userCache.get(key);
  const { data } = await supabase
    .from('users')
    .select('id')
    .ilike('email', key)
    .maybeSingle();
  const id = data?.id || null;
  _userCache.set(key, id);
  return id;
}

/** Resolve the current authenticated user's users.id (by auth id, then email). */
export async function currentUserId() {
  const { data: auth } = await supabase.auth.getUser();
  const u = auth?.user;
  if (!u) return null;
  // public.users.id is 1:1 with auth.users.id in OneRonnoco.
  const { data } = await supabase.from('users').select('id').eq('id', u.id).maybeSingle();
  if (data?.id) return data.id;
  return userIdByEmail(u.email);
}

/* ───────────────────────── customer match-or-create ───────────────────────── */

/**
 * Match an existing customer or create a new one, per the OneRonnoco identity
 * rules. Returns the customer id. Never deletes/merges; uncertain creates get
 * a placeholder ONE-###### account number and merge_status='active'.
 *
 * Match order:
 *   1. account_number (exact) when supplied
 *   2. store_name (case-insensitive) + (city/state OR contact_email)
 *   3. contact_email (exact) as a last confident signal
 * Otherwise create.
 */
export async function matchOrCreateCustomer({
  storeName, legalName, accountNumber, contactName, email, phone,
  city, state, zip, addressLine1, distributorId = null,
}) {
  const store = (storeName || '').trim();
  const mail = (email || '').trim().toLowerCase();

  // 1) account number
  if (accountNumber && accountNumber.trim()) {
    const { data } = await supabase
      .from('customers').select('id')
      .eq('account_number', accountNumber.trim())
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 2) store name + city/state or email
  if (store) {
    let q = supabase.from('customers').select('id, city, state, contact_email').ilike('store_name', store);
    const { data: rows } = await q;
    if (rows && rows.length) {
      const byGeo = rows.find(r =>
        (city && r.city && r.city.toLowerCase() === city.toLowerCase() &&
         state && r.state && r.state.toLowerCase() === state.toLowerCase())
      );
      if (byGeo) return byGeo.id;
      const byMail = mail && rows.find(r => (r.contact_email || '').toLowerCase() === mail);
      if (byMail) return byMail.id;
      // single exact-name match with no conflicting geo: accept it
      if (rows.length === 1 && !city && !state) return rows[0].id;
    }
  }

  // 3) email only
  if (mail) {
    const { data } = await supabase
      .from('customers').select('id')
      .ilike('contact_email', mail)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 4) create with placeholder ONE-###### number
  const acct = await nextPlaceholderAccount();
  const { data: created, error } = await supabase
    .from('customers')
    .insert({
      store_name: store || (contactName || 'New Customer'),
      legal_business_name: legalName || null,
      account_number: acct,
      contact_name: contactName || null,
      contact_email: email || null,
      phone: phone || null,
      address_line1: addressLine1 || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      distributor_id: distributorId,
      merge_status: 'active',
      source_refs: [{ source: 'deal_builder', created_at: new Date().toISOString() }],
    })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

/** Compute the next ONE-###### placeholder account number. */
async function nextPlaceholderAccount() {
  const { data } = await supabase
    .from('customers')
    .select('account_number')
    .like('account_number', 'ONE-%')
    .order('account_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  let n = 0;
  if (data?.account_number) {
    const m = data.account_number.match(/ONE-(\d+)/);
    if (m) n = parseInt(m[1], 10);
  }
  return `ONE-${String(n + 1).padStart(6, '0')}`;
}
