import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { invalidateFieldRequirements } from '../../lib/useFieldRequirements.js';

/**
 * FieldRequirementsAdmin — manage per-field validation rules for the New Deal form.
 *
 * For every top-level input on the deal sheet (DealBuilder.jsx), an admin chooses:
 *   • Apply to Quote     — required when submitting as a quote
 *   • Apply to Deal      — required only on full deal submission
 *   • Apply to Both      — required in both flows
 *   • Not required       — optional (DB stores 'neither')
 *
 * System-required fields (the columns the dashboard absolutely cannot live without)
 * are locked: their dropdown is disabled and shows a lock icon.
 *
 * Conditional fields (e.g. `change_details` only appears when `change_of_ownership`
 * is toggled on) are NOT stored here — their visibility is JSX-controlled.
 *
 * Pattern notes (mirrored from LookupListsAdmin so the two screens feel the same):
 * - useEffect prop-sync inside RowEditor so a save round-trip can't make a row
 *   appear to revert; the local state re-aligns with the freshly-fetched row.
 * - loadRows({ showSpinner:false }) for the post-save refresh — keeps focus and
 *   doesn't yank inputs out from under the user.
 */

const APPLIES_TO_OPTIONS = [
  { value: 'quote',   label: 'Apply to Quote' },
  { value: 'deal',    label: 'Apply to Deal' },
  { value: 'both',    label: 'Apply to Both' },
  { value: 'neither', label: 'Not required' },
];

const APPLIES_TO_PILL = {
  quote:   { label: 'Quote',  className: 'bg-amber-100 text-amber-800' },
  deal:    { label: 'Deal',   className: 'bg-navy-100 text-navy-800' },
  both:    { label: 'Both',   className: 'bg-emerald-100 text-emerald-800' },
  neither: { label: 'Optional', className: 'bg-slate-100 text-slate-600' },
};

