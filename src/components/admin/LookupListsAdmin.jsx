import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { invalidateLookupList } from '../../lib/useLookupList.js';

/**
 * LookupListsAdmin — manage the values that fill every dropdown on the deal sheet.
 *
 * Left column: list of all distinct list_keys (parent_distributor, rom_person, etc.)
 * Right column: editor for the selected list — add, edit value/email/sort_order, deactivate.
 *
 * Soft-delete only (active = false). Hard delete left as a SQL-only operation since
 * deactivating preserves the historical reference for past deals that used the value.
 */
const LIST_LABELS = {
  parent_distributor:   'Parent Distributors',
  coffee_program:       'Coffee Programs',
  customer_type:        'Customer Type (C-Store / Food Service)',
  distribution_method:  'Distribution Method (DSD / Indirect)',
  deal_type:            'Deal Types',
  graphics_package:     'Graphics Packages',
  rom_person:           'ROM People (with email)',
  rom_region:           'ROM Regions',
};

const HAS_EMAIL = new Set(['rom_person']);

export default function LookupListsAdmin({ onBack }) {
  const [lists, setLists] = useState([]);          // distinct list_keys with counts
  const [activeKey, setActiveKey] = useState(null);
  const [rows, setRows] = useState([]);             // values for the active list
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Load the distinct list keys + counts
  async function loadIndex() {
    setLoading(true);
    const { data, error } = await supabase
      .from('lookup_lists')
      .select('list_key, active')
      .order('list_key');
    setLoading(false);
    if (error) { setError(error.message); return; }
    // Group by list_key, count active vs total
    const grouped = {};
    for (const row of data) {
      if (!grouped[row.list_key]) grouped[row.list_key] = { total: 0, active: 0 };
      grouped[row.list_key].total++;
      if (row.active) grouped[row.list_key].active++;
    }
    setLists(Object.entries(grouped).map(([key, counts]) => ({ key, ...counts })));
  }

  async function loadRows(listKey, { showSpinner = true } = {}) {
    if (!listKey) { setRows([]); return; }
    if (showSpinner) setLoading(true);
    const { data, error } = await supabase
      .from('lookup_lists')
      .select('*')
      .eq('list_key', listKey)
      .order('sort_order')
      .order('value');
    if (showSpinner) setLoading(false);
    if (error) { setError(error.message); return; }
    setRows(data || []);
  }

  useEffect(() => { loadIndex(); }, []);
  useEffect(() => { loadRows(activeKey); }, [activeKey]);

  async function updateRow(id, patch) {
    setSaving(true); setError(null);
    const { error } = await supabase
      .from('lookup_lists')
      .update(patch)
      .eq('id', id);
    setSaving(false);
    if (error) { setError(error.message); return; }
    invalidateLookupList(activeKey);
    // Refresh without the loading spinner — keeps row inputs mounted so we
    // don't lose the user's place / focus on a save round-trip.
    loadRows(activeKey, { showSpinner: false });
    loadIndex();
  }

  async function addRow(value, sortOrder, email) {
    setSaving(true); setError(null);
    const { error } = await supabase
      .from('lookup_lists')
      .insert({
        list_key: activeKey,
        value: value.trim(),
        sort_order: sortOrder,
        email: email?.trim() || null,
      });
    setSaving(false);
    if (error) { setError(error.message); return; }
    invalidateLookupList(activeKey);
    loadRows(activeKey, { showSpinner: false });
    loadIndex();
  }

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button onClick={onBack} className="text-sm text-navy-700 hover:text-navy-900 font-medium flex items-center gap-1">
          ← Admin
        </button>
      </div>

      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">Admin</p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">Dropdown Lists</h1>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl">
          Manage the values shown in every dropdown on the deal sheet. Adding a value here makes it immediately
          available the next time someone opens a deal form. Deactivate (rather than delete) values to hide them
          from new deals while preserving the reference for past deals that used them.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4">
        {/* Left: list selector */}
        <aside className="bg-white border border-page-200 rounded-lg overflow-hidden">
          <header className="px-3 py-2 border-b border-page-100 bg-page-50">
            <h2 className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">Lists</h2>
          </header>
          <ul className="py-1">
            {lists.map((l) => {
              const label = LIST_LABELS[l.key] || l.key;
              const active = l.key === activeKey;
              return (
                <li key={l.key}>
                  <button
                    onClick={() => setActiveKey(l.key)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors
                      ${active ? 'bg-navy-900 text-chalk-50' : 'hover:bg-page-50 text-slate-700'}`}
                  >
                    <span className="truncate">{label}</span>
                    <span className={`text-[10px] font-mono tabular-nums ${active ? 'text-chalk-200' : 'text-slate-500'}`}>
                      {l.active}/{l.total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Right: editor */}
        <main className="bg-white border border-page-200 rounded-lg overflow-hidden">
          {!activeKey && (
            <div className="p-10 text-center text-sm text-slate-500">
              Select a list on the left to edit its values.
            </div>
          )}
          {activeKey && (
            <>
              <header className="px-4 py-3 border-b border-page-100 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-slate-900">
                  {LIST_LABELS[activeKey] || activeKey}
                </h2>
                <span className="text-[11px] text-slate-500 font-mono">{activeKey}</span>
              </header>

              {loading && <div className="p-6 text-center text-sm text-slate-500">Loading…</div>}

              {!loading && (
                <div className="divide-y divide-page-100">
                  {rows.map((row) => (
                    <RowEditor
                      key={row.id}
                      row={row}
                      onSave={(patch) => updateRow(row.id, patch)}
                      showEmail={HAS_EMAIL.has(activeKey)}
                      saving={saving}
                    />
                  ))}
                  <AddRowForm
                    nextSortOrder={(rows.length ? Math.max(...rows.map((r) => r.sort_order)) : 0) + 10}
                    onAdd={addRow}
                    showEmail={HAS_EMAIL.has(activeKey)}
                    saving={saving}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function RowEditor({ row, onSave, showEmail, saving }) {
  const [value, setValue] = useState(row.value);
  const [email, setEmail] = useState(row.email || '');
  const [sortOrder, setSortOrder] = useState(row.sort_order);

  // Re-sync local edit state whenever the row prop changes (e.g. after a save
  // round-trip when the parent re-fetches). Without this, the local state
  // initialized at mount could fall out of step with the DB, making it look
  // like an edit reverted when it actually saved fine.
  useEffect(() => {
    setValue(row.value);
    setEmail(row.email || '');
    setSortOrder(row.sort_order);
  }, [row.id, row.value, row.email, row.sort_order]);

  const dirty = value !== row.value || (email !== (row.email || '')) || sortOrder !== row.sort_order;

  function save() {
    onSave({
      value: value.trim(),
      email: email.trim() || null,
      sort_order: parseInt(sortOrder, 10) || 100,
    });
  }
  function toggleActive() {
    onSave({ active: !row.active });
  }

  return (
    <div className={`p-3 ${row.active ? '' : 'opacity-60 bg-page-50'}`}>
      <div className={`grid gap-2 items-center
        ${showEmail ? 'grid-cols-[80px_1fr_1fr_auto]' : 'grid-cols-[80px_1fr_auto]'}`}>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          disabled={!row.active}
          className="px-2 py-1 bg-page-50 border border-page-200 rounded text-xs font-mono text-center"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!row.active}
          className="px-2 py-1 bg-page-50 border border-page-200 rounded text-sm
                     focus:bg-white focus:border-navy-500 focus:outline-none"
        />
        {showEmail && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            disabled={!row.active}
            className="px-2 py-1 bg-page-50 border border-page-200 rounded text-sm
                       focus:bg-white focus:border-navy-500 focus:outline-none"
          />
        )}
        <div className="flex items-center gap-1">
          {dirty && row.active && (
            <button onClick={save} disabled={saving}
                    className="px-2 py-1 text-[11px] bg-navy-900 text-chalk-50 rounded hover:bg-navy-800 disabled:opacity-50">
              {saving ? '…' : 'Save'}
            </button>
          )}
          <button onClick={toggleActive} disabled={saving}
                  className={`px-2 py-1 text-[11px] rounded transition-colors
                    ${row.active ? 'text-bad hover:bg-red-50' : 'text-ok hover:bg-green-50'}`}>
            {row.active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddRowForm({ nextSortOrder, onAdd, showEmail, saving }) {
  const [value, setValue] = useState('');
  const [email, setEmail] = useState('');
  const [sortOrder, setSortOrder] = useState(nextSortOrder);

  useEffect(() => { setSortOrder(nextSortOrder); }, [nextSortOrder]);

  function submit() {
    if (!value.trim()) return;
    onAdd(value, parseInt(sortOrder, 10) || 100, email);
    setValue(''); setEmail('');
  }

  return (
    <div className="p-3 bg-accent-500/5 border-t-2 border-accent-500/30">
      <div className={`grid gap-2 items-center
        ${showEmail ? 'grid-cols-[80px_1fr_1fr_auto]' : 'grid-cols-[80px_1fr_auto]'}`}>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="px-2 py-1 bg-white border border-page-200 rounded text-xs font-mono text-center"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="New value"
          className="px-2 py-1 bg-white border border-page-200 rounded text-sm focus:border-navy-500 focus:outline-none"
        />
        {showEmail && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="px-2 py-1 bg-white border border-page-200 rounded text-sm focus:border-navy-500 focus:outline-none"
          />
        )}
        <button onClick={submit} disabled={!value.trim() || saving}
                className="px-3 py-1 text-xs bg-navy-900 text-chalk-50 rounded hover:bg-navy-800 disabled:opacity-50 font-medium whitespace-nowrap">
          + Add
        </button>
      </div>
    </div>
  );
}
