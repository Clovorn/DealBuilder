import { useEffect, useMemo, useRef, useState } from 'react';
import {
  submitDealToPipeline, logDealActivity, isDealPipelineConfigured, generateQuoteNumber,
  fetchDealById, updateQuote, logDealRevision,
  insertDealBundle, setDealTotalMonthly,
} from '../lib/dealPipeline.js';
import { isQuoteable } from '../lib/pipelineSteps.js';
import { fetchDraft, insertDraft, updateDraft, deleteDraft, defaultDraftName } from '../lib/draftStorage.js';
// v33.4: when submitting a draft that was converted from a Distributor Lead,
// re-stamp the lead's deal_id with the real deals.id (overwriting the draft id
// placeholder set at convert time). Also log activity on the lead so the leads
// portal has a record of the submission moment.
import { stampLeadConverted, logLeadActivity } from '../lib/leadsPortal.js';
import { LEASE_MIN_PRICE, LEASE_RATE } from '../lib/leasing.js';
import { useLookupList } from '../lib/useLookupList.js';
import { useFieldRequirements, validateAgainstRequirements, fieldMetaFor } from '../lib/useFieldRequirements.js';
import { useDirector } from '../lib/useDirector.js';
import { fetchBundleById, useBundleEligibleEquipment } from '../lib/useBundles.js';
import { calculateBundlePricing, formatCurrency, formatMonthly, formatSoftCost } from '../lib/bundleMath.js';
import { US_STATES } from '../lib/usStates.js';
import EquipmentPicker from './EquipmentPicker.jsx';

const formatUSD = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Small pure utility helpers shared across validate, submitDeal, and
// buildBasePayload. Originally these lived inside buildBasePayload, which
// made the other call sites throw `ReferenceError: trimOrNull is not defined`
// at runtime — a real bug that silently blocked all submissions for any rep
// who triggered the validate() deal_type check or the submitDeal() director-
// approval branch. Hoisting them to module scope fixes that and also lets
// us share one source of truth for "treat empty strings as null."
const trimOrNull = (v) => {
  const t = String(v || '').trim();
  return t || null;
};
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

/* ───────────────────────── Pricing basis ───────────────────────── */

/**
 * catalogUnitPrice — the per-unit CATALOG price for a NON-BUNDLE item.
 *
 * Business rule (May 2026): non-bundle deals price off the catalog's
 * "Price 50+ units" tier (`price_50_plus`) rather than `list_price`.
 * When an item has no 50+ price on file we fall back to `list_price` so
 * nothing ever prices at $0 by accident.
 *
 * This is the price the catalog dictates, and it is the FLOOR for any
 * rep-entered sell price (see effectiveUnitPrice). Bundles are unaffected —
 * their pricing is computed entirely in bundleMath.js / bundlePricing and
 * never calls this helper.
 */
function catalogUnitPrice(item) {
  if (!item) return 0;
  const p50 = item.price_50_plus;
  if (p50 != null && p50 !== '' && Number(p50) > 0) return Number(p50);
  return item.list_price ?? 0;
}

/**
 * sellPriceFloor — the lowest sell price a rep may enter for an item. Equal
 * to the catalog unit price; reps can raise above this but never below.
 */
function sellPriceFloor(item) {
  return catalogUnitPrice(item);
}

/**
 * effectiveUnitPrice — the per-unit price actually used to build a deal.
 *
 * Custom sell price (Nov 2026): on PURCHASE/CASH deals only, a rep may raise
 * the per-line sell price above the catalog price (e.g. selling above stated
 * retail). The override lives only on the deal/quote — it never changes the
 * catalog. It is RAISE-ONLY: the catalog price is the floor, so an override
 * below the floor (or a malformed one) is ignored and the catalog price is
 * used instead.
 *
 * Overrides apply ONLY when `allowOverride` is true. Lease/Finance/Loan deals
 * and bundles pass allowOverride=false and always get the catalog price, so
 * their pricing is identical to before this feature.
 */
function effectiveUnitPrice(item, { allowOverride = false } = {}) {
  if (!item) return 0;
  const floor = catalogUnitPrice(item);
  if (allowOverride) {
    const ov = Number(item.sell_price_override);
    if (Number.isFinite(ov) && ov > floor) return ov;
  }
  return floor;
}

/* ───────────────────────── Equipment summary ───────────────────────── */

function summarizeEquipment(items, { useListPrice = false, allowOverride = false } = {}) {
  if (!items.length) return { text: '', total: 0 };
  const unit = (it) =>
    useListPrice ? (it.list_price ?? 0) : effectiveUnitPrice(it, { allowOverride });
  const lines = items.map((it) => {
    const price = unit(it);
    const modelStr = it.model ? ` (${it.model})` : '';
    return `${it.quantity}× ${it.description}${modelStr} — ${formatUSD(price)} ea`;
  });
  const total = items.reduce((sum, it) => sum + unit(it) * it.quantity, 0);
  return { text: lines.join('\n'), total };
}

/* ───────────────────────── Initial draft state ───────────────────────── */

function makeBlankDraft(profile, session) {
  return {
    // Submission metadata
    route_number: '',
    sales_rep_first_name: (profile?.display_name || '').split(' ')[0] || '',
    sales_rep_last_name:  (profile?.display_name || '').split(' ').slice(1).join(' ') || '',
    sales_rep_email:      session?.user?.email || '',

    // Customer identity
    is_new_customer: false,                      // toggle: "Is this a current Ronnoco Customer?" — INVERTED label
    customer_account: '',
    customer_type: '',                           // C-Store / Food Service
    sub_group: '',
    henderson_account: false,
    change_of_ownership: false,
    prior_account_num: '',
    change_details: '',

    // Chain & location
    chain_store: false,
    chain_group_num: '',
    number_of_locations: '',
    store_name: '',
    legal_business_name: '',
    address: '',                                  // Street address
    city: '',
    state: '',
    zip_code: '',
    store_phone: '',

    // Primary contact
    contact_first_name: '',
    contact_last_name: '',
    contact_cell: '',
    contact_email: '',

    // Coffee program & delivery
    coffee_program: '',
    distribution_method: 'Indirect (Distributor)', // Most deals are Indirect; rep can switch to DSD
    delivery_method: '',
    delivery_recurrence: '',
    current_coffee_supplier: '',
    parts_service_option: '',

    // Distributor info
    parent_distributor: '',
    parent_distributor_num: '',
    core_mark_div_num: '',
    distributor_warehouse: '',
    distributor_customer_num: '',
    distributor_rep_name: '',
    distributor_rep_email: '',
    distributor_rep_phone: '',

    // ROM & region
    rom_person: '',
    rom_email: '',
    rom_region: '',

    // Equipment & financials
    deal_type: '',
    coffee_spend_3mo: '',
    expected_monthly_sales: '',

    // Install
    target_install_date: '',
    need_by_date: '',
    emergency_install: false,
    emergency_install_details: '',

    // Graphics
    graphics_package: '',
    ship_graphics_with_equip: false,
    has_custom_graphics: false,

    // Notes
    notes: '',

    // Quote-specific (only used when submitting as Quote rather than Deal).
    // Cover note appears at the top of the customer-facing quote page; valid_until
    // is the expiration date shown to the customer. Defaults populated when the rep
    // toggles to quote mode (see submitAsQuote()).
    quote_cover_note: '',
    quote_valid_until: '',   // YYYY-MM-DD format for <input type=date>
  };
}

/**
 * Convert a pipeline `deals` row into the shape DealBuilder's draft state
 * expects. Used when editing a previously-sent quote — the rep clicks
 * Edit/Re-send from My Deals and we hydrate the form from the pipeline
 * record instead of from a `deal_drafts` row.
 *
 * Two complications:
 *   1. The pipeline schema uses a different shape than the form's `draft`
 *      object — some fields are renamed (sales_rep is a single string in
 *      pipeline, two fields in the form), some are stringified, some are
 *      boolean-as-Yes/No. We unpick those here so the form doesn't have
 *      to.
 *   2. The structured equipment list lives in raw_csv.equipment_items
 *      (we stashed it there at submit time as a JSON snapshot). We
 *      restore it as the equipmentItems array.
 *
 * Returns { draft, equipmentItems } — the caller drops these straight
 * into state.
 */
function hydrateFromPipelineDeal(row, profile, session) {
  const blank = makeBlankDraft(profile, session);
  if (!row) return { draft: blank, equipmentItems: [] };

  // Split sales_rep "First Last" back into first+last when only one column.
  // Prefer the rep's own session if it matches sales_rep_email (better data).
  const [repFirst, ...repRest] = (row.sales_rep || '').split(/\s+/);
  const repLast = repRest.join(' ');

  // contact_name = "First Last" was set at submit time when first+last were both filled
  const [ctFirst, ...ctRest] = (row.contact_name || '').split(/\s+/);
  const ctLast = ctRest.join(' ');

  const draft = {
    ...blank,
    // Sales rep — prefer first/last from the original session over the
    // re-split, but fall back to the split if needed.
    route_number: row.route_number || '',
    sales_rep_first_name: row.first_name && row.sales_rep ? repFirst : (blank.sales_rep_first_name || repFirst || ''),
    sales_rep_last_name:  row.sales_rep ? repLast : blank.sales_rep_last_name || '',
    sales_rep_email:      row.sales_rep_email || blank.sales_rep_email,

    // Customer identity
    is_new_customer:      !!row.is_new_customer,
    customer_account:     row.customer_account || '',
    customer_type:        row.customer_type || '',
    sub_group:            row.sub_group || '',
    henderson_account:    !!row.henderson_account,
    change_of_ownership:  !!row.change_of_ownership,
    prior_account_num:    row.prior_account_num || '',
    change_details:       row.change_details || '',

    // Chain & location
    chain_store:          row.chain_store === 'Yes' || row.chain_store === true,
    chain_group_num:      row.chain_group_num || '',
    number_of_locations:  row.number_of_locations ?? '',
    store_name:           row.store_name || '',
    legal_business_name:  row.legal_business_name || '',
    address:              row.address || '',
    city:                 row.city || '',
    state:                row.state || '',
    zip_code:             row.zip_code || '',
    store_phone:          row.store_phone || '',

    // Primary contact — use stored first/last directly when available,
    // fall back to splitting contact_name.
    contact_first_name:   row.first_name || ctFirst || '',
    contact_last_name:    row.last_name  || ctLast  || '',
    contact_cell:         row.contact_cell || row.phone || '',
    contact_email:        row.contact_email || row.email || '',

    // Coffee program & delivery
    coffee_program:           row.coffee_program || '',
    distribution_method:      row.distribution_method || blank.distribution_method,
    delivery_method:          row.delivery_method || '',
    delivery_recurrence:      row.delivery_recurrence || '',
    current_coffee_supplier:  row.current_coffee_supplier || '',
    parts_service_option:     row.parts_service_option || '',

    // Distributor
    parent_distributor:        row.parent_distributor || '',
    parent_distributor_num:    row.parent_distributor_num || '',
    core_mark_div_num:         row.core_mark_div_num || '',
    distributor_warehouse:     row.distributor_warehouse || '',
    distributor_customer_num:  row.distributor_customer_num || '',
    distributor_rep_name:      row.distributor_rep_name || '',
    distributor_rep_email:     row.distributor_rep_email || '',
    distributor_rep_phone:     row.distributor_rep_phone || '',

    // ROM
    rom_person:           row.rom_person || '',
    rom_email:            row.rom_email || '',
    rom_region:           row.rom || row.rom_region || '',

    // Equipment & financials
    deal_type:            row.deal_type || '',
    coffee_spend_3mo:     row.coffee_spend_3mo ?? '',
    expected_monthly_sales: row.expected_monthly_sales ?? '',

    // Install
    target_install_date:  row.target_install_date || '',
    need_by_date:         row.need_by_date || '',
    emergency_install:    row.emergency_install === 'Yes' || row.emergency_install === true,
    emergency_install_details: row.emergency_install_details || '',

    // Graphics
    graphics_package:        row.graphics_package || '',
    ship_graphics_with_equip: !!row.ship_graphics_with_equip,
    has_custom_graphics:      !!row.has_custom_graphics,

    // Internal notes
    notes:                row.notes || '',

    // Quote-specific
    quote_cover_note:     row.quote_cover_note || '',
    quote_valid_until:    row.quote_valid_until || '',
  };

  // Equipment items — preferred source is raw_csv.equipment_items (structured),
  // fall back to nothing if the snapshot is missing. We don't try to re-parse
  // the equipment_selection text blob — that's the human-readable summary,
  // not authoritative.
  const equipmentItems = Array.isArray(row.raw_csv?.equipment_items)
    ? row.raw_csv.equipment_items
    : [];

  return { draft, equipmentItems };
}

/* ───────────────────────── Main component ───────────────────────── */