export default function FieldRequirementsAdmin({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editorEmail, setEditorEmail] = useState(null);

  // Capture the current user's email once — used as `updated_by` on each save.
  // Stored as text per the schema (not a uuid FK), so an email reads better in
  // any debug query than a raw auth uid.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEditorEmail(data?.user?.email || null);
    });
    return () => { cancelled = true; };
  }, []);

  async function loadRows({ showSpinner = true } = {}) {
    if (showSpinner) setLoading(true);
    const { data, error } = await supabase
      .from('field_requirements')
      .select('*')
      .order('display_order')
      .order('field_label');
    if (showSpinner) setLoading(false);
    if (error) { setError(error.message); return; }
    setRows(data || []);
  }

  useEffect(() => { loadRows(); }, []);

  async function updateAppliesTo(fieldKey, newValue) {
    setSaving(true); setError(null);
    const { error } = await supabase
      .from('field_requirements')
      .update({
        applies_to: newValue,
        updated_at: new Date().toISOString(),
        updated_by: editorEmail,
      })
      .eq('field_key', fieldKey);
    setSaving(false);
    if (error) { setError(error.message); return; }
    // Bust the in-memory cache so the next DealBuilder mount picks up the change.
    invalidateFieldRequirements();
    loadRows({ showSpinner: false });
  }

  // Group rows by section in their existing order. Object.entries preserves
  // insertion order, and rows are already sorted by display_order so the
  // section ordering inherits from the first occurrence of each section.
  const sections = [];
  const sectionMap = new Map();
  for (const row of rows) {
    if (!sectionMap.has(row.section)) {
      const bucket = { section: row.section, rows: [] };
      sectionMap.set(row.section, bucket);
      sections.push(bucket);
    }
    sectionMap.get(row.section).rows.push(row);
  }

  // Summary counts shown in the header (gives admins a quick read on the
  // current state of the configuration without scrolling through every row).
  const counts = rows.reduce((acc, r) => {
    acc[r.applies_to] = (acc[r.applies_to] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button onClick={onBack} className="text-sm text-navy-700 hover:text-navy-900 font-medium flex items-center gap-1">
          ← Admin
        </button>
      </div>

      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">Admin</p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">Field Requirements</h1>
        <p className="text-sm text-slate-600 mt-2 max-w-3xl">
          Decide which fields are required when a rep submits a <strong>Quote</strong> versus a full <strong>Deal</strong>.
          Quotes need fewer fields than deals — set anything customer-facing to <em>Apply to Both</em>, and back-office
          details (account numbers, ROM, distributor info) to <em>Apply to Deal</em>. Locked rows are required by the
          system and can't be changed here.
        </p>

        {/* Counts summary */}
        <div className="flex flex-wrap gap-2 mt-4 text-[11px]">
          <CountPill label="Both"     n={counts.both    || 0} className={APPLIES_TO_PILL.both.className} />
          <CountPill label="Deal"     n={counts.deal    || 0} className={APPLIES_TO_PILL.deal.className} />
          <CountPill label="Quote"    n={counts.quote   || 0} className={APPLIES_TO_PILL.quote.className} />
          <CountPill label="Optional" n={counts.neither || 0} className={APPLIES_TO_PILL.neither.className} />
          <span className="text-slate-400">·</span>
          <span className="px-2 py-1 rounded text-slate-500">{rows.length} fields total</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && <div className="p-6 text-center text-sm text-slate-500">Loading…</div>}

      {!loading && (
        <div className="space-y-5 max-w-5xl">
          {sections.map(({ section, rows: sectionRows }) => (
            <section key={section} className="bg-white border border-page-200 rounded-lg overflow-hidden">
              <header className="px-4 py-3 border-b border-page-100 bg-page-50 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-900">{section}</h2>
                <span className="text-[11px] text-slate-500 font-mono">{sectionRows.length} fields</span>
              </header>
              <div className="divide-y divide-page-100">
                {sectionRows.map((row) => (
                  <RowEditor
                    key={row.field_key}
                    row={row}
                    saving={saving}
                    onChange={(newValue) => updateAppliesTo(row.field_key, newValue)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-8 max-w-3xl text-xs text-slate-500 leading-relaxed border-t border-page-200 pt-6 space-y-2">
        <p className="font-medium text-slate-700">A few notes</p>
        <p>
          Changes here take effect the next time someone opens the New Deal form. They don't retroactively flag
          past deals. The validation logic that reads these settings lives in <code className="bg-page-100 px-1 py-0.5 rounded font-mono text-[11px]">DealBuilder.jsx</code> —
          if a required field is empty at submit time, the rep is blocked and shown the missing list.
        </p>
        <p>
          <strong>Not shown here:</strong> conditional fields like <em>Verify Prior Account #</em> or <em>Emergency Install Details</em>
          that only appear when a parent toggle is on — these are gated by visibility in the form itself. Equipment
          selection has its own business rules (at least one item, lease/finance ≥ $5K).
        </p>
      </div>
    </div>
  );
}

function CountPill({ label, n, className }) {
  return (
    <span className={`px-2 py-1 rounded font-medium ${className}`}>
      {label}: {n}
    </span>
  );
}

function RowEditor({ row, saving, onChange }) {
  // Local state so the dropdown reflects the in-flight pick immediately, then
  // re-syncs from props after the silent re-fetch lands. This is the same
  // pattern as LookupListsAdmin's RowEditor — see that file's comment for the
  // bug it's preventing (apparent revert on save round-trip).
  const [appliesTo, setAppliesTo] = useState(row.applies_to);

  useEffect(() => {
    setAppliesTo(row.applies_to);
  }, [row.field_key, row.applies_to]);

  const pill = APPLIES_TO_PILL[appliesTo] || APPLIES_TO_PILL.neither;
  const locked = row.system_required;

  function handleChange(e) {
    const next = e.target.value;
    setAppliesTo(next);
    onChange(next);
  }

  return (
    <div className={`px-4 py-3 grid grid-cols-1 md:grid-cols-[1fr_auto_12rem] gap-3 items-center
                     ${locked ? 'bg-page-50' : ''}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-900 truncate">{row.field_label}</span>
          {locked && (
            <span title="System-required — cannot be changed" className="text-slate-400">
              <LockIcon />
            </span>
          )}
          {row.conditional_on_field && (
            <span title={`Only shown when ${row.conditional_on_field} = ${row.conditional_on_value || 'truthy'}`}
                  className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-medium">
              conditional
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
          <span>{row.field_key}</span>
          {row.updated_by && (
            <>
              <span className="text-slate-300">·</span>
              <span title={`Updated ${row.updated_at}`}>by {row.updated_by}</span>
            </>
          )}
        </div>
      </div>

      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${pill.className}`}>
        {pill.label}
      </span>

      <select
        value={appliesTo}
        onChange={handleChange}
        disabled={locked || saving}
        className="px-2 py-1.5 bg-white border border-page-200 rounded text-sm
                   focus:border-navy-500 focus:outline-none
                   disabled:bg-page-50 disabled:text-slate-400 disabled:cursor-not-allowed"
      >
        {APPLIES_TO_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path strokeLinecap="round" d="M8 11V7a4 4 0 118 0v4" />
    </svg>
  );
}
