import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Conditional visibility — fields the schema intentionally omits because their
 * requirement is "if their parent toggle/select is on, they're visible AND
 * required; otherwise they don't matter." Kept in code (not data) because the
 * parent-child relationship is tightly coupled to the JSX structure of the
 * deal sheet, not something an admin should be wiring through a settings UI.
 *
 * Each entry: child field_key → predicate(draft) returning true when the field
 * is currently visible AND therefore should be enforced as required.
 *
 * Exported so the DealBuilder JSX can use the *same* predicate map to decide
 * whether to render the field, ensuring the "what's required" view from
 * fieldMetaFor() matches what validateAgainstRequirements() actually enforces.
 */
export const CONDITIONAL_VISIBILITY = {
  prior_account_num:         (d) => !!d.change_of_ownership,
  change_details:            (d) => !!d.change_of_ownership,
  delivery_method:           (d) => d.distribution_method === 'DSD',
  delivery_recurrence:       (d) => d.distribution_method === 'DSD',
  emergency_install_details: (d) => !!d.emergency_install,
  core_mark_div_num:         (d) => d.parent_distributor === 'Core-Mark',
};

/**
 * Cached fetch for the entire field_requirements table. The table is small
 * (one row per top-level deal form field, ~50 rows total) and rarely changes,
 * so a single in-memory promise covers every consumer in the page session.
 *
 * Cache is invalidated by the admin screen after a successful save so that a
 * rep who opens a new deal moments later sees the updated rules.
 */
let CACHE = null;       // Promise<rows> | null
let LAST_FETCH_AT = 0;  // ms epoch
const TTL_MS = 5 * 60 * 1000; // 5 minutes — soft staleness for safety

function fetchRequirements() {
  if (CACHE && Date.now() - LAST_FETCH_AT < TTL_MS) {
    return CACHE;
  }
  CACHE = supabase
    .from('field_requirements')
    .select('field_key, field_label, section, applies_to, conditional_on_field, conditional_on_value, system_required, display_order')
    .order('display_order')
    .then(({ data, error }) => {
      if (error) {
        // Bust the cache so a retry can succeed if it was transient
        CACHE = null;
        throw error;
      }
      LAST_FETCH_AT = Date.now();
      return data || [];
    });
  return CACHE;
}

/** Forget the cached version — call after an admin edit so reps see the change immediately. */
export function invalidateFieldRequirements() {
  CACHE = null;
  LAST_FETCH_AT = 0;
}

/**
 * useFieldRequirements — returns { rules, loading, error }.
 *
 * `rules` is a Map keyed by field_key, value = the row, so consumers can do
 * O(1) lookups in their validation loop without scanning the array.
 *
 * Empty Map on initial load — the validate() function in DealBuilder.jsx
 * skips field-config checks when the Map is empty, falling back to the
 * built-in business rules (equipment ≥ 1 item, ≥ $5K for lease/finance).
 * This means a rep can submit even if the DB is unreachable, which is the
 * right behavior — we don't want a flaky network call to block legitimate
 * deal submissions.
 */