export default function DealBuilder({ profile, session, navigate, draftId = null, editQuoteId = null, bundleId = null, leadData = null }) {
  const [draft, setDraft] = useState(() => {
    const blank = makeBlankDraft(profile, session);
    if (leadData) {
      // Pre-fill customer fields from a Distributor Leads portal lead.
      // The rep can edit everything before submitting.
      return {
        ...blank,
        store_name:        leadData.dba_name || '',
        contact_email:     leadData.contact_email || '',
        contact_cell:      leadData.phone || '',
        address:           leadData.store_address || '',
        notes:             leadData.customer_interest
                             ? `Lead interest: ${leadData.customer_interest}`
                             : '',
        _fromLeadId:       leadData.id || null,   // stashed for post-submit conversion stamp
      };
    }
    return blank;
  });
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successInfo, setSuccessInfo] = useState(null);

  // Auto-scroll the error banner into view when one appears. The banner
  // renders below the submit buttons; on a long form (which this is), the
  // rep taps Submit and the error appears off-screen — they see no visible
  // change and report "button does nothing." Multiple reps have hit this.
  // Smooth-scroll the banner into view as soon as it renders so the error
  // is always visible.
  const errorRef = useRef(null);
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  /**
   * submitMode — which lifecycle the rep is currently building toward.
   *
   * Default 'quote' because that's the more common path (rep meets prospect →
   * sends quote → customer decides → either lease or finance flows back into a
   * full deal). Direct-to-deal is the exception for known accounts that have
   * already verbally agreed.
   *
   * This drives BOTH validation (which fields are required) and rendering
   * (which sections are even shown). Switching modes never destroys data —
   * deal-only field values are preserved in draft and reappear if the rep
   * switches back, so a half-filled deal sheet doesn't get truncated when
   * the rep changes their mind.
   */
  const [submitMode, setSubmitMode] = useState('quote');

  /* ───── Draft persistence state ─────
   * currentDraftId  — uuid of the deal_drafts row this form represents, or
   *                   null if the rep has never saved (i.e. nothing in the DB
   *                   yet). On a successful submit we delete this row.
   * draftStatus     — drives the small status indicator next to the Save
   *                   Draft button. 'idle' | 'saving' | 'saved' | 'error'.
   * hydrating       — true while we're fetching an existing draft from URL.
   *                   Used to show a loading placeholder instead of the blank
   *                   form (otherwise the rep sees an empty form for ~300ms
   *                   then it suddenly fills in — feels broken).
   * hydrationError  — non-null if the requested draft id couldn't be loaded
   *                   (deleted, wrong user, transient DB error). Surfaced as
   *                   an inline notice; the rep can still use the blank form.
   */
  const [currentDraftId, setCurrentDraftId] = useState(draftId);
  const [draftStatus, setDraftStatus] = useState('idle');   // 'idle' | 'saving' | 'saved' | 'error'
  const [hydrating, setHydrating] = useState(Boolean(draftId) || Boolean(editQuoteId));
  const [hydrationError, setHydrationError] = useState(null);

  /* ───── Quote-edit state ─────
   * editingQuote — the full pipeline `deals` row we're editing, or null if
   *                we're not in edit mode. Held so we can preserve fields
   *                we don't change (quote_number, quote_token, original
   *                quote_first_sent_at, raw_csv, etc.) and bump the right
   *                quote_revision counter on re-send.
   * resending    — true while the re-send pipeline UPDATE is in flight.
   *                Drives the button label and prevents double-clicks.
   * editMode     — convenience boolean derived from editingQuote being set,
   *                used to switch UI affordances throughout the form.
   */
  const [editingQuote, setEditingQuote] = useState(null);
  const [resending, setResending] = useState(false);
  const editMode = Boolean(editingQuote);

  /* ───── Bundle mode state (v27) ─────
   * bundleConfig — the bundles row this deal is being built from, with its
   *                math params (soft_cost_pct, service_reserve, lease_rate,
   *                term_months) and identity (id, name, image_url, etc.).
   *                Null when not in bundle mode.
   * bundleMode   — convenience boolean derived from bundleConfig being set.
   * bundleHydrating — true while we load the bundle and its default items.
   * bundleError  — error string if the bundle could not be loaded.
   *
   * Bundle mode is mutually exclusive with edit and draft modes. The router
   * resolves precedence (edit > draft > bundle) so we don't need to worry
   * about competing hydrations here.
   */
  const [bundleConfig, setBundleConfig] = useState(null);
  // v29: keep the bundle's DEFAULT equipment list separate from the deal's
  // current equipmentItems. The default list is the math helper's input for
  // back-solving the service reserve from target_monthly_fee. equipmentItems
  // changes as the rep substitutes; bundleDefaultItems stays frozen.
  const [bundleDefaultItems, setBundleDefaultItems] = useState(null);
  const [bundleHydrating, setBundleHydrating] = useState(Boolean(bundleId) && !draftId && !editQuoteId);
  const [bundleError, setBundleError] = useState(null);
  const bundleMode = Boolean(bundleConfig);

  // Bundle-eligible equipment pool — fetched once for the picker filter.
  // Lenient mode (per spec): we'll merge this with the bundle's default
  // equipment ids so reps can re-add any item that was originally in the
  // bundle even if it isn't separately flagged bundle_eligible.
  const { ids: eligibleIds } = useBundleEligibleEquipment({ enabled: bundleMode });

  /**
   * Hydrate an existing draft when the page mounts with ?draft=<uuid> in the
   * URL. The draft row stores the entire `draft` object and `equipmentItems`
   * array — we drop them straight into state and the form re-renders with
   * everything restored exactly as the rep left it.
   *
   * RLS scopes the SELECT to user_id = auth.uid(), so a rep can't load a
   * draft they don't own — the DB just returns null and we fall through to
   * a friendly "draft not found" notice. The blank form still works.
   */
  useEffect(() => {
    if (!draftId) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    setHydrationError(null);

    fetchDraft(draftId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setHydrationError(`Could not load draft: ${error.message}`);
          setHydrating(false);
          return;
        }
        if (!data) {
          // No row — the draft was deleted or belongs to someone else (RLS
          // hides it). Clear the URL param so refreshing doesn't keep trying.
          setHydrationError('That draft no longer exists. Starting fresh.');
          setCurrentDraftId(null);
          setHydrating(false);
          return;
        }
        // Merge over a blank draft so newly-added schema fields (added since
        // the draft was saved) get their defaults rather than ending up
        // undefined and tripping controlled-input warnings.
        const blank = makeBlankDraft(profile, session);
        setDraft({ ...blank, ...(data.draft_state || {}) });
        setEquipmentItems(Array.isArray(data.equipment_items) ? data.equipment_items : []);
        setSubmitMode(data.submit_mode === 'deal' ? 'deal' : 'quote');
        setCurrentDraftId(data.id);
        setHydrating(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setHydrationError(`Could not load draft: ${err.message}`);
        setHydrating(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  /**
   * Hydrate from a pipeline `deals` row when the page mounts with
   * ?edit=<uuid> in the URL. This is the quote-editor entry point — the
   * rep clicked Edit on a previously-sent quote in My Deals.
   *
   * Edit mode is mutually exclusive with draft mode. If both URL params
   * are set we prefer edit (per the router's params handling) and ignore
   * draft. The form's data shape is the same either way — only the
   * submit-side behaviour changes (re-send + revision log vs new insert).
   */
  useEffect(() => {
    if (!editQuoteId) return;
    let cancelled = false;
    setHydrating(true);
    setHydrationError(null);

    fetchDealById(editQuoteId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setHydrationError(`Could not load quote: ${error.message}`);
          setHydrating(false);
          return;
        }
        if (!data) {
          setHydrationError('That quote could not be found.');
          setHydrating(false);
          return;
        }
        // Sanity check — only quotes still awaiting a customer response are
        // editable from this path. A row that has moved past the sales phase
        // (e.g. into leasing, ops, pending_director) OR whose customer has
        // already recorded a decision shouldn't be re-edited here — that
        // would silently skip the workflow that already advanced.
        //
        // Bug-fix history (May 2026): this used to gate on `!data.is_quote`
        // because the older recordCustomerDecision flipped is_quote to false
        // on a decision. That coupling broke the customer-facing URL (which
        // also required is_quote=true), so the flip was removed. The edit
        // block now checks phase/customer_decision directly, which is what
        // it was always trying to express.
        const customerHasDecided =
          data.customer_decision && data.customer_decision !== 'pending';
        const phaseAdvanced = data.phase && data.phase !== 'sales';
        const directSubmitDeal = data.is_quote === false; // legacy: pre-fix deals
        if (customerHasDecided || phaseAdvanced || directSubmitDeal) {
          let msg = "This deal isn't a quote and can't be edited from here.";
          if (customerHasDecided) {
            const decisionLabel = data.customer_decision;
            msg = `The customer already recorded a decision (${decisionLabel}) on this quote. Open it from My Deals to see what they chose, or start a new quote if you need to re-engage.`;
          }
          // v31: director-approval phases have their own narrative.
          if (data.phase === 'pending_director' && data.director_decision === 'rejected') {
            msg = 'This deal was rejected by the director. Open it from My Deals to revise and resubmit — editing here would skip that flow.';
          } else if (data.phase === 'pending_director' && data.director_decision === 'approved') {
            msg = "This deal was approved by the director and has moved into operations. It can't be edited from the Deal Builder anymore — use the Pipeline dashboard.";
          } else if (data.phase === 'pending_director') {
            msg = "This deal is waiting on director approval. Edits are locked while it's in review — please wait for the decision.";
          } else if (data.phase === 'leasing') {
            msg = "This deal has moved into leasing. It can't be edited from the Deal Builder — use the Pipeline dashboard.";
          } else if (data.phase === 'ops') {
            msg = "This deal has moved into operations. It can't be edited from the Deal Builder — use the Pipeline dashboard.";
          }
          setHydrationError(msg);
          setHydrating(false);
          return;
        }
        const { draft: hydratedDraft, equipmentItems: hydratedItems } =
          hydrateFromPipelineDeal(data, profile, session);
        setDraft(hydratedDraft);
        setEquipmentItems(hydratedItems);
        setSubmitMode('quote');     // editing a quote is always quote mode
        setEditingQuote(data);
        setHydrating(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setHydrationError(`Could not load quote: ${err.message}`);
        setHydrating(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editQuoteId]);

  // Lookup lists
  const distributorList     = useLookupList('parent_distributor');
  const coffeeProgramList   = useLookupList('coffee_program');
  const customerTypeList    = useLookupList('customer_type');
  const distributionList    = useLookupList('distribution_method');
  const dealTypeList        = useLookupList('deal_type');
  const graphicsList        = useLookupList('graphics_package');
  const romPersonList       = useLookupList('rom_person');
  const romRegionList       = useLookupList('rom_region');

  // Field requirements config (admin-managed: Apply to Quote / Deal / Both / Optional)
  const { rules: fieldRules } = useFieldRequirements();

  // Director auto-fill (v24): fetch the rep's director once when the form
  // mounts. We stamp director_user_id/name/email onto every submitted deal so
  // the pipeline dashboard can filter by "my team" for directors and so
  // notification workflows know who to email. If the rep has no director
  // assigned, this returns null and the deal submits with null director columns.
  const { director: myDirector, loading: directorLoading } = useDirector();

  /**
   * Hydrate from a bundle when the page mounts with ?bundle=<uuid> in the URL.
   * v27: bundle mode is mutually exclusive with edit and draft modes. The
   * router resolves precedence (edit > draft > bundle) but we short-circuit
   * defensively here too.
   *
   * What this does:
   *   1. Load the bundle config from catalog (math params, name, etc.)
   *   2. Load the bundle's included items as the starting equipment list
   *   3. Force deal_type to "Lease Equipment" (locked in bundle mode)
   *
   * On error, leave the deal in "fell back to blank" state with a banner so
   * the rep isn't stuck — they can still build a deal manually.
   */
  useEffect(() => {
    if (!bundleId || draftId || editQuoteId) {
      setBundleHydrating(false);
      return;
    }
    let cancelled = false;
    setBundleHydrating(true);
    setBundleError(null);

    fetchBundleById(bundleId)
      .then(({ bundle, items, error }) => {
        if (cancelled) return;
        if (error) {
          setBundleError(error);
          setBundleHydrating(false);
          return;
        }
        if (!bundle) {
          setBundleError('Bundle not found.');
          setBundleHydrating(false);
          return;
        }
        setBundleConfig(bundle);
        // Pre-load the bundle's default equipment as the starting deal items.
        setEquipmentItems(items);
        // v29: also freeze a copy of the default items for the math helper.
        // The reserve back-solve always uses the default load, regardless of
        // what the rep substitutes onto the deal afterwards.
        setBundleDefaultItems(items);
        // Lock the deal_type to Lease in bundle mode. The UI surfaces this
        // as a read-only chip alongside the bundle name.
        setDraft((prev) => ({ ...prev, deal_type: 'Lease Equipment' }));
        setBundleHydrating(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setBundleError(err.message || String(err));
        setBundleHydrating(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId]);

  /* ───── Bundle pricing computation ─────
   * Live calculation of the bundle math against the current equipment list.
   * Recomputes every time equipment changes. Used for the rep-side breakdown
   * UI, the eligibility check, and the snapshot stored on submit.
   *
   * v29: passes the bundle's DEFAULT items (bundleDefaultItems) as
   * defaultEquipment so the math helper can back-solve the service reserve
   * from target_monthly_fee. The customer pays exactly the target at the
   * default load; substitutions and add-ons move the monthly forward.
   */
  const bundlePricing = useMemo(() => {
    if (!bundleConfig) return null;
    return calculateBundlePricing({
      bundle: bundleConfig,
      equipment: equipmentItems,
      defaultEquipment: bundleDefaultItems,
    });
  }, [bundleConfig, equipmentItems, bundleDefaultItems]);

  /* ───── Bundle-mode allowed equipment ─────
   * Lenient mode: the EquipmentPicker shows items that are EITHER
   *   (a) bundle_eligible = true in the catalog, OR
   *   (b) already in the deal (so removed items can be re-added)
   *
   * This means a rep can substitute add-ons freely and can also undo a
   * removal of a core bundle item.
   */
  const allowedEquipmentIds = useMemo(() => {
    if (!bundleMode) return null;
    const set = new Set(eligibleIds || []);
    // Always allow items currently in the deal so the rep can adjust qty
    // even if a previously-bundle-eligible item gets un-flagged later.
    for (const it of equipmentItems) {
      if (it.equipment_id) set.add(it.equipment_id);
    }
    return set;
  }, [bundleMode, eligibleIds, equipmentItems]);

  /**
   * meta(fieldKey) → { visible, required, isOptional, knownToRules }
   *
   * Memoized closure around fieldMetaFor so JSX can ask
   *   meta('legal_business_name').required
   * without re-passing the same four args at every call site.
   *
   * Dependencies: rules (changes only on cache invalidation), submitMode
   * (the pivot), and draft (so conditional predicates like
   * change_of_ownership re-evaluate when the parent toggle flips).
   */
  const meta = useMemo(
    () => (fieldKey) => fieldMetaFor(fieldRules, fieldKey, submitMode, draft),
    [fieldRules, submitMode, draft]
  );

  // Auto-populate ROM email when a ROM person is selected (if email is on file)
  useEffect(() => {
    if (!draft.rom_person) {
      if (draft.rom_email) setDraft((p) => ({ ...p, rom_email: '' }));
      return;
    }
    const rom = romPersonList.options.find((o) => o.value === draft.rom_person);
    const newEmail = rom?.email || '';
    if (newEmail !== draft.rom_email) {
      setDraft((p) => ({ ...p, rom_email: newEmail }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.rom_person, romPersonList.options]);

  // Field updates mark the draft as dirty so the "Saved" indicator goes back
  // to idle. We don't auto-save (per v22b spec, explicit Save Draft button),
  // but the indicator should reflect reality — a "Saved" badge sitting next
  // to a freshly edited field would be misleading.
  const update = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDraftStatus((s) => (s === 'saved' ? 'idle' : s));
  };

  // Equipment mutations bypass update() (they edit equipmentItems, not draft),
  // so call this explicitly from each equipment change site.
  const markDraftDirty = () => setDraftStatus((s) => (s === 'saved' ? 'idle' : s));

  // Custom sell price (raise-only) is allowed on Purchase/Cash and Finance
  // deals, and never in bundle mode. Lease and Loan price strictly off the
  // catalog. This single flag drives the summary math, the per-row editor,
  // and the snapshot — keep them all reading from it.
  //
  // Note: Finance deals are eligible because the rep is still pricing the
  // hardware up front; the customer's actual monthly payment is set by
  // underwriting after the credit application is approved, not here, so the
  // override just raises the financed amount.
  const allowSellPriceOverride =
    !bundleMode &&
    (draft.deal_type === 'Purchase Equipment' || draft.deal_type === 'Finance Equipment');

  const eqSummary = useMemo(
    () => summarizeEquipment(equipmentItems, {
      useListPrice: bundleMode,
      allowOverride: allowSellPriceOverride,
    }),
    [equipmentItems, bundleMode, allowSellPriceOverride]
  );
  const dealTotal = eqSummary.total;
  // v27.1 bug fix — in bundle mode the lease/finance floor must be checked
  // against the bundle's leaseBasis (hardware + soft cost + service reserve),
  // NOT the raw equipment list-price total. A bundle's whole point is that
  // the customer is buying a financed package whose basis exceeds the bare
  // hardware. Without this, items under $5K that ship as part of a valid
  // bundle were tripping the LEASE_MIN_PRICE gate and the Submit button
  // stayed disabled even though bundlePricing.eligible was true.
  const financeBasis = (bundleMode && bundlePricing) ? bundlePricing.leaseBasis : dealTotal;
  const qualifiesForFinance = financeBasis >= LEASE_MIN_PRICE;
  const monthlyEstimate = qualifiesForFinance ? dealTotal * LEASE_RATE : null;

  const isIndirect       = draft.distribution_method === 'Indirect (Distributor)';
  const isDSD            = draft.distribution_method === 'DSD';
  const isCoreMark       = draft.parent_distributor === 'Core-Mark';

  /**
   * Validate the form for a given submission mode ('quote' or 'deal').
   *
   * Two layers:
   *   1) Field-config layer — reads admin-managed `field_requirements` and flags
   *      every missing required field for this mode. Conditional visibility
   *      (e.g. emergency_install_details only when emergency_install=true) is
   *      respected so we don't flag invisible fields.
   *   2) Business-rule layer — hardcoded rules that aren't admin-configurable:
   *      at least one equipment item, lease/finance ≥ $5K, customer email
   *      required when submitting a quote (so mailto: has a recipient).
   *
   * Returns null when the form passes, or a string for the rep when it doesn't.
   * The string is multi-line so the rep sees the full list at once rather than
   * fixing one field at a time.
   */
  function validate(mode = 'deal') {
    // Layer 1: field-config
    const { errors: missing } = validateAgainstRequirements({ rules: fieldRules, draft, mode });

    // Layer 2: business rules
    const businessErrors = [];
    if (equipmentItems.length === 0) {
      businessErrors.push('At least one piece of equipment must be selected.');
    }
    if (!qualifiesForFinance && (draft.deal_type === 'Lease Equipment' || draft.deal_type === 'Finance Equipment')) {
      businessErrors.push(`Lease and Finance require a deal total of at least ${formatUSD(LEASE_MIN_PRICE)}. Add more equipment or switch to "Purchase From Ronnoco".`);
    }
    if (mode === 'quote' && !String(draft.contact_email || '').trim()) {
      businessErrors.push('Customer email is required to send a quote (so we can open your email client with it pre-filled).');
    }
    // v31: Loan deals require director approval and are sales-team-internal —
    // they're never quoted to the customer. isQuoteable() returns false for
    // Loan Equipment. The Quote toggle button is also visually disabled when
    // deal_type is Loan, but a rep who managed to switch deal_type AFTER
    // entering quote mode would slip past the button gate; this catches that
    // case at submit time.
    if (mode === 'quote' && draft.deal_type && !isQuoteable(draft.deal_type)) {
      businessErrors.push(`${draft.deal_type} deals can't be quoted to customers — submit as a direct deal instead.`);
    }
    // Nov 2026: deal_type is required for quote submission. The customer-
    // facing quote shows Purchase vs Lease vs Finance differently (monthly
    // estimate appears for Lease/Finance), so a typeless quote renders blank
    // where pricing info should be. Block submission until the rep picks one.
    if (mode === 'quote' && !trimOrNull(draft.deal_type)) {
      businessErrors.push('Deal Type is required for quotes — choose Purchase, Lease, or Finance so the customer sees the correct pricing.');
    }

    if (missing.length === 0 && businessErrors.length === 0) return null;

    const parts = [];
    if (missing.length > 0) {
      parts.push(
        missing.length === 1
          ? `Missing required field: ${missing[0]}`
          : `Missing required fields (${missing.length}):\n  • ${missing.join('\n  • ')}`
      );
    }
    if (businessErrors.length > 0) {
      parts.push(businessErrors.join('\n'));
    }
    return parts.join('\n\n');
  }

  /**
   * Build the pipeline payload shared by both submitDeal and submitAsQuote.
   * The two paths set different phase/step/quote fields on top of this base.
   */
  function buildBasePayload() {
    return {
      // Customer contact (the "customer" name comes from the primary contact)
      first_name:            trimOrNull(draft.contact_first_name),
      last_name:             trimOrNull(draft.contact_last_name),
      email:                 trimOrNull(draft.contact_email),
      phone:                 trimOrNull(draft.contact_cell),  // legacy `phone` column = contact cell
      is_new_customer:       !!draft.is_new_customer,

      // Store
      store_name:            trimOrNull(draft.store_name),
      legal_business_name:   trimOrNull(draft.legal_business_name),
      address:               trimOrNull(draft.address),       // street address only now
      city:                  trimOrNull(draft.city),
      state:                 trimOrNull(draft.state),
      zip_code:              trimOrNull(draft.zip_code),
      store_phone:           trimOrNull(draft.store_phone),
      customer_account:      trimOrNull(draft.customer_account),
      customer_type:         trimOrNull(draft.customer_type),
      sub_group:             trimOrNull(draft.sub_group),
      henderson_account:     !!draft.henderson_account,
      change_of_ownership:   !!draft.change_of_ownership,
      prior_account_num:     trimOrNull(draft.prior_account_num),
      change_details:        trimOrNull(draft.change_details),
      chain_store:           draft.chain_store ? 'Yes' : 'No',
      chain_group_num:       trimOrNull(draft.chain_group_num),
      number_of_locations:   numOrNull(draft.number_of_locations),

      // Primary contact extras
      contact_name:          trimOrNull([draft.contact_first_name, draft.contact_last_name].filter(Boolean).join(' ')),
      contact_cell:          trimOrNull(draft.contact_cell),
      contact_email:         trimOrNull(draft.contact_email),

      // Sales rep
      sales_rep:             trimOrNull([draft.sales_rep_first_name, draft.sales_rep_last_name].filter(Boolean).join(' ')),
      sales_rep_email:       trimOrNull(draft.sales_rep_email),
      route_number:          trimOrNull(draft.route_number),

      // Director (v24): auto-stamped from the rep's user_profiles.director_id
      // at submit time. Stays null if rep has no director assigned.
      director_user_id:      myDirector?.director_user_id || null,
      director_name:         myDirector?.director_name || null,
      director_email:        myDirector?.director_email || null,
      // v31: rep_director_email is the dedicated column the director-approval
      // queue (MyTeamPage) filters on. We mirror director_email into it at
      // submit time so the queue's index can do a single equality lookup
      // without joining through user_profiles. director_email is still
      // populated for the existing notification + pipeline-dashboard paths.
      rep_director_email:    myDirector?.director_email || null,

      // Coffee program & delivery
      coffee_program:        trimOrNull(draft.coffee_program),
      distribution_method:   trimOrNull(draft.distribution_method),
      delivery_method:       trimOrNull(draft.delivery_method),
      delivery_recurrence:   trimOrNull(draft.delivery_recurrence),
      current_coffee_supplier: trimOrNull(draft.current_coffee_supplier),
      parts_service_option:  trimOrNull(draft.parts_service_option),

      // Distributor
      parent_distributor:    trimOrNull(draft.parent_distributor),
      parent_distributor_num: trimOrNull(draft.parent_distributor_num),
      core_mark_div_num:     trimOrNull(draft.core_mark_div_num),
      distributor_warehouse: trimOrNull(draft.distributor_warehouse),
      distributor_customer_num: trimOrNull(draft.distributor_customer_num),
      distributor_rep_name:  trimOrNull(draft.distributor_rep_name),
      distributor_rep_email: trimOrNull(draft.distributor_rep_email),
      distributor_rep_phone: trimOrNull(draft.distributor_rep_phone),

      // ROM
      rom_person:            trimOrNull(draft.rom_person),
      rom_email:             trimOrNull(draft.rom_email),
      rom:                   trimOrNull(draft.rom_region),

      // Equipment & financials
      deal_type:             trimOrNull(draft.deal_type),
      equipment_selection:   eqSummary.text,
      total_eq_cost:         formatUSD(dealTotal),
      coffee_spend_3mo:      numOrNull(draft.coffee_spend_3mo),
      expected_monthly_sales: numOrNull(draft.expected_monthly_sales),

      // Install
      target_install_date:   trimOrNull(draft.target_install_date),
      need_by_date:          trimOrNull(draft.need_by_date),
      emergency_install:     draft.emergency_install ? 'Yes' : 'No',
      emergency_install_details: trimOrNull(draft.emergency_install_details),

      // Graphics
      graphics_package:      trimOrNull(draft.graphics_package),
      ship_graphics_with_equip: !!draft.ship_graphics_with_equip,
      has_custom_graphics:   !!draft.has_custom_graphics,

      notes:                 trimOrNull(draft.notes),

      // Structured snapshot (preserves equipment + computed totals + raw form state)
      raw_csv: {
        source: 'ronnoco-deal-builder',
        // Persist equipment items. Sell-price overrides only apply on
        // Purchase deals (raise-only); on any other deal type we strip the
        // field so the saved snapshot can't carry a stale/inapplicable
        // override into the pipeline or the customer quote.
        equipment_items: allowSellPriceOverride
          ? equipmentItems
          : equipmentItems.map(({ sell_price_override, ...rest }) => rest),
        total_eq_cost_numeric: dealTotal,
        monthly_lease_estimate: monthlyEstimate,
        qualifies_for_finance: qualifiesForFinance,
      },
    };
  }

  /**
   * Generate a random URL-safe token for the quote's public link. 24 bytes
   * gives 192 bits of entropy — practically unguessable. We use the browser's
   * Web Crypto API which is available in every modern browser.
   */
  function generateQuoteToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    // Convert to URL-safe base64 (no +, /, or = chars)
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /** Build the absolute URL the customer will click in their email. */
  function buildQuoteUrl(quoteNumber, token) {
    const base = window.location.origin;
    return `${base}/#/quote/${quoteNumber}?t=${token}`;
  }

  /** Build the mailto: link with subject + body pre-filled. */
  function buildMailto(customerEmail, customerName, quoteNumber, quoteUrl, validUntil, coverNote) {
    const repName = [draft.sales_rep_first_name, draft.sales_rep_last_name].filter(Boolean).join(' ').trim() || 'Your Ronnoco rep';
    const subject = `Your Ronnoco Quote — ${quoteNumber}`;
    const greeting = customerName ? `Hi ${customerName.split(' ')[0]},` : 'Hi,';
    const noteBlock = coverNote ? `\n\n${coverNote}\n` : '';
    const validBlock = validUntil ? `\n\nThis quote is valid through ${validUntil}.` : '';
    const body =
`${greeting}
${noteBlock}
You can view the full equipment list, deal type, and pricing at the link below:

${quoteUrl}
${validBlock}

If you have any questions or want to make changes, just reply to this email and I'll get back to you.

Best,
${repName}`;
    return `mailto:${encodeURIComponent(customerEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /**
   * Persist the bundle snapshot for a freshly-inserted deal (v27).
   *
   * Called from both submitDeal and submitAsQuote after the deal row exists.
   * Writes the deal_bundles row using the live computed pricing as the
   * point-in-time snapshot, and updates the deals.total_monthly_charged
   * rollup.
   *
   * Best-effort: returns true on full success, false otherwise. The caller
   * surfaces errors to the rep but does NOT block success — the deal was
   * already inserted and the customer-facing data is preserved in
   * raw_csv.equipment_items as a fallback.
   */
  async function persistBundleSnapshot(dealId) {
    if (!bundleMode || !bundleConfig || !bundlePricing) return true;

    // v32: write the rollup first. deals.total_monthly_charged is the
    // critical column for the Pipeline dashboard and MyTeamPage detail view
    // — it's what reps + ops + directors see as "customer monthly". Even
    // if the deal_bundles snapshot insert below fails, the rollup will
    // still be correct.
    const { error: rollupErr } = await setDealTotalMonthly(dealId, bundlePricing.monthlyCharged);
    if (rollupErr) {
      console.warn('Could not set deals.total_monthly_charged:', rollupErr);
      // Non-blocking; keep going to the snapshot.
    }

    const snapshot = {
      deal_id:                 dealId,
      position:                1,
      bundle_id:               bundleConfig.id,
      bundle_name:             bundleConfig.name,
      bundle_soft_cost_pct:    bundlePricing.softCostPct,
      bundle_service_reserve:  bundlePricing.serviceReserve,
      bundle_term_months:      bundlePricing.termMonths,
      bundle_lease_rate:       bundlePricing.leaseRate,
      hardware_total:          Number(bundlePricing.hardware.toFixed(2)),
      lease_basis:             Number(bundlePricing.leaseBasis.toFixed(2)),
      monthly_raw:             Number(bundlePricing.monthlyRaw.toFixed(2)),
      monthly_charged:         bundlePricing.monthlyCharged,
      equipment:               equipmentItems.map((it) => ({
        equipment_id: it.equipment_id,
        sku:          it.sku,
        description:  it.description,
        model:        it.model,
        list_price:   it.list_price,
        quantity:     it.quantity,
        from_bundle:  !!it.from_bundle,
      })),
    };

    const { error: insertErr } = await insertDealBundle(snapshot);
    if (insertErr) {
      console.warn('Could not insert deal_bundles snapshot:', insertErr);
      return false;
    }

    return true;
  }

  /**
   * v33.4: When a draft was created by converting a Distributor Lead, the
   * lead's `deal_id` column was stamped with the draft id as a placeholder
   * (so the leads portal knows the lead has been "claimed"). Once the draft
   * is actually submitted and a real deals row exists, swap that placeholder
   * for the real deals.id so external joins/queries against the leads portal
   * resolve to the live deal.
   *
   * The _fromLeadId is stashed in the draft form state at convert time
   * (see leadToDraftState in leadsPortal.js). If the field isn't present,
   * this is a no-op — applies only to lead-converted drafts.
   *
   * All operations are best-effort: if either the stamp or the activity
   * log fails, the submitted deal is already in the pipeline so the rep's
   * primary action succeeded. We just warn in the console.
   */
  async function restampLeadIfFromLead(realDealId) {
    const leadId = draft._fromLeadId;
    if (!leadId || !realDealId) return;
    try {
      const { error: stampError } = await stampLeadConverted(leadId, realDealId);
      if (stampError) {
        console.warn('Could not re-stamp lead with submitted deal id:', stampError);
      }
      await logLeadActivity(
        leadId,
        'ronnoco_rep',
        'Deal submitted from converted lead',
        null,
        null,
        `Deal ID: ${realDealId}`
      );
    } catch (err) {
      console.warn('Lead re-stamp failed unexpectedly:', err);
    }
  }

  async function submitDeal() {
    setError(null);
    const validationError = validate('deal');
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!isDealPipelineConfigured) {
      setError('Deal pipeline is not configured. An admin needs to set VITE_DEAL_PIPELINE_URL and VITE_DEAL_PIPELINE_ANON_KEY in Netlify env vars.');
      return;
    }
    setSubmitting(true);

    // Defensive wrap: if anything between setSubmitting(true) and the end
    // throws an unhandled exception, the catch surfaces it as a visible
    // error and the finally guarantees the button is re-enabled. Without
    // this, multiple reps hit a silent-failure scenario where the button
    // appeared to "do nothing" because submitting got stuck true.
    try {
      // v32 routing fix: direct-submit Purchase and Loan deals require director
      // approval before they can proceed to operations. Lease and Finance deals
      // continue to route into the leasing phase as before.
      const dealType = trimOrNull(draft.deal_type);
      const needsDirectorApproval = dealType === 'Purchase Equipment' || dealType === 'Loan Equipment';

      const pipelinePayload = {
        ...buildBasePayload(),
        // Direct-deal lifecycle: skips the sales/quote phase entirely.
        is_quote:              false,
        current_step:          needsDirectorApproval ? 'awaiting_review' : 'submitted',
        phase:                 needsDirectorApproval ? 'pending_director' : 'leasing',
        deal_status:           'active',
        customer_decision:     'pending',
      };

      const { data: deal, error: pipelineError } = await submitDealToPipeline(pipelinePayload);
      if (pipelineError) {
        setError(`Submission failed: ${pipelineError.message}`);
        return;
      }
      await logDealActivity(
        deal.id,
        'Deal created',
        `Submitted via Ronnoco Deal Builder (${equipmentItems.length} item${equipmentItems.length === 1 ? '' : 's'}, ${formatUSD(dealTotal)})`,
        pipelinePayload.sales_rep
      );

      // v27: bundle snapshot for bundle-mode deals.
      if (bundleMode) {
        const ok = await persistBundleSnapshot(deal.id);
        if (!ok) {
          console.warn('Bundle snapshot failed; deal exists in pipeline without bundle row.');
        }
      }

      // v33.4: re-stamp lead if this deal came from a converted Distributor Lead.
      await restampLeadIfFromLead(deal.id);

      if (currentDraftId) {
        try { await deleteDraft(currentDraftId); }
        catch (err) { console.warn('Could not delete draft after submit:', err); }
      }

      setSuccessInfo({
        kind: 'deal',
        dealId: deal.id,
        customerName: [draft.contact_first_name, draft.contact_last_name].filter(Boolean).join(' '),
        storeName: draft.store_name,
      });
    } catch (err) {
      console.error('submitDeal threw:', err);
      setError(`Something went wrong while submitting the deal: ${err?.message || err}. Please try again, or take a screenshot of the browser console (F12 → Console) and share with your admin so we can fix the root cause.`);
    } finally {
      // Guarantees the button is re-enabled regardless of what happened above
      // — including unhandled exceptions, which previously left the button
      // permanently stuck.
      setSubmitting(false);
    }
  }

  /**
   * Submit-as-quote: same data, different lifecycle (phase=sales, step=quoted).
   * On success, opens the rep's email client via mailto: with the customer's
   * email pre-filled and a link to the hosted quote page in the body.
   */
  async function submitAsQuote() {
    setError(null);
    const validationError = validate('quote');
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!isDealPipelineConfigured) {
      setError('Deal pipeline is not configured. An admin needs to set VITE_DEAL_PIPELINE_URL and VITE_DEAL_PIPELINE_ANON_KEY in Netlify env vars.');
      return;
    }

    setSubmitting(true);

    // Defensive wrap — see submitDeal for rationale.
    try {
      // 1) Get the next quote number from the DB (atomic)
      const { data: quoteNumber, error: numberError } = await generateQuoteNumber();
      if (numberError || !quoteNumber) {
        setError(`Could not generate quote number: ${numberError?.message || 'unknown error'}`);
        return;
      }

      // 2) Generate a random token for the public URL
      const quoteToken = generateQuoteToken();

      // 3) Determine valid-until: rep's pick or +30 days from today
      const validUntil = draft.quote_valid_until || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);  // YYYY-MM-DD
      })();

      const now = new Date().toISOString();
      const pipelinePayload = {
        ...buildBasePayload(),
        // Quote-specific lifecycle: starts in phase=sales, step=quoted
        is_quote:                true,
        current_step:            'quoted',
        phase:                   'sales',
        deal_status:             'active',
        customer_decision:       'pending',
        quote_number:            quoteNumber,
        quote_token:             quoteToken,
        quote_cover_note:        draft.quote_cover_note?.trim() || null,
        quote_valid_until:       validUntil,
        quote_first_sent_at:     now,
        quote_last_sent_at:      now,
        quote_revision:          1,
      };

      const { data: deal, error: pipelineError } = await submitDealToPipeline(pipelinePayload);
      if (pipelineError) {
        setError(`Submission failed: ${pipelineError.message}`);
        return;
      }
      await logDealActivity(
        deal.id,
        'Quote created',
        `${quoteNumber} sent to ${draft.contact_email} (${equipmentItems.length} item${equipmentItems.length === 1 ? '' : 's'}, ${formatUSD(dealTotal)})`,
        pipelinePayload.sales_rep
      );

      // v27: bundle snapshot for bundle-mode quotes too.
      if (bundleMode) {
        const ok = await persistBundleSnapshot(deal.id);
        if (!ok) {
          console.warn('Bundle snapshot failed on quote; quote exists without bundle row.');
        }
      }

      // v33.4: re-stamp the lead with the real deal id (was draft id placeholder).
      await restampLeadIfFromLead(deal.id);

      // Same as direct-deal: draft → quote means the draft has served its
      // purpose. Best-effort delete; if it fails the rep can clean up later.
      if (currentDraftId) {
        try { await deleteDraft(currentDraftId); }
        catch (err) { console.warn('Could not delete draft after submit:', err); }
      }

      const quoteUrl = buildQuoteUrl(quoteNumber, quoteToken);
      const customerName = [draft.contact_first_name, draft.contact_last_name].filter(Boolean).join(' ');
      const mailtoUrl = buildMailto(
        draft.contact_email,
        customerName,
        quoteNumber,
        quoteUrl,
        validUntil,
        draft.quote_cover_note?.trim()
      );

      setSuccessInfo({
        kind: 'quote',
        dealId: deal.id,
        quoteNumber,
        quoteUrl,
        mailtoUrl,
        customerName,
        customerEmail: draft.contact_email,
        storeName: draft.store_name,
        validUntil,
      });

      // Auto-open the rep's email client. They can also click the button on
      // the success screen if their browser blocked the auto-open.
      window.location.href = mailtoUrl;
    } catch (err) {
      console.error('submitAsQuote threw:', err);
      setError(`Something went wrong while submitting the quote: ${err?.message || err}. Please try again, or take a screenshot of the browser console (F12 → Console) and share with your admin so we can fix the root cause.`);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Re-send an edited quote. Called by the "Re-send quote →" button that
   * replaces the regular submit button when the form is in edit mode.
   *
   * Flow:
   *   1. Validate against quote-mode rules (same as a fresh quote).
   *   2. Build the payload from the current form state — same shape as
   *      submitAsQuote, but without generating a new quote_number/token
   *      (we keep the originals so the customer's saved URL still works).
   *   3. UPDATE the existing deals row via updateQuote(), bumping
   *      quote_revision and quote_last_sent_at.
   *   4. Log a deal_revisions audit row with a high-level diff summary.
   *   5. Re-open mailto: with the existing quote URL pre-filled.
   *
   * What we deliberately keep stable across revisions:
   *   - id, quote_number, quote_token (so the customer URL doesn't break)
   *   - quote_first_sent_at (the original first-send timestamp)
   *   - is_quote stays true; phase stays 'sales'; customer_decision stays
   *     whatever it was. If the customer already decided lease/finance,
   *     editing the quote shouldn't undo that — the rep should record a
   *     new decision separately if needed.
   */
  async function resendQuote() {
    setError(null);
    if (!editingQuote) {
      setError('Internal error: edit mode active but no quote loaded.');
      return;
    }
    const validationError = validate('quote');
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!isDealPipelineConfigured) {
      setError('Deal pipeline is not configured.');
      return;
    }
    setResending(true);

    // Defensive wrap — see submitDeal for rationale.
    try {
      const base = buildBasePayload();

      // Honor any valid-until the rep set, otherwise keep the original (don't
      // silently extend an expired quote by 30 days without the rep's intent).
      const validUntil = draft.quote_valid_until || editingQuote.quote_valid_until || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
      })();

      const nextRevision = (editingQuote.quote_revision || 1) + 1;

      // Patch — everything from the form plus quote-specific updates. We
      // explicitly DO NOT touch quote_number, quote_token, quote_first_sent_at,
      // quote_first_viewed_at, customer_decision*, phase, is_quote.
      const patch = {
        ...base,
        quote_cover_note: draft.quote_cover_note?.trim() || null,
        quote_valid_until: validUntil,
        quote_revision: nextRevision,
      };

      const { data: updated, error: updErr } = await updateQuote(editingQuote.id, patch);
      if (updErr) {
        setError(`Could not save changes: ${updErr.message}`);
        return;
      }

      // Audit log — record what changed at a high level. The full before/after
      // would be more useful for forensics but we don't want a 50KB diff payload
      // per revision. Summarize.
      await logDealRevision({
        dealId: editingQuote.id,
        revision: nextRevision,
        changedBy: base.sales_rep || session?.user?.email || 'unknown',
        changeKind: 'quote_edit',
        diff: {
          equipment_count: equipmentItems.length,
          total_eq_cost: dealTotal,
          cover_note_changed:
            (draft.quote_cover_note || '') !== (editingQuote.quote_cover_note || ''),
          valid_until_changed:
            validUntil !== editingQuote.quote_valid_until,
          revision_from: editingQuote.quote_revision || 1,
          revision_to: nextRevision,
        },
        notes: `Re-sent to ${draft.contact_email}`,
      });

      await logDealActivity(
        editingQuote.id,
        'Quote re-sent',
        `Revision ${nextRevision} sent to ${draft.contact_email} (${equipmentItems.length} item${equipmentItems.length === 1 ? '' : 's'}, ${formatUSD(dealTotal)})`,
        base.sales_rep,
      );

      // Re-open the rep's email client with the existing customer URL.
      const quoteUrl = buildQuoteUrl(editingQuote.quote_number, editingQuote.quote_token);
      const customerName = [draft.contact_first_name, draft.contact_last_name].filter(Boolean).join(' ');
      const mailtoUrl = buildMailto(
        draft.contact_email,
        customerName,
        editingQuote.quote_number,
        quoteUrl,
        validUntil,
        draft.quote_cover_note?.trim(),
      );

      setSuccessInfo({
        kind: 'quote',
        dealId: editingQuote.id,
        quoteNumber: editingQuote.quote_number,
        quoteUrl,
        mailtoUrl,
        customerName,
        customerEmail: draft.contact_email,
        storeName: draft.store_name,
        validUntil,
        isResend: true,
        newRevision: nextRevision,
      });

      window.location.href = mailtoUrl;
    } catch (err) {
      console.error('resendQuote threw:', err);
      setError(`Something went wrong while re-sending the quote: ${err?.message || err}. Please try again, or take a screenshot of the browser console (F12 → Console) and share with your admin so we can fix the root cause.`);
    } finally {
      setResending(false);
    }
  }

  function startNewDeal() {
    setDraft(makeBlankDraft(profile, session));
    setEquipmentItems([]);
    setSuccessInfo(null);
    setError(null);
    setCurrentDraftId(null);
    setDraftStatus('idle');
    // After a successful submit we may have arrived here via #/deal?draft=<id>
    // (the rep resumed a draft, then submitted). The draft row has been
    // deleted, so ?draft=<id> in the URL no longer points to anything. Clear
    // it so a refresh doesn't show the "draft no longer exists" notice.
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#/deal?')) {
      window.history.replaceState(null, '', '#/deal');
    }
    window.scrollTo(0, 0);
  }

  /**
   * Save the current form state as a draft. Two paths:
   *   - First-time save (currentDraftId is null): insert a new row, capture
   *     the generated uuid, and update the URL so a refresh resumes this draft.
   *   - Re-save (currentDraftId is set): update the existing row in place.
   *
   * draft_name is auto-generated from store_name + city on first save. We
   * deliberately don't recompute it on subsequent saves — if the rep renamed
   * it in the workspace, we don't want to clobber that rename when they
   * re-save from the deal sheet.
   *
   * Errors are surfaced as a status badge rather than a blocking error toast
   * — the rep's work is still in memory and they can retry. A 401 (auth
   * expired) is the one case worth a louder warning, but Supabase already
   * shows a session-expired interstitial in that case.
   */
  async function saveDraft() {
    if (!session?.user?.id) {
      setDraftStatus('error');
      setError('You need to be signed in to save a draft.');
      return;
    }
    setDraftStatus('saving');
    setError(null);

    try {
      if (!currentDraftId) {
        // First save — insert.
        const { data, error: insErr } = await insertDraft({
          userId: session.user.id,
          email: session.user.email,
          submitMode,
          draft,
          equipmentItems,
          draftName: defaultDraftName(draft),
        });
        if (insErr) throw insErr;
        setCurrentDraftId(data.id);
        // Update the URL silently so a refresh re-hydrates this same draft.
        // history.replaceState avoids a hashchange event (and therefore a
        // re-render) — we just want the address bar to match reality.
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `#/deal?draft=${data.id}`);
        }
      } else {
        // Subsequent save — update in place. Pass null for draftName so the
        // rep's custom name (if any) is preserved.
        const { error: upErr } = await updateDraft({
          id: currentDraftId,
          submitMode,
          draft,
          equipmentItems,
          draftName: null,
        });
        if (upErr) throw upErr;
      }
      setDraftStatus('saved');
    } catch (err) {
      console.error('Save draft failed:', err);
      setDraftStatus('error');
      setError(`Could not save draft: ${err.message || 'unknown error'}`);
    }
  }

  /**
   * Switch the rep's submitMode (Quote ↔ Deal) without losing data.
   *
   * The risk we're guarding against: rep starts in Deal mode, fills in coffee
   * spend / install date / graphics, then decides "actually let me just send
   * them a quote first." Those deal-only sections will VISUALLY disappear in
   * quote mode (hidden by submitMode === 'deal' gates), and if the rep then
   * sends the quote and never switches back, their data sits there in draft
   * state but never gets transmitted. Worse, if they hit "Start another" after
   * sending the quote they'll lose it for sure.
   *
   * So when going Deal → Quote, we look at what deal-only fields currently
   * have non-empty values, list them by label, and ask the rep to confirm.
   * Values are NEVER cleared — they stay in draft so switching back restores
   * the form exactly as it was. The confirmation is purely informational.
   *
   * Going Quote → Deal is always safe (nothing gets hidden) so we skip the
   * prompt.
   */
  function changeSubmitMode(nextMode) {
    if (nextMode === submitMode) return;

    if (nextMode === 'quote' && submitMode === 'deal') {
      // Find deal-only fields that currently have non-empty values.
      const populatedDealOnly = [];
      for (const [fieldKey, rule] of fieldRules) {
        if (rule.applies_to !== 'deal') continue;
        const value = draft[fieldKey];
        const isEmpty =
          value === null ||
          value === undefined ||
          value === false ||
          (typeof value === 'string' && value.trim() === '');
        if (!isEmpty) populatedDealOnly.push(rule.field_label || fieldKey);
      }

      if (populatedDealOnly.length > 0) {
        // Show first 8 by name, then "and N more" if longer — confirm() doesn't
        // give us much layout control but a short readable list is fine.
        const preview = populatedDealOnly.slice(0, 8).join(', ');
        const more = populatedDealOnly.length > 8 ? ` and ${populatedDealOnly.length - 8} more` : '';
        const ok = window.confirm(
          `Switching to Quote will hide: ${preview}${more}.\n\n` +
          `Their values are kept and re-shown if you switch back to Deal. Continue?`
        );
        if (!ok) return;
      }
    }

    setSubmitMode(nextMode);
    setDraftStatus((s) => (s === 'saved' ? 'idle' : s));
  }

  /* Success screen — branches based on whether it was a deal or a quote */
  if (successInfo) {
    if (successInfo.kind === 'quote') {
      return (
        <div className="px-4 md:px-6 lg:px-10 py-10 max-w-3xl">
          <div className="bg-white border border-page-200 rounded-lg shadow-card p-8 md:p-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-ok/10 text-ok flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl md:text-3xl font-light text-slate-900 mb-2">
                {successInfo.isResend ? 'Updated quote ready to send' : 'Quote ready to send'}
              </h1>
              <p className="text-slate-600 leading-relaxed mb-2 max-w-md mx-auto">
                Quote <span className="font-mono font-medium text-slate-900">{successInfo.quoteNumber}</span>
                {successInfo.isResend && successInfo.newRevision && (
                  <> · <span className="text-xs text-slate-500">revision {successInfo.newRevision}</span></>
                )}
                {' '}for{' '}
                <span className="font-medium text-slate-900">{successInfo.storeName}</span>{' '}
                is {successInfo.isResend ? 'updated in' : 'saved in'} the pipeline.
              </p>
              <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                Your email client should have opened with a message to{' '}
                <span className="font-medium text-slate-700">{successInfo.customerEmail}</span> ready to send.
                If it didn't, use the buttons below.
              </p>
            </div>

            {/* Customer-facing quote URL — visible so rep can copy it manually if needed */}
            <div className="mb-6 p-4 bg-page-50 border border-page-200 rounded">
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
                  Customer-facing quote link
                </p>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(successInfo.quoteUrl);
                  }}
                  className="text-xs text-navy-700 hover:text-navy-900 font-medium"
                >
                  Copy
                </button>
              </div>
              <a
                href={successInfo.quoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-navy-700 hover:text-navy-900 break-all underline decoration-navy-300"
              >
                {successInfo.quoteUrl}
              </a>
              <p className="text-[11px] text-slate-500 mt-2">
                Valid through {successInfo.validUntil}. The customer can open this any time without signing in.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <a
                href={successInfo.mailtoUrl}
                className="px-5 py-2.5 bg-navy-900 text-chalk-50 rounded font-medium hover:bg-navy-800 transition-colors text-center"
              >
                Open email client again
              </a>
              <a
                href={successInfo.quoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 border border-page-200 bg-white rounded text-slate-700 hover:bg-page-50 transition-colors text-center"
              >
                Preview quote page
              </a>
              <button onClick={successInfo.isResend ? () => navigate('my-deals') : startNewDeal}
                      className="px-5 py-2.5 border border-page-200 bg-white rounded text-slate-700 hover:bg-page-50 transition-colors">
                {successInfo.isResend ? 'Back to My deals' : 'Start another'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Direct-deal success screen (unchanged from before)
    return (
      <div className="px-4 md:px-6 lg:px-10 py-10 max-w-3xl">
        <div className="bg-white border border-page-200 rounded-lg shadow-card p-8 md:p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-ok/10 text-ok flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-light text-slate-900 mb-2">Deal submitted</h1>
          <p className="text-slate-600 leading-relaxed mb-6 max-w-md mx-auto">
            <span className="font-medium text-slate-900">{successInfo.customerName}</span>'s deal for{' '}
            <span className="font-medium text-slate-900">{successInfo.storeName}</span>{' '}
            has been created in the pipeline. The leasing team can edit it from the Deal Pipeline dashboard.
          </p>
          <div className="text-xs font-mono text-slate-500 mb-8">Deal ID: {successInfo.dealId}</div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={startNewDeal}
                    className="px-5 py-2.5 bg-navy-900 text-chalk-50 rounded font-medium hover:bg-navy-800 transition-colors">
              Submit another deal
            </button>
            <button onClick={() => navigate('home')}
                    className="px-5 py-2.5 border border-page-200 bg-white rounded text-slate-700 hover:bg-page-50 transition-colors">
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // While we're fetching an existing draft from URL, show a quiet placeholder
  // instead of the blank form. Rendering the blank form first and then
  // replacing it ~300ms later feels broken — fields would visibly flip.
  if (hydrating) {
    return (
      <div className="px-4 md:px-6 lg:px-10 py-10 max-w-4xl">
        <div className="bg-white border border-page-200 rounded-lg shadow-card p-8 md:p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-page-50 border border-page-200 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-slate-400 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-2M20 15a8 8 0 01-14 2" />
            </svg>
          </div>
          <p className="text-sm text-slate-600">Loading your draft…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6 max-w-4xl">
      <div className="mb-5 md:mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
          {editMode
            ? `Editing quote ${editingQuote.quote_number || ''}`
            : currentDraftId
              ? 'Resuming draft'
              : 'New deal'}
        </p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">
          {editMode ? 'Edit Quote' : 'Deal Sheet'}
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          {editMode
            ? `Update what's quoted, then click Re-send. The customer's existing link (${editingQuote.quote_number}) keeps working — they'll see the updated content next time they open it.`
            : 'Complete the form and submit to create a new deal in the pipeline. After submission, the leasing team can edit the deal in the Deal Pipeline dashboard.'}
        </p>
      </div>

      {hydrationError && (
        <div className="mb-4 p-3 bg-warn/5 border border-warn/30 rounded text-xs text-slate-700">
          {hydrationError}
        </div>
      )}

      {!isDealPipelineConfigured && (
        <div className="mb-4 p-4 bg-warn/5 border border-warn/30 rounded-lg">
          <p className="text-sm text-warn font-medium mb-1">Deal pipeline not configured</p>
          <p className="text-xs text-slate-600">
            Submission is disabled until an admin sets{' '}
            <code className="bg-page-100 px-1 py-0.5 rounded font-mono">VITE_DEAL_PIPELINE_URL</code> and{' '}
            <code className="bg-page-100 px-1 py-0.5 rounded font-mono">VITE_DEAL_PIPELINE_ANON_KEY</code>{' '}
            in Netlify environment variables.
          </p>
        </div>
      )}

      {/* ─── Mode toggle: Quote vs Deal ─── */}
      {/* This is the v22a-v2 pivot. Selecting Quote shows the minimum set of
          fields needed to send a customer-facing quote; selecting Deal shows
          the full leasing/ops form. The rep can switch at any time without
          losing data — see changeSubmitMode() for the data-loss confirmation.

          Hidden in edit mode: when editing an existing quote, the lifecycle
          is fixed (it stays a quote, with the same number/token). Showing
          the toggle would imply you could re-submit as a deal, which would
          be a different flow entirely. */}
      {!editMode && (
        <div className="mb-4 bg-white border border-page-200 rounded-lg p-2">
          <div className="grid grid-cols-2 gap-2">
            {/* v31: Quote mode is disabled when deal_type is Loan Equipment.
                Loans go through director approval and are never customer-facing.
                The grayed-out look + title attribute explain why on hover. */}
            {(() => {
              const quoteDisabled = !!draft.deal_type && !isQuoteable(draft.deal_type);
              return (
            <button
              type="button"
              onClick={() => { if (!quoteDisabled) changeSubmitMode('quote'); }}
              disabled={quoteDisabled}
              title={quoteDisabled
                ? `${draft.deal_type} deals can't be quoted to customers — submit as a direct deal.`
                : undefined}
              className={`text-left rounded-md px-4 py-3 border transition-colors
                ${quoteDisabled
                  ? 'bg-page-50 border-page-200 text-slate-400 cursor-not-allowed opacity-60'
                  : submitMode === 'quote'
                  ? 'bg-navy-900 border-navy-900 text-chalk-50 shadow-card'
                  : 'bg-white border-page-200 text-slate-700 hover:border-navy-300 hover:bg-page-50'}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold">Quote</span>
              </div>
              <p className={`text-xs leading-snug ${
                quoteDisabled
                  ? 'text-slate-400'
                  : submitMode === 'quote' ? 'text-chalk-50/80' : 'text-slate-500'
              }`}>
                {quoteDisabled
                  ? 'Not available for this deal type'
                  : 'Send to customer for review'}
              </p>
            </button>
              );
            })()}
            <button
              type="button"
              onClick={() => changeSubmitMode('deal')}
              className={`text-left rounded-md px-4 py-3 border transition-colors
                ${submitMode === 'deal'
                  ? 'bg-navy-900 border-navy-900 text-chalk-50 shadow-card'
                  : 'bg-white border-page-200 text-slate-700 hover:border-navy-300 hover:bg-page-50'}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold">Deal</span>
              </div>
              <p className={`text-xs leading-snug ${submitMode === 'deal' ? 'text-chalk-50/80' : 'text-slate-500'}`}>
                Full submission to leasing/operations
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Edit-mode banner — shown in place of the mode toggle. Communicates
          that we're editing a real customer-facing quote and that re-sending
          will bump the revision counter. */}
      {editMode && (
        <div className="mb-4 bg-accent-500/5 border border-accent-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-accent-500/15 text-accent-700 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="text-sm">
              <div className="font-medium text-slate-900">
                Editing quote {editingQuote.quote_number}
                {editingQuote.quote_revision > 1 && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    (current revision {editingQuote.quote_revision})
                  </span>
                )}
              </div>
              <p className="text-slate-600 mt-0.5 leading-relaxed">
                Re-sending bumps this to revision {(editingQuote.quote_revision || 1) + 1} and
                opens your email client with the customer&apos;s existing link, so they can view
                the updated quote at the same URL. The original send date and any view history are preserved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bundle-mode banner (v27) — shown when the rep arrives via "Start
          deal from this bundle". Communicates that they're building under
          the bundle's lease math and that deal_type is locked. */}
      {bundleMode && bundleConfig && (
        <div className="mb-4 bg-navy-50 border border-navy-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            {bundleConfig.image_url ? (
              <img src={bundleConfig.image_url} alt="" className="w-12 h-12 object-contain rounded bg-white border border-page-200 flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded bg-white border border-page-200 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-navy-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            )}
            <div className="text-sm min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-navy-700 font-medium mb-0.5">
                Distributor Program Bundle
              </div>
              <div className="font-medium text-slate-900 mb-1">{bundleConfig.name}</div>
              <p className="text-slate-600 leading-relaxed">
                Deal type is locked to <span className="font-mono">Lease Equipment</span>.
                Equipment substitutions are limited to bundle-eligible items.
                The customer's monthly is computed from the equipment list using the
                bundle's soft-cost and reserve.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bundle hydration error (rare — bundle id in URL didn't resolve) */}
      {bundleError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          Couldn't load that bundle: {bundleError}. You can continue and build a non-bundle deal,
          or go back to the bundles page and pick another.
        </div>
      )}

      {/* ─── Section: Sales Rep & Submission ─── */}
      <Section title="Sales Rep & Submission">
        <FieldGrid cols={2}>
          <TextField label="Sales Rep First Name" required value={draft.sales_rep_first_name} onChange={(v) => update('sales_rep_first_name', v)} placeholder="From your profile" />
          <TextField label="Sales Rep Last Name"  required value={draft.sales_rep_last_name}  onChange={(v) => update('sales_rep_last_name', v)}  placeholder="From your profile" />
          <TextField label="Sales Rep Email"      required type="email" value={draft.sales_rep_email} onChange={(v) => update('sales_rep_email', v)} placeholder="rep@ronnoco.com" />
          {/* route_number is deal-only per field_requirements — meta('route_number').visible
              is true in deal mode (applies_to='deal') and false in quote mode. */}
          {meta('route_number').visible && (
            <TextField
              label="Route Number (RTE #)"
              required={meta('route_number').required}
              optional={meta('route_number').isOptional}
              value={draft.route_number}
              onChange={(v) => update('route_number', v)}
              placeholder="Route #"
            />
          )}
        </FieldGrid>

        {/* Director — read-only, auto-stamped from the rep's user profile.
            Shown so the rep knows who'll see this deal in their dashboard.
            If unassigned, surfaces a warning so an admin can fix it. */}
        <div className="mt-3">
          {directorLoading ? (
            <div className="text-xs text-slate-500">Loading director…</div>
          ) : myDirector ? (
            <div className="flex items-center gap-2 text-sm bg-page-50 border border-page-200 rounded px-3 py-2">
              <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-slate-600">Director:</span>
              <span className="font-medium text-slate-900">{myDirector.director_name}</span>
              <span className="text-slate-500 text-xs">({myDirector.director_email})</span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <div className="text-amber-900">
                <span className="font-medium">No director assigned.</span>
                {' '}This deal will submit, but won't appear under any director's team view.
                Ask an admin to assign you a director on your user profile.
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ─── Section: Customer Identity (deal-only) ─── */}
      {/* Whether they're a current Ronnoco customer, their account number,
          sub-group, Henderson flag, change-of-ownership — none of this matters
          to the customer reviewing a quote. The leasing team needs it later
          when the quote converts to a deal, but it's purely internal. */}
      {submitMode === 'deal' && (
        <Section title="Customer Identity">
          <Toggle label="Current Ronnoco Customer" hint="Toggle off if this is a new (not yet in CRM) customer"
                  checked={!draft.is_new_customer} onChange={(v) => update('is_new_customer', !v)} />
          <FieldGrid cols={2}>
            <TextField label="Customer Account #" value={draft.customer_account} onChange={(v) => update('customer_account', v)} placeholder="If existing customer" />
            <LookupSelect label="C-Store or Food Service?" required listState={customerTypeList} value={draft.customer_type} onChange={(v) => update('customer_type', v)} placeholder="Select…" />
            <TextField label="Sub Group" value={draft.sub_group} onChange={(v) => update('sub_group', v)} placeholder="Sub group if applicable" />
          </FieldGrid>
          <Toggle label="Henderson Account" hint="Henderson is a Ronnoco brand"
                  checked={draft.henderson_account} onChange={(v) => update('henderson_account', v)} />
          <Toggle label="Change of Ownership" hint="Existing account changing hands"
                  checked={draft.change_of_ownership} onChange={(v) => update('change_of_ownership', v)} />
          {draft.change_of_ownership && (
            <div className="space-y-3 pl-4 ml-1 border-l-2 border-accent-500/50">
              <TextField label="Verify Prior Account #" value={draft.prior_account_num} onChange={(v) => update('prior_account_num', v)} placeholder="Previous account number" />
              <TextareaField label="Change of Ownership Details" rows={3} value={draft.change_details} onChange={(v) => update('change_details', v)} placeholder="Describe the change…" />
            </div>
          )}
        </Section>
      )}

      {/* ─── Section: Chain & Location ─── */}
      {/* Store name, address, city/state/zip — required in both modes (the
          customer needs to see the shipping address on the quote). Chain-store
          flag and the optional legal-business-name / store-phone fields are
          deal-only. */}
      <Section title="Chain & Location">
        {submitMode === 'deal' && (
          <>
            <Toggle label="Chain Store" hint="This location is part of a chain or franchise"
                    checked={draft.chain_store} onChange={(v) => update('chain_store', v)} />
            {draft.chain_store && (
              <FieldGrid cols={2}>
                <TextField label="Existing Chain Ronnoco Group #" value={draft.chain_group_num} onChange={(v) => update('chain_group_num', v)} placeholder="Group #" />
                <TextField label="Number of Locations" type="number" value={draft.number_of_locations} onChange={(v) => update('number_of_locations', v)} placeholder="Total store count" />
              </FieldGrid>
            )}
          </>
        )}
        <FieldGrid cols={2}>
          <TextField span={2} label="Store / Business Name (DBA)" required value={draft.store_name} onChange={(v) => update('store_name', v)} placeholder="Store or business name" />
          {meta('legal_business_name').visible && (
            <TextField
              span={2}
              label="Legal Business Name"
              required={meta('legal_business_name').required}
              optional={meta('legal_business_name').isOptional}
              value={draft.legal_business_name}
              onChange={(v) => update('legal_business_name', v)}
              placeholder="Legal entity name if different"
            />
          )}
          <TextField span={2} label="Street Address" required value={draft.address} onChange={(v) => update('address', v)} placeholder="Street address" />
          <TextField label="City" required value={draft.city} onChange={(v) => update('city', v)} placeholder="City" />
          <SelectField label="State" required value={draft.state} onChange={(v) => update('state', v)} options={US_STATES.map(([code, name]) => ({ value: code, label: `${code} — ${name}` }))} placeholder="Select state…" />
          <TextField label="Zip Code" required value={draft.zip_code} onChange={(v) => update('zip_code', v)} placeholder="Zip" />
          {meta('store_phone').visible && (
            <TextField
              label="Store Phone"
              type="tel"
              required={meta('store_phone').required}
              optional={meta('store_phone').isOptional}
              value={draft.store_phone}
              onChange={(v) => update('store_phone', v)}
              placeholder="Store phone"
            />
          )}
        </FieldGrid>
      </Section>

      {/* ─── Section: Primary Contact ─── */}
      {/* First/last name + email are needed in both modes. Contact cell phone
          is admin-controlled via field_requirements and may be used in quote
          mode as well. */}
      <Section title="Primary Contact">
        <FieldGrid cols={2}>
          <TextField label="Contact First Name" required value={draft.contact_first_name} onChange={(v) => update('contact_first_name', v)} placeholder="First name" />
          <TextField label="Contact Last Name"  required value={draft.contact_last_name}  onChange={(v) => update('contact_last_name', v)}  placeholder="Last name" />
          {meta('contact_cell').visible && (
            <TextField
              label="Contact Cell Phone"
              type="tel"
              required={meta('contact_cell').required}
              optional={meta('contact_cell').isOptional}
              value={draft.contact_cell}
              onChange={(v) => update('contact_cell', v)}
              placeholder="(555) 000-0000"
            />
          )}
          <TextField label="Contact Email" required type="email" value={draft.contact_email} onChange={(v) => update('contact_email', v)} placeholder="customer@email.com" />
        </FieldGrid>
      </Section>

      {/* ─── Section: Coffee Program & Delivery (deal-only) ─── */}
      {/* Distribution method, coffee program selection, current supplier,
          parts/service option — operational details that the leasing team
          works out internally. Not customer-facing on the quote. */}
      {submitMode === 'deal' && (
        <Section title="Coffee Program & Delivery">
          <FieldGrid cols={2}>
            <LookupSelect label="Coffee Program" listState={coffeeProgramList} value={draft.coffee_program} onChange={(v) => update('coffee_program', v)} placeholder="Select program…" />
            <LookupSelect
              label="Distribution Method"
              required
              listState={distributionList}
              value={draft.distribution_method}
              onChange={(v) => {
                // When switching to Indirect, the distributor handles delivery —
                // clear any DSD-only values so stale data isn't submitted.
                if (v === 'Indirect (Distributor)') {
                  setDraft((p) => ({ ...p, distribution_method: v, delivery_method: '', delivery_recurrence: '' }));
                } else {
                  update('distribution_method', v);
                }
              }}
              placeholder="DSD or Indirect…"
            />
            <TextField label="Current Coffee Supplier" value={draft.current_coffee_supplier} onChange={(v) => update('current_coffee_supplier', v)} placeholder="Existing supplier name" />
            <TextField
              label="Service included with Sales and Marketing Agreement"
              value={draft.parts_service_option}
              onChange={(v) => update('parts_service_option', v)}
              placeholder="Service terms / notes"
              hint="Customer will need to sign the Sales and Marketing Agreement"
            />
          </FieldGrid>

          {/* DSD-only: Ronnoco is delivering, so the leasing team needs to know how & how often.
              For Indirect deals these are handled by the distributor and aren't asked here. */}
          {isDSD && (
            <FieldGrid cols={2}>
              <TextField label="How will it be delivered?" value={draft.delivery_method} onChange={(v) => update('delivery_method', v)} placeholder="e.g. truck, courier" />
              <TextField label="Final Delivery Recurrence" value={draft.delivery_recurrence} onChange={(v) => update('delivery_recurrence', v)} placeholder="e.g. weekly, bi-weekly" />
            </FieldGrid>
          )}
        </Section>
      )}

      {/* ─── Section: Distributor (deal-only, and only if Indirect distribution) ─── */}
      {submitMode === 'deal' && isIndirect && (
        <Section title="Distributor Information">
          <FieldGrid cols={2}>
            <LookupSelect label="Parent Distributor" required listState={distributorList} value={draft.parent_distributor} onChange={(v) => update('parent_distributor', v)} placeholder="Select distributor…" />
            <TextField label="Parent Distributor #" value={draft.parent_distributor_num} onChange={(v) => update('parent_distributor_num', v)} placeholder="Distributor #" />
            {isCoreMark && (
              <TextField label="Core-Mark Specific Div #" value={draft.core_mark_div_num} onChange={(v) => update('core_mark_div_num', v)} placeholder="Division #" span={2} />
            )}
            <TextField label="Distributor Warehouse" value={draft.distributor_warehouse} onChange={(v) => update('distributor_warehouse', v)} placeholder="Warehouse" />
            <TextField label="Distributor's Customer #" value={draft.distributor_customer_num} onChange={(v) => update('distributor_customer_num', v)} placeholder="Customer #" />
            <TextField label="Distributor Rep Name" value={draft.distributor_rep_name} onChange={(v) => update('distributor_rep_name', v)} placeholder="Rep name" />
            <TextField label="Distributor Rep Email" type="email" value={draft.distributor_rep_email} onChange={(v) => update('distributor_rep_email', v)} placeholder="rep@distributor.com" hint="Used for installation scheduling notifications" />
            <TextField label="Distributor Rep Contact Number" type="tel" value={draft.distributor_rep_phone} onChange={(v) => update('distributor_rep_phone', v)} placeholder="Phone" />
          </FieldGrid>
        </Section>
      )}

      {/* ─── Section: ROM (deal-only) ─── */}
      {/* The Regional Operations Manager assignment is an internal routing
          concern. Customer doesn't need to see it on the quote. */}
      {submitMode === 'deal' && (
        <Section title="Ronnoco Region (ROM)">
          <FieldGrid cols={2}>
            <LookupSelect label="Select the ROM" required listState={romPersonList} value={draft.rom_person} onChange={(v) => update('rom_person', v)} placeholder="Select ROM…" />
            <TextField
              label="ROM Email"
              value={draft.rom_email}
              onChange={(v) => update('rom_email', v)}
              placeholder="Auto-filled from ROM selection"
              hint={draft.rom_person && !draft.rom_email ? 'Not yet on file — admin can add via Dropdown Lists' : null}
            />
            <LookupSelect label="ROM Region" listState={romRegionList} value={draft.rom_region} onChange={(v) => update('rom_region', v)} placeholder="Select region…" span={2} />
          </FieldGrid>
        </Section>
      )}

      {/* ─── Section: Bundle Pricing (v27) ─── */}
      {/* In bundle mode, show the distributor-bundle math: hardware, soft
          cost, service reserve, lease basis, monthly raw, and the rounded
          customer monthly. The customer never sees this breakdown — it's
          here to make the math legible to the rep so they understand what
          their substitutions are doing to the monthly. */}
      {bundleMode && bundlePricing && (
        <Section
          title={`Bundle Pricing — ${bundleConfig?.name || ''}`}
        >
          <BundlePricingBreakdown
            bundle={bundleConfig}
            pricing={bundlePricing}
          />
        </Section>
      )}

      {/* ─── Section: Equipment & Deal Info ─── */}
      {/* Equipment selection is the heart of the quote — the customer absolutely
          needs to see what's being quoted. Deal Type is now shown in BOTH deal
          and quote modes (Nov 2026): the customer-facing quote distinguishes
          Lease / Finance / Purchase and shows a monthly estimate for Lease and
          Finance, so the rep must declare the type before sending. The two
          financial reference fields (last-3-month coffee spend, expected
          monthly sales) remain leasing-team-only and aren't shown on the
          customer's quote page. */}
      <Section title="Equipment & Deal Information">
        {bundleMode && (
          <div className="mb-4">
            <Label>Deal Type</Label>
            <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                            bg-navy-50 border border-navy-200 text-sm text-navy-900">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0-1.5 1-2.5 2.5-2.5S17 9.5 17 11v2H7v-2c0-3 2-5 5-5s5 2 5 5M5 13h14v8H5z" />
              </svg>
              <span>Lease Equipment</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 ml-1">
                · Locked by bundle
              </span>
            </div>
          </div>
        )}
        {!bundleMode && (
          <div className="mb-4">
            <Label required>Deal Type</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {dealTypeList.options
                /* In quote mode, hide deal types that can't be quoted to a
                   customer (Loan). The Submit-as-Quote button is also gated
                   downstream; filtering here means the rep can't even pick
                   it in the first place when they're building a quote. */
                .filter((opt) => submitMode !== 'quote' || isQuoteable(opt.value))
                .map((opt) => {
                const isFinanceType = opt.value === 'Lease Equipment' || opt.value === 'Finance Equipment';
                const disabled = isFinanceType && equipmentItems.length > 0 && !qualifiesForFinance;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => !disabled && update('deal_type', opt.value)}
                    disabled={disabled}
                    title={disabled ? `Total must be at least ${formatUSD(LEASE_MIN_PRICE)} for ${opt.value}` : undefined}
                    className={`px-3 py-1.5 rounded-full border text-xs md:text-sm transition-colors
                      ${draft.deal_type === opt.value
                        ? 'bg-navy-900 border-navy-900 text-chalk-50'
                        : disabled
                          ? 'bg-page-50 border-page-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white border-page-200 text-slate-700 hover:border-navy-300'}`}
                  >
                    {opt.value}
                  </button>
                );
              })}
            </div>
            {equipmentItems.length > 0 && !qualifiesForFinance && (
              <p className="mt-2 text-xs text-slate-500">
                Lease and finance options become available when the deal total is at least {formatUSD(LEASE_MIN_PRICE)}.
              </p>
            )}
          </div>
        )}

        {/* Equipment picker */}
        <div className="mb-4">
          <Label required>Equipment Selection</Label>
          <div className="border border-page-200 rounded-lg bg-page-50 p-3 md:p-4">
            {equipmentItems.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-slate-500 mb-3">No equipment selected yet.</p>
                <button type="button" onClick={() => setPickerOpen(true)}
                        className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded hover:bg-navy-800 transition-colors">
                  + Add equipment
                </button>
              </div>
            ) : (
              <>
                <ul className="space-y-2 mb-3">
                  {equipmentItems.map((item, idx) => (
                    <EquipmentRow
                      key={item.equipment_id || idx}
                      item={item}
                      useListPrice={bundleMode}
                      allowOverride={allowSellPriceOverride}
                      onSellPriceChange={(val) => {
                        setEquipmentItems((prev) => prev.map((it, i) => {
                          if (i !== idx) return it;
                          // Store the raw entered value; effectiveUnitPrice
                          // enforces the floor at read time. Empty clears it.
                          const trimmed = (val ?? '').toString().trim();
                          return { ...it, sell_price_override: trimmed === '' ? null : Number(trimmed) };
                        }));
                        markDraftDirty();
                      }}
                      onQuantityChange={(q) => {
                        setEquipmentItems((prev) => prev.map((it, i) => i === idx ? { ...it, quantity: q } : it));
                        markDraftDirty();
                      }}
                      onRemove={() => {
                        setEquipmentItems((prev) => prev.filter((_, i) => i !== idx));
                        markDraftDirty();
                      }}
                    />
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-3 border-t border-page-200">
                  <button type="button" onClick={() => setPickerOpen(true)}
                          className="text-sm text-navy-700 hover:text-navy-900 font-medium">
                    + Add another item
                  </button>
                  <div className="text-sm">
                    <span className="text-slate-600">Total:</span>{' '}
                    <span className="font-mono tabular-nums font-medium text-slate-900">{formatUSD(dealTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {submitMode === 'deal' && (
          <FieldGrid cols={2}>
            <TextField label="Coffee Spend (Last 3 Months)" type="number" value={draft.coffee_spend_3mo} onChange={(v) => update('coffee_spend_3mo', v)} placeholder="$0" hint="Customer's coffee-related spend, last 3 months" />
            <TextField label="Expected Monthly Sales" type="number" value={draft.expected_monthly_sales} onChange={(v) => update('expected_monthly_sales', v)} placeholder="$0" hint="Customer's projected monthly sales" />
          </FieldGrid>
        )}
      </Section>

      {/* ─── Section: Installation (deal-only) ─── */}
      {/* Install date and emergency flag are post-sale logistics. The customer
          sees pricing on the quote, not install scheduling. */}
      {submitMode === 'deal' && (
        <Section title="Installation">
          <FieldGrid cols={2}>
            <TextField label="Target Install Date" required type="date" value={draft.target_install_date} onChange={(v) => update('target_install_date', v)} />
            <TextField label="Need By Date" type="date" value={draft.need_by_date} onChange={(v) => update('need_by_date', v)} hint="Hard deadline if different from target" />
          </FieldGrid>
          <Toggle label="Emergency Install" hint="This deal requires priority installation scheduling"
                  checked={draft.emergency_install} onChange={(v) => update('emergency_install', v)} />
          {draft.emergency_install && (
            <div className="pl-4 ml-1 border-l-2 border-accent-500/50">
              <TextareaField label="Emergency Install Details" rows={3} value={draft.emergency_install_details} onChange={(v) => update('emergency_install_details', v)} placeholder="Why is this urgent?" />
            </div>
          )}
        </Section>
      )}

      {/* ─── Section: Graphics (deal-only) ─── */}
      {/* Graphics package selection happens after the customer accepts. */}
      {submitMode === 'deal' && (
        <Section title="Graphics">
          <FieldGrid cols={2}>
            <LookupSelect span={2} label="Graphics Package" listState={graphicsList} value={draft.graphics_package} onChange={(v) => update('graphics_package', v)} placeholder="Select package…" />
          </FieldGrid>
          <Toggle label="Ship Graphics with Equipment" checked={draft.ship_graphics_with_equip} onChange={(v) => update('ship_graphics_with_equip', v)} />
          <Toggle label="Existing Custom Graphics" hint="Customer already has custom graphics on file"
                  checked={draft.has_custom_graphics} onChange={(v) => update('has_custom_graphics', v)} />
        </Section>
      )}

      {/* ─── Section: Internal Notes ─── */}
      {/* Internal Notes — visible to the leasing/ops team but NEVER rendered on
          the customer-facing quote page (see QuoteView.jsx). The lock badge
          makes that contract obvious so reps don't paste anything they'd
          regret a customer reading. */}
      <Section title="Internal Notes">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Label optional>Internal Notes</Label>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium uppercase tracking-wider -mt-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0 0v2m0-2h2m-2 0h-2m6-9V7a4 4 0 00-8 0v3m12 0H4a1 1 0 00-1 1v9a1 1 0 001 1h16a1 1 0 001-1v-9a1 1 0 00-1-1z" />
              </svg>
              Not visible to customer
            </span>
          </div>
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => update('notes', e.target.value)}
            rows={4}
            placeholder="Any additional information, special requirements, or context for the leasing/ops team — never shown on the customer-facing quote."
            className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                       focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                       focus:outline-none transition-colors resize-y"
          />
        </div>
      </Section>

      {/* ─── Deal Summary ─── */}
      {/* In bundle mode the Bundle Pricing section above is the summary
          (correct soft-cost-aware math). DealSummary uses the per-item
          0.0395 lease rate without soft cost, which would mislead in bundle
          context, so we suppress it. */}
      {equipmentItems.length > 0 && !bundleMode && (
        <DealSummary
          total={dealTotal}
          monthlyEstimate={monthlyEstimate}
          qualifies={qualifiesForFinance}
          dealType={draft.deal_type}
        />
      )}

      {/* ─── Quote-prep panel (quote mode only) ─── */}
      {/* In quote mode the rep is ABOUT to send something to the customer, so
          these inputs are foreground material — open by default. The cover
          note's "Visible to customer" badge makes the contract clear: this
          IS the text the customer reads, opposite the Internal Notes block. */}
      {submitMode === 'quote' && (
        <details
          open
          className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4"
        >
          <summary className="px-5 py-3 cursor-pointer text-sm font-medium text-slate-700 hover:bg-page-50 transition-colors flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Quote options
            <span className="text-xs text-slate-500 font-normal ml-1">— customer-facing message details</span>
          </summary>
          <div className="px-5 pb-5 pt-2 border-t border-page-100">
            <p className="text-xs text-slate-600 mb-3 leading-relaxed max-w-2xl">
              When you click <span className="font-medium text-slate-800">Submit as Quote</span> below,
              your email client opens with a message to the customer ready to send, including a link
              to view the quote online.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {/* Cover note — explicitly labeled as customer-visible so the rep
                  doesn't paste anything they'd want to keep internal. */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <Label optional>Cover note to customer</Label>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-navy-900/10 text-navy-800 text-[10px] font-medium uppercase tracking-wider -mt-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Visible to customer
                  </span>
                </div>
                <textarea
                  value={draft.quote_cover_note ?? ''}
                  onChange={(e) => update('quote_cover_note', e.target.value)}
                  rows={3}
                  placeholder="e.g. Following up on our conversation Tuesday — here's the formal quote for the program we discussed."
                  className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                             focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                             focus:outline-none transition-colors resize-y"
                />
              </div>
              <TextField
                label="Quote valid until"
                optional
                type="date"
                value={draft.quote_valid_until}
                onChange={(v) => update('quote_valid_until', v)}
                placeholder=""
                hint="Defaults to 30 days from today if left blank."
              />
            </div>
          </div>
        </details>
      )}

      {/* ─── Submit ─── */}
      {/* Only one submit button at a time — the one matching the chosen mode.
          The mode toggle at the top of the form is the single place to switch;
          having both buttons visible here was the v22a-final design but
          duplicated the choice and led to ambiguity ("which button matches
          what I've filled out?").

          The Save Draft button is secondary — outlined rather than filled —
          so the primary action (submit) stays visually dominant. Save Draft
          lets the rep step away mid-form without losing work; the draft
          shows up in the My Deals workspace for resumption later. */}
      <div className="bg-white border border-page-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="text-sm text-slate-600 max-w-md">
          <div className="font-medium text-slate-900 mb-0.5">
            {editMode ? 'Ready to re-send?' : 'Ready to send?'}
          </div>
          {editMode ? (
            <>This will update the quote in the pipeline and re-open your email client so you can let the customer know about the changes. Their existing link stays the same.</>
          ) : submitMode === 'quote' ? (
            <>This emails the customer for review. After they reply, you'll record their decision in the Pipeline dashboard.</>
          ) : (
            <>This goes straight to the leasing/operations team — use Deal only if the customer has already agreed.</>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {/* Save Draft — secondary action. Hidden in edit mode (drafts and
              live edits are different lifecycles; saving an edit-in-progress
              as a "draft" would create confusing duplicate state). */}
          {!editMode && (
            <div className="flex flex-col items-stretch sm:items-end gap-1">
              <button
                onClick={saveDraft}
                disabled={submitting || draftStatus === 'saving'}
                className="px-4 py-3 bg-white border border-page-300 text-slate-700 font-medium rounded
                           hover:bg-page-50 hover:border-navy-300 disabled:opacity-40
                           disabled:cursor-not-allowed transition-colors whitespace-nowrap text-sm"
                title={currentDraftId ? 'Update your saved draft' : 'Save what you have so you can finish it later'}
              >
                {draftStatus === 'saving' ? 'Saving…' : (currentDraftId ? 'Update draft' : 'Save draft')}
              </button>
              <DraftStatusBadge status={draftStatus} hasDraftId={Boolean(currentDraftId)} />
            </div>
          )}

          {/* Edit mode also gets a Cancel button so the rep can back out without
              committing changes. We use navigate('my-deals') since that's where
              they came from — clean return to the workspace. */}
          {editMode && (
            <button
              onClick={() => navigate('my-deals')}
              disabled={resending}
              className="px-4 py-3 bg-white border border-page-300 text-slate-700 font-medium rounded
                         hover:bg-page-50 hover:border-navy-300 disabled:opacity-40
                         disabled:cursor-not-allowed transition-colors whitespace-nowrap text-sm"
            >
              Cancel
            </button>
          )}

          {editMode ? (
            <button onClick={resendQuote} disabled={resending || !isDealPipelineConfigured}
                    className="px-6 py-3 bg-navy-900 text-chalk-50 font-medium rounded
                               hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                               transition-colors whitespace-nowrap">
              {resending ? 'Re-sending…' : 'Re-send quote →'}
            </button>
          ) : submitMode === 'quote' ? (
            <button
              onClick={submitAsQuote}
              disabled={submitting || !isDealPipelineConfigured || (bundleMode && bundlePricing && !bundlePricing.eligible)}
              title={
                bundleMode && bundlePricing && !bundlePricing.eligible
                  ? `Bundle is below the ${formatUSD(LEASE_MIN_PRICE)} lease floor. Add equipment to qualify.`
                  : undefined
              }
              className="px-6 py-3 bg-navy-900 text-chalk-50 font-medium rounded
                         hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors whitespace-nowrap"
            >
              {submitting ? 'Submitting…' : 'Submit as Quote →'}
            </button>
          ) : (
            <button
              onClick={submitDeal}
              disabled={submitting || !isDealPipelineConfigured || (bundleMode && bundlePricing && !bundlePricing.eligible)}
              title={
                bundleMode && bundlePricing && !bundlePricing.eligible
                  ? `Bundle is below the ${formatUSD(LEASE_MIN_PRICE)} lease floor. Add equipment to qualify.`
                  : undefined
              }
              className="px-6 py-3 bg-navy-900 text-chalk-50 font-medium rounded
                         hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors whitespace-nowrap"
            >
              {submitting ? 'Submitting…' : 'Submit Deal →'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div ref={errorRef} className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
        </div>
      )}

      {pickerOpen && (
        <EquipmentPicker
          userId={session?.user?.id || null}
          allowedEquipmentIds={allowedEquipmentIds}
          scopeLabel={
            bundleMode
              ? `Showing equipment eligible for the ${bundleConfig?.name || ''} bundle and any item already on the deal.`
              : null
          }
          onPick={(eq) => {
            setEquipmentItems((prev) => {
              const existing = prev.findIndex((it) => it.equipment_id === eq.id);
              if (existing !== -1) {
                return prev.map((it, i) => i === existing ? { ...it, quantity: it.quantity + 1 } : it);
              }
              return [...prev, {
                equipment_id: eq.id,
                sku: eq.sku,
                description: eq.description,
                model: eq.model,
                vendor: eq.vendor || null,
                list_price: eq.list_price,
                price_50_plus: eq.price_50_plus ?? null,
                quantity: 1,
                // v27: items added in bundle mode after the initial hydration
                // are add-ons rather than part of the bundle's defaults.
                from_bundle: false,
              }];
            });
            markDraftDirty();
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Bundle Pricing Breakdown (v27) ───────────────────────── */
/**
 * Rep-facing math breakdown for a bundle deal. Shows:
 *   - Hardware total (sum of equipment list prices × quantity)
 *   - Soft cost ($ + %)
 *   - Service & media reserve ($)
 *   - Lease basis (subtotal)
 *   - Customer monthly (rounded to whole dollar — what the customer pays)
 *   - Eligibility chip
 *
 * The customer never sees this — it lives only in the rep's view of the
 * Deal Builder so they understand how substitutions move the monthly.
 */
function BundlePricingBreakdown({ bundle, pricing }) {
  const target = bundle?.target_monthly_fee != null && bundle?.target_monthly_fee !== ''
    ? Number(bundle.target_monthly_fee)
    : null;

  return (
    <div className="bg-page-50 border border-page-200 rounded-lg p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-600 leading-relaxed max-w-md">
          The customer sees only the rounded monthly. The breakdown below is for your
          reference as you adjust equipment.
        </p>
        {pricing.eligible ? (
          <span className="text-[10px] uppercase tracking-wider font-bold text-ok bg-ok/10 px-2 py-0.5 rounded whitespace-nowrap">
            ✓ Qualifies for lease
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-bold text-bad bg-red-50 px-2 py-0.5 rounded whitespace-nowrap">
            ✗ Below {formatCurrency(LEASE_MIN_PRICE)}
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-sm font-mono tabular-nums">
        <BundleBreakdownRow label="Hardware total" value={formatCurrency(pricing.hardware)} />
        <BundleBreakdownRow
          label={`Soft cost (${formatSoftCost(pricing.softCostPct)})`}
          value={formatCurrency(pricing.softCost)}
        />
        <BundleBreakdownRow
          label="Service & media reserve"
          value={formatCurrency(pricing.reserve)}
          muted
        />
        <div className="border-t border-page-200 my-1.5" />
        <BundleBreakdownRow
          label="Lease basis"
          value={formatCurrency(pricing.leaseBasis)}
          bold
        />
        <BundleBreakdownRow
          label="Customer monthly (rounded)"
          value={formatMonthly(pricing.monthlyCharged)}
          bold
          highlight
        />
      </div>

      {target != null && Number.isFinite(target) && (
        <p className="mt-3 text-[11px] text-slate-600 leading-relaxed">
          Marketed starting fee: <span className="font-mono">{formatMonthly(target)}/mo</span>.{' '}
          {target === pricing.monthlyCharged
            ? <span className="text-ok">Customer monthly matches the marketed tier.</span>
            : (
              <>
                Customer monthly:{' '}
                <span className="font-mono font-medium text-slate-700">
                  {formatMonthly(pricing.monthlyCharged)}/mo
                </span>
                {' '}({pricing.monthlyCharged > target ? '+' : '−'}${Math.abs(pricing.monthlyCharged - target).toLocaleString()} from tier).
              </>
            )}
        </p>
      )}

      {!pricing.eligible && pricing.eligibilityShortfall > 0 && (
        <p className="mt-3 text-[11px] text-bad leading-relaxed">
          Add about <span className="font-mono">{formatCurrency(pricing.eligibilityShortfall / (1 + pricing.softCostPct))}</span>
          {' '}more in hardware to clear the {formatCurrency(LEASE_MIN_PRICE)} lease floor.
        </p>
      )}
    </div>
  );
}

function BundleBreakdownRow({ label, value, bold, muted, highlight }) {
  return (
    <div className={`flex items-center justify-between ${highlight ? 'bg-navy-50 -mx-2 px-2 py-1 rounded' : ''}`}>
      <span className={`${muted ? 'text-slate-500' : 'text-slate-700'} text-xs`}>{label}</span>
      <span className={`${bold ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  );
}

/* ───────────────────────── Deal Summary ───────────────────────── */

function DealSummary({ total, monthlyEstimate, qualifies, dealType }) {
  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <header className="bg-navy-900 text-chalk-50 px-4 md:px-5 py-3">
        <h2 className="text-sm md:text-base font-medium">Deal Summary</h2>
      </header>
      <div className="p-4 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-page-50 border border-page-200 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Equipment Cost</div>
            <div className="font-mono tabular-nums text-2xl font-medium text-slate-900">
              ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Total of all selected equipment at 50+ unit pricing</div>
          </div>
          {qualifies ? (
            <div className="bg-accent-500/5 border border-accent-500/30 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wider text-accent-700 mb-1 font-medium">Monthly Lease Estimate</div>
              <div className="font-mono tabular-nums text-2xl font-medium text-navy-900">
                ${Math.round(monthlyEstimate).toLocaleString()}
                <span className="text-sm text-slate-500 font-sans font-normal">/mo</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })} × {LEASE_RATE} ={' '}
                <span className="font-mono">${monthlyEstimate.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wider text-slate-600 mb-1 font-medium">Cash Sale Only</div>
              <div className="text-sm text-slate-800 font-medium leading-snug">
                Deal total under ${LEASE_MIN_PRICE.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                Equipment lease and finance options require a minimum deal value of ${LEASE_MIN_PRICE.toLocaleString()}. This deal can only be sold as a purchase.
              </div>
            </div>
          )}
        </div>
        {dealType && (
          <div className="mt-4 pt-3 border-t border-page-200 flex items-center justify-between text-sm">
            <span className="text-slate-600">Deal type</span>
            <span className="font-medium text-slate-900">{dealType}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Draft status badge ───────────────────────── */

/**
 * Tiny indicator sitting under the Save Draft button. Four states:
 *   - idle           → no badge (clean form, nothing to say)
 *   - saving         → "Saving…"
 *   - saved          → "✓ Saved" with the last-saved time omitted (always
 *                       just-now from the user's perspective; a timestamp
 *                       would be noisy)
 *   - error          → "Couldn't save" — full error message is in the main
 *                       error block above the form
 *
 * Kept minimal because the row already has a primary submit button right
 * next to it; a chatty status message would compete for attention.
 */
function DraftStatusBadge({ status, hasDraftId }) {
  if (status === 'idle') {
    // Nothing to show. If a draft is loaded but not currently dirty, that's
    // already reflected in the "Update draft" button label.
    return null;
  }
  if (status === 'saving') {
    return <span className="text-[11px] text-slate-500 text-center sm:text-right">Saving…</span>;
  }
  if (status === 'saved') {
    return (
      <span className="text-[11px] text-ok flex items-center justify-center sm:justify-end gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
        {hasDraftId ? 'Draft updated' : 'Draft saved'}
      </span>
    );
  }
  if (status === 'error') {
    return <span className="text-[11px] text-bad text-center sm:text-right">Couldn't save</span>;
  }
  return null;
}

/* ───────────────────────── Form primitives ───────────────────────── */

function Section({ number, title, children }) {
  // The numbered-circle badge is rendered only when `number` is provided.
  // The v22a-v2 pivot drops static numbering across the deal sheet because
  // dynamic show/hide on submitMode would leave gaps ("Section 1, then 5,
  // then 8…"). Title alone is clear enough, especially since each section's
  // dark-navy header strip already reads as a visual break.
  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <header className="bg-navy-900 text-chalk-50 px-4 md:px-5 py-3 flex items-center gap-3">
        {number != null && (
          <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold">{number}</span>
        )}
        <h2 className="text-sm md:text-base font-medium">{title}</h2>
      </header>
      <div className="p-4 md:p-5 space-y-3">{children}</div>
    </section>
  );
}
function FieldGrid({ cols, children }) {
  const colClass = cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return <div className={`grid grid-cols-1 ${colClass} gap-3 md:gap-4`}>{children}</div>;
}
function Label({ children, required, optional }) {
  // `required` and `optional` are mutually exclusive in practice — a field is
  // either required (red asterisk) or optional (muted "(optional)" suffix) or
  // neither (the historical default, used when the caller wants no annotation).
  // We don't enforce mutual exclusion in code because a future variant might
  // legitimately want both (e.g. a required-but-soft field), but we render the
  // asterisk first and the optional suffix only when required is false.
  return (
    <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
      {children}
      {required && <span className="text-bad ml-0.5">*</span>}
      {optional && !required && (
        <span className="ml-1 text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
      )}
    </span>
  );
}
function TextField({ label, required, optional, type = 'text', value, onChange, placeholder, hint, span, disabled }) {
  return (
    <label className={`block ${span === 2 ? 'md:col-span-2' : ''}`}>
      <Label required={required} optional={optional}>{label}</Label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                   focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                   focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      />
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}
function TextareaField({ label, required, optional, value, onChange, placeholder, rows = 3, span = 2 }) {
  return (
    <label className={`block ${span === 2 ? 'md:col-span-2' : ''}`}>
      <Label required={required} optional={optional}>{label}</Label>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                   focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                   focus:outline-none transition-colors resize-y"
      />
    </label>
  );
}
function SelectField({ label, required, optional, value, onChange, options, placeholder, span }) {
  return (
    <label className={`block ${span === 2 ? 'md:col-span-2' : ''}`}>
      <Label required={required} optional={optional}>{label}</Label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                   focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                   focus:outline-none transition-colors"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  );
}
/** LookupSelect — like SelectField but pulls options from a useLookupList result */
function LookupSelect({ label, required, optional, listState, value, onChange, placeholder, span }) {
  const { options, loading, error } = listState;
  return (
    <label className={`block ${span === 2 ? 'md:col-span-2' : ''}`}>
      <Label required={required} optional={optional}>{label}</Label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                   focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                   focus:outline-none transition-colors disabled:opacity-60"
      >
        <option value="">{loading ? 'Loading…' : placeholder}</option>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.value}</option>)}
      </select>
      {error && <span className="block text-[11px] text-bad mt-1">Couldn't load list: {error}</span>}
    </label>
  );
}
function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center gap-3 mt-3 cursor-pointer select-none"
         onClick={() => onChange(!checked)}>
      <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 flex-shrink-0
                       ${checked ? 'bg-navy-700 justify-end' : 'bg-page-300 justify-start'}`}>
        <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
      </div>
      <div className="text-sm">
        <span className="font-medium text-navy-900">{label}</span>
        {hint && <span className="text-slate-600"> — {hint}</span>}
      </div>
    </div>
  );
}
function EquipmentRow({ item, useListPrice = false, allowOverride = false, onSellPriceChange, onQuantityChange, onRemove }) {
  const floor = sellPriceFloor(item);
  const unitPrice = useListPrice
    ? (item.list_price ?? 0)
    : effectiveUnitPrice(item, { allowOverride });

  // Collapsed by default. The pencil icon next to the price toggles the
  // "Adjust Pricing:" editor below the line — per-SKU, on the deal/quote
  // form only. The override carries through to the pipeline on submit.
  const [editing, setEditing] = useState(false);

  // Local text state so the rep can type freely (including intermediate values
  // like "12" on the way to "1200") without the parent reformatting mid-edit.
  const [draftPrice, setDraftPrice] = useState(
    item.sell_price_override != null ? String(item.sell_price_override) : ''
  );
  // Keep local state in sync if the item's override changes from outside
  // (e.g. deal hydration, or deal type toggling the field on/off).
  useEffect(() => {
    setDraftPrice(item.sell_price_override != null ? String(item.sell_price_override) : '');
  }, [item.sell_price_override, item.equipment_id]);

  // If the deal type changes and the override field is no longer allowed,
  // close the editor so a stale open state doesn't linger.
  useEffect(() => {
    if (!allowOverride) setEditing(false);
  }, [allowOverride]);

  const enteredNum = Number(draftPrice);
  const belowFloor = draftPrice.trim() !== '' && Number.isFinite(enteredNum) && enteredNum < floor;
  const isRaised = unitPrice > floor;

  function commitPrice(raw) {
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') { onSellPriceChange(''); setEditing(false); return; }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) { onSellPriceChange(''); setEditing(false); return; }
    // Raise-only: snap anything at/below the catalog price back to "no override"
    // so the catalog price (the floor) is used. Reps cannot go below retail.
    if (n <= floor) { onSellPriceChange(''); setDraftPrice(''); setEditing(false); return; }
    onSellPriceChange(String(n));
    setEditing(false);
  }

  return (
    <li className="bg-white border border-page-200 rounded p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-[10px] text-slate-500">{item.sku}</span>
            {item.vendor && <span className="text-[10px] text-slate-400">· {item.vendor}</span>}
          </div>
          <div className="text-sm font-medium text-slate-900">{item.description}</div>
          {item.model && <div className="text-xs text-slate-500">{item.model}</div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input type="number" min="1" value={item.quantity}
                 onChange={(e) => onQuantityChange(parseInt(e.target.value, 10) || 1)}
                 className="w-14 px-2 py-1 bg-white border border-page-200 rounded text-sm text-center" />
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="font-mono tabular-nums text-sm text-slate-900">
                ${(unitPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              {/* Pencil — Purchase/Finance non-bundle deals only. Toggles the
                  Adjust Pricing editor below. Raise-only, catalog is the floor. */}
              {allowOverride && (
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className={`p-1 rounded transition-colors ${
                    editing ? 'text-navy-700 bg-navy-50' :
                    isRaised ? 'text-accent-600 hover:text-accent-700' :
                                'text-slate-400 hover:text-navy-700'
                  }`}
                  aria-label={editing ? 'Close price editor' : 'Adjust pricing'}
                  aria-expanded={editing}
                  title={isRaised ? `Marked up ${formatUSD(unitPrice - floor)} from catalog` : 'Adjust pricing'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
              )}
            </div>
            {item.quantity > 1 && (
              <div className="text-[10px] text-slate-400">${unitPrice.toLocaleString()} ea</div>
            )}
            {isRaised && !editing && (
              <div className="text-[10px] text-accent-700 font-medium">
                +{formatUSD(unitPrice - floor)} above catalog
              </div>
            )}
          </div>
          <button onClick={onRemove} type="button" className="text-slate-400 hover:text-bad p-1" aria-label="Remove">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Adjust Pricing editor — collapsed by default, opened by the pencil.
          Purchase/Finance non-bundle deals only. Raise-only: catalog price
          is the floor. Lives only on this deal/quote — never edits the
          catalog. Persists on the deal through submission to the pipeline. */}
      {allowOverride && editing && (
        <div className="mt-2.5 pt-2.5 border-t border-page-100 flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">
              Adjust Pricing:
            </span>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
              <input
                type="number"
                min={floor}
                step="0.01"
                inputMode="decimal"
                autoFocus
                value={draftPrice}
                placeholder={floor.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                onChange={(e) => setDraftPrice(e.target.value)}
                onBlur={(e) => commitPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setDraftPrice(item.sell_price_override != null ? String(item.sell_price_override) : '');
                    setEditing(false);
                  }
                }}
                className={`w-32 pl-5 pr-2 py-1 bg-white border rounded text-sm tabular-nums
                            focus:ring-2 focus:outline-none transition-colors
                            ${belowFloor
                              ? 'border-bad/60 focus:border-bad focus:ring-bad/10'
                              : 'border-page-200 focus:border-navy-500 focus:ring-navy-500/10'}`}
              />
            </div>
          </label>

          <span className="text-[11px] text-slate-500">
            Catalog: <span className="font-mono tabular-nums">{formatUSD(floor)}</span>
          </span>

          {belowFloor && (
            <span className="text-[11px] text-bad font-medium">
              Can't sell below catalog price — will reset to {formatUSD(floor)}.
            </span>
          )}
        </div>
      )}
    </li>
  );
}