export function useFieldRequirements() {
  const [state, setState] = useState({ rules: new Map(), loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    fetchRequirements()
      .then((rows) => {
        if (cancelled) return;
        const rules = new Map();
        for (const row of rows) rules.set(row.field_key, row);
        setState({ rules, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ rules: new Map(), loading: false, error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/**
 * Pure validation function — separate from the hook so it's testable and can
 * be reused outside React (e.g. in a future "Submit as Deal" flow that
 * converts a quote into a deal).
 *
 * @param {Object} params
 * @param {Map} params.rules        — field_key → requirement row, from useFieldRequirements
 * @param {Object} params.draft     — the form state from DealBuilder
 * @param {'quote' | 'deal'} params.mode — which submission flow we're validating for
 *
 * Returns { errors: string[] } — empty array means the form passes the
 * field-config layer. The caller still has to enforce business rules
 * (equipment count, $5K floor, etc.) on top.
 */
export function validateAgainstRequirements({ rules, draft, mode }) {
  const errors = [];
  if (!rules || rules.size === 0) return { errors };

  for (const [fieldKey, rule] of rules) {
    // applies_to filter
    const appliesNow =
      rule.applies_to === 'both' ||
      (mode === 'quote' && rule.applies_to === 'quote') ||
      (mode === 'deal'  && rule.applies_to === 'deal');
    if (!appliesNow) continue;

    // Schema-driven conditional gate (currently unused — all rows have
    // conditional_on_field=null — but future-proof).
    if (rule.conditional_on_field) {
      const parentVal = draft[rule.conditional_on_field];
      const expected  = rule.conditional_on_value;
      if (expected != null && String(parentVal) !== String(expected)) continue;
      if (expected == null && !parentVal) continue;
    }

    // Code-driven conditional visibility — only enforce visible fields.
    // Predicate map lives at module scope (CONDITIONAL_VISIBILITY) so the
    // JSX and the validator stay in lockstep.
    if (CONDITIONAL_VISIBILITY[fieldKey] && !CONDITIONAL_VISIBILITY[fieldKey](draft)) {
      continue;
    }

    // Empty check. Boolean fields (toggles) are never "empty" in the validation
    // sense — false IS a valid answer. The form's existing UI already nudges
    // reps to pick the right value via the toggle UI, so we only flag empty
    // strings / null / undefined.
    const value = draft[fieldKey];
    const isEmpty =
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '');
    if (isEmpty && typeof value !== 'boolean') {
      errors.push(rule.field_label || fieldKey);
    }
  }

  return { errors };
}

/**
 * fieldMetaFor — pure helper that tells the JSX everything it needs to know
 * about a single field for the current submission mode:
 *
 *   {
 *     visible:       boolean  // should the input render at all?
 *     required:      boolean  // show a red asterisk?
 *     isOptional:    boolean  // show an "(optional)" suffix?
 *     knownToRules:  boolean  // false = no row in field_requirements; caller
 *                             //         should fall back to hardcoded behavior
 *   }
 *
 * Semantics for applies_to:
 *   'both'    → visible+required in BOTH modes
 *   'deal'    → hidden in quote, visible+required in deal
 *   'quote'   → visible+required in quote, visible+optional in deal
 *               (no rows currently use this, but supported for symmetry)
 *   'neither' → visible+optional in BOTH modes (free-text helpers like notes)
 *
 * Conditional visibility (via CONDITIONAL_VISIBILITY) short-circuits to
 * {visible:false,...} — a field whose parent toggle is off isn't rendered
 * and isn't required, regardless of its applies_to.
 *
 * Unknown field_keys return {visible:true, required:false, knownToRules:false}
 * so the caller falls through to whatever the JSX would normally do — never
 * hide a field just because we forgot to seed it in the DB.
 *
 * @param {Map}    rules      — field_key → requirement row, from useFieldRequirements
 * @param {string} fieldKey   — the field to look up
 * @param {'quote'|'deal'} mode
 * @param {Object} draft      — form state, needed for conditional predicates
 */
export function fieldMetaFor(rules, fieldKey, mode, draft) {
  // Conditional visibility wins over everything: if the parent toggle is off,
  // the child is hidden, period.
  const condPredicate = CONDITIONAL_VISIBILITY[fieldKey];
  if (condPredicate && !condPredicate(draft)) {
    return { visible: false, required: false, isOptional: false, knownToRules: !!rules?.get?.(fieldKey) };
  }

  const rule = rules?.get?.(fieldKey);
  if (!rule) {
    // No row in field_requirements — caller should rely on hardcoded JSX
    // behavior. Default to visible+optional so we never accidentally hide
    // a real field because of a missing seed.
    return { visible: true, required: false, isOptional: false, knownToRules: false };
  }

  const appliesTo = rule.applies_to;
  let visible = true;
  let required = false;

  if (appliesTo === 'both') {
    visible = true;
    required = true;
  } else if (appliesTo === 'deal') {
    visible = mode === 'deal';
    required = mode === 'deal';
  } else if (appliesTo === 'quote') {
    visible = true;
    required = mode === 'quote';
  } else if (appliesTo === 'neither') {
    visible = true;
    required = false;
  }

  // isOptional = visible AND not required. Drives the "(optional)" suffix on
  // the label so reps know they can skip it without being blocked at submit.
  const isOptional = visible && !required;

  return { visible, required, isOptional, knownToRules: true };
}
