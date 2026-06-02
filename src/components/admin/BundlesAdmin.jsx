import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import EquipmentPicker from '../EquipmentPicker.jsx';
import { calculateBundlePricing, formatCurrency, formatMonthly, formatSoftCost } from '../../lib/bundleMath.js';

const PRICING_OPTIONS = [
  { value: 'both',           label: 'Both (lease and purchase)' },
  { value: 'purchase_only',  label: 'Purchase only' },
  { value: 'lease_only',     label: 'Lease only' },
];

export default function BundlesAdmin({ onBack, userId }) {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from('bundles')
      .select('*')
      .order('featured', { ascending: false })
      .order('sort_order')
      .order('name');
    if (error) setError(error.message);
    else setBundles(data || []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button onClick={onBack}
                className="text-sm text-navy-700 hover:text-navy-900 font-medium flex items-center gap-1">
          ← Admin
        </button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 md:mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">Admin</p>
          <h1 className="text-2xl md:text-3xl font-light text-slate-900">
            Bundles
            <span className="ml-2 md:ml-3 text-sm md:text-base text-slate-500 font-normal">{bundles.length}</span>
          </h1>
        </div>
        <button onClick={() => setEditing({ _new: true })}
                className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                           hover:bg-navy-800 transition-colors">
          + New bundle
        </button>
      </div>

      {loading && <div className="py-20 text-center text-slate-500">Loading…</div>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && bundles.length === 0 && (
        <div className="bg-white border border-page-200 rounded-lg py-16 text-center">
          <p className="text-slate-500 text-sm mb-3">No bundles yet.</p>
          <button onClick={() => setEditing({ _new: true })}
                  className="text-sm text-navy-700 hover:text-navy-900 font-medium">
            Create your first one →
          </button>
        </div>
      )}

      {!loading && !error && bundles.length > 0 && (
        <div className="space-y-2">
          {bundles.map((b) => (
            <article key={b.id} onClick={() => setEditing(b)}
                     className="bg-white border border-page-200 rounded-lg p-3 md:p-4 cursor-pointer
                                hover:border-navy-300 hover:shadow-card transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm md:text-base font-medium text-slate-900">{b.name}</h3>
                    {b.featured && (
                      <span className="text-[10px] uppercase tracking-wider font-bold
                                       text-accent-700 bg-accent-500/10 px-1.5 py-0.5 rounded">
                        Featured
                      </span>
                    )}
                  </div>
                  {b.description && (
                    <p className="text-xs md:text-sm text-slate-600 line-clamp-1">{b.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 uppercase tracking-wider">
                    <span className={b.active ? 'text-ok' : 'text-slate-400'}>
                      {b.active ? '● Active' : '○ Inactive'}
                    </span>
                    {b.category && <span>{b.category}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {b.monthly_lease_price && (
                    <div className="font-mono tabular-nums text-sm text-slate-900">
                      ${b.monthly_lease_price.toLocaleString(undefined, { minimumFractionDigits: 0 })}/mo
                    </div>
                  )}
                  {b.list_price && (
                    <div className="font-mono tabular-nums text-xs text-slate-500">
                      ${b.list_price.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <BundleEditor
          bundle={editing}
          userId={userId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onDeleted={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function BundleEditor({ bundle, userId, onClose, onSaved, onDeleted }) {
  const isNew = bundle._new;
  const [draft, setDraft] = useState(
    isNew
      ? {
          name: '', description: '', long_description: '', image_url: '',
          pricing_type: 'lease_only',
          list_price: '', monthly_lease_price: '', lease_term_months: 60,
          category: '', sort_order: 10, active: true, featured: false,
          // Distributor-bundle pricing model (v26)
          target_monthly_fee: '',
          soft_cost_pct: 0.25,
          service_reserve: 1080.00,
          term_months: 36,
          lease_rate: 0.0395,
        }
      : {
          ...bundle,
          list_price:          bundle.list_price ?? '',
          monthly_lease_price: bundle.monthly_lease_price ?? '',
          target_monthly_fee:  bundle.target_monthly_fee ?? '',
          soft_cost_pct:       bundle.soft_cost_pct ?? 0.25,
          service_reserve:     bundle.service_reserve ?? 1080.00,
          term_months:         bundle.term_months ?? 36,
          lease_rate:          bundle.lease_rate ?? 0.0395,
        }
  );
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Image upload state
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const update = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  // Upload a new bundle image to the bundle-images bucket and set image_url in the draft.
  // Filename is timestamped so a re-upload never collides; old images stay in the
  // bucket as orphans (intentional — admins may want to roll back).
  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `bundle-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('bundle-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (upErr) {
      setUploading(false);
      setError(`Upload failed: ${upErr.message}`);
      return;
    }

    const { data } = supabase.storage.from('bundle-images').getPublicUrl(path);
    update('image_url', data.publicUrl);
    setUploading(false);
  }

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    supabase
      .from('bundle_items')
      .select(`id, equipment_id, quantity, item_type, override_price, sort_order, notes,
               equipment:equipment_id ( id, sku, description, model, list_price )`)
      .eq('bundle_id', bundle.id)
      .order('item_type')
      .order('sort_order')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setItems(data || []);
        setLoadingItems(false);
      });
    return () => { cancelled = true; };
  }, [bundle.id, isNew]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !pickerOpen) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pickerOpen]);

  async function save() {
    setSaving(true); setError(null);

    // Coerce numeric/empty fields
    const payload = { ...draft };
    ['list_price', 'monthly_lease_price', 'target_monthly_fee', 'service_reserve'].forEach((k) => {
      payload[k] = payload[k] === '' || payload[k] == null ? null : parseFloat(payload[k]);
    });
    payload.lease_term_months = payload.lease_term_months ? parseInt(payload.lease_term_months, 10) : null;
    payload.term_months = payload.term_months ? parseInt(payload.term_months, 10) : 36;
    payload.soft_cost_pct = payload.soft_cost_pct == null ? 0.25 : parseFloat(payload.soft_cost_pct);
    payload.lease_rate    = payload.lease_rate == null ? 0.0395 : parseFloat(payload.lease_rate);
    delete payload._new;
    ['created_at', 'updated_at', 'created_by'].forEach((k) => delete payload[k]);

    // The view v_bundles_with_totals returns derived columns. Strip them so
    // they don't get included in the bundles INSERT/UPDATE.
    ['included_items_count', 'optional_items_count', 'included_items_total'].forEach((k) => delete payload[k]);

    let bundleId = bundle.id;
    if (isNew) {
      payload.created_by = userId;
      const { data, error } = await supabase.from('bundles').insert(payload).select().single();
      if (error) { setSaving(false); setError(error.message); return; }
      bundleId = data.id;
    } else {
      delete payload.id;
      const { error } = await supabase.from('bundles').update(payload).eq('id', bundle.id);
      if (error) { setSaving(false); setError(error.message); return; }
    }

    // Sync bundle_items.
    // Strategy: delete all then re-insert. Small N, simpler than diff-based updates.
    if (!isNew) {
      const { error: delError } = await supabase.from('bundle_items').delete().eq('bundle_id', bundleId);
      if (delError) { setSaving(false); setError(delError.message); return; }
    }
    if (items.length > 0) {
      const itemPayload = items.map((it, idx) => ({
        bundle_id: bundleId,
        equipment_id: it.equipment_id,
        quantity: it.quantity || 1,
        item_type: it.item_type || 'included',
        override_price: it.override_price === '' || it.override_price == null
          ? null
          : parseFloat(it.override_price),
        sort_order: it.sort_order ?? idx * 10,
        notes: it.notes || null,
      }));
      const { error: insError } = await supabase.from('bundle_items').insert(itemPayload);
      if (insError) { setSaving(false); setError(insError.message); return; }
    }

    setSaving(false);
    onSaved();
  }

  async function remove() {
    if (!confirm(`Delete bundle "${bundle.name}"? This cannot be undone.`)) return;
    setSaving(true);
    const { error } = await supabase.from('bundles').delete().eq('id', bundle.id);
    setSaving(false);
    if (error) setError(error.message);
    else onDeleted();
  }

  function addItem(equipment) {
    setItems((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}-${Math.random()}`,
        equipment_id: equipment.id,
        equipment,
        quantity: 1,
        item_type: 'included',
        override_price: null,
        sort_order: prev.length * 10,
        notes: '',
      },
    ]);
    setPickerOpen(false);
  }

  function updateItem(idx, key, value) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-navy-950/50 backdrop-blur-[2px] z-40" />
      <aside className="fixed bg-white shadow-elevated z-50 overflow-y-auto border-page-200
                        inset-x-0 bottom-0 top-8 rounded-t-2xl border-t
                        md:inset-y-0 md:right-0 md:left-auto md:top-0 md:max-w-3xl md:w-full
                        md:rounded-t-none md:border-l md:border-t-0">

        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-page-300" />
        </div>

        <div className="sticky top-0 bg-navy-900 text-chalk-50 px-4 md:px-6 py-3 md:py-4 z-10
                        flex items-center justify-between border-b border-navy-800">
          <h2 className="text-base md:text-lg font-medium text-chalk-50 truncate">
            {isNew ? 'New bundle' : `Edit: ${bundle.name}`}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded transition-colors ml-2" aria-label="Close">
            <svg className="w-5 h-5 text-chalk-100" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-5 pb-32">
          {/* Basics */}
          <section className="space-y-3">
            <Input label="Name" value={draft.name} onChange={(v) => update('name', v)} required />
            <Input label="Category" hint="e.g. Coffee Program, Cold Beverage"
                   value={draft.category || ''} onChange={(v) => update('category', v)} />
            <Textarea label="Short description" hint="Shown on bundle cards." rows={2}
                      value={draft.description || ''} onChange={(v) => update('description', v)} />
            <Textarea label="Long description" rows={4}
                      value={draft.long_description || ''} onChange={(v) => update('long_description', v)} />

            {/* Bundle image — uploader with thumbnail preview, Replace + Remove actions */}
            <div>
              <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
                Bundle image
              </span>
              <div className="flex items-start gap-4">
                <div className="w-32 h-24 flex-shrink-0 flex items-center justify-center
                                bg-page-50 border border-page-200 rounded overflow-hidden">
                  {draft.image_url ? (
                    <img src={draft.image_url} alt="Bundle preview" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">No image</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="px-3 py-2 text-sm border border-page-200 bg-white rounded
                               hover:bg-page-50 disabled:opacity-40 transition-colors">
                    {uploading ? 'Uploading…' : draft.image_url ? 'Replace image' : 'Upload image'}
                  </button>
                  {draft.image_url && (
                    <button
                      type="button"
                      onClick={() => update('image_url', '')}
                      className="text-xs text-bad hover:underline self-start">
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                PNG, JPG, or WebP. Max 10 MB. Landscape orientation works best (shown as a banner on the bundle detail page).
              </p>
            </div>
          </section>

          {/* Pricing — Distributor Bundle Model (v26) */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium">
              Distributor Bundle Pricing
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed -mt-1">
              The customer's monthly fee is <strong>computed</strong> from the equipment list,
              soft-cost percentage, and service reserve. The marketed "Starts at" number is
              displayed on bundle cards but the actual quote uses the computed math.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Marketed starting fee ($)"
                hint='Shown on cards as "Starts at $X/mo". Display only.'
                type="number"
                value={draft.target_monthly_fee ?? ''}
                onChange={(v) => update('target_monthly_fee', v)}
              />
              <Input
                label="Lease term (months)"
                type="number"
                value={draft.term_months ?? 36}
                onChange={(v) => update('term_months', v)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Soft cost (%)"
                hint="Multiplier on hardware total. 20–25%."
                type="number"
                value={
                  draft.soft_cost_pct == null
                    ? ''
                    : (parseFloat(draft.soft_cost_pct) * 100).toFixed(0)
                }
                onChange={(v) => {
                  const pct = parseFloat(v);
                  update('soft_cost_pct', Number.isFinite(pct) ? pct / 100 : 0.25);
                }}
              />
              {/* v29: when target_monthly_fee is set, the service reserve is
                  back-solved automatically — manual edits would be ignored.
                  We swap to a read-only display so the admin sees what the
                  math is using and isn't surprised by their input not sticking. */}
              {draft.target_monthly_fee != null && draft.target_monthly_fee !== '' ? (
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">
                    Service &amp; media reserve ($)
                  </label>
                  <div className="px-3 py-2 bg-page-100 border border-page-200 rounded text-sm text-slate-700">
                    <span className="font-mono">Computed from target</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Back-solved from target monthly fee + default equipment.
                    Clear the target above to set this manually.
                  </p>
                </div>
              ) : (
                <Input
                  label="Service & media reserve ($)"
                  hint="Added to lease basis. Hidden from customer."
                  type="number"
                  value={draft.service_reserve ?? 1080}
                  onChange={(v) => update('service_reserve', v)}
                />
              )}
            </div>

            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 select-none">
                Advanced
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Input
                  label="Lease rate (multiplier)"
                  hint="× lease basis = monthly. Default 0.0395."
                  type="number"
                  value={draft.lease_rate ?? 0.0395}
                  onChange={(v) => update('lease_rate', v)}
                />
              </div>
            </details>

            {/* Live preview */}
            <BundlePricingPreview bundle={draft} items={items} />
          </section>

          {/* Legacy pricing fields — bundle has these for backward compat
              but distributor bundles use the computed model above. Hidden
              behind a disclosure so admins managing non-distributor bundles
              (if any exist) can still edit them. */}
          <section className="space-y-3">
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-700 select-none font-medium uppercase tracking-wider">
                Legacy pricing fields
              </summary>
              <div className="mt-3 space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  These fields are kept for backward compatibility. New distributor-bundle deals
                  use the computed pricing above. Edit only if you have non-distributor bundles
                  that still rely on the older manual pricing.
                </p>
                <Select label="Pricing type" value={draft.pricing_type}
                        onChange={(v) => update('pricing_type', v)} options={PRICING_OPTIONS} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="List price ($)" type="number"
                         value={draft.list_price ?? ''} onChange={(v) => update('list_price', v)} />
                  <Input label="Legacy monthly lease ($)" type="number"
                         value={draft.monthly_lease_price ?? ''} onChange={(v) => update('monthly_lease_price', v)} />
                </div>
                <Input label="Legacy lease term (months)" type="number"
                       value={draft.lease_term_months ?? ''} onChange={(v) => update('lease_term_months', v)} />
              </div>
            </details>
          </section>

          {/* Display */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium">Display</h3>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Sort order" type="number"
                     value={draft.sort_order} onChange={(v) => update('sort_order', parseInt(v, 10) || 0)} />
              <Checkbox label="Active" checked={!!draft.active} onChange={(v) => update('active', v)} />
              <Checkbox label="Featured" checked={!!draft.featured} onChange={(v) => update('featured', v)} />
            </div>
          </section>

          {/* Items */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium">
                Items ({items.length})
              </h3>
              <button onClick={() => setPickerOpen(true)}
                      className="text-sm text-navy-700 hover:text-navy-900 font-medium">
                + Add item
              </button>
            </div>

            {loadingItems && <p className="text-sm text-slate-500">Loading items…</p>}

            {!loadingItems && items.length === 0 && (
              <p className="text-sm text-slate-500 italic">
                No items yet. Click "Add item" to pick equipment.
              </p>
            )}

            <div className="space-y-2">
              {items.map((it, idx) => (
                <BundleItemEditor
                  key={it.id}
                  item={it}
                  onChange={(key, val) => updateItem(idx, key, val)}
                  onRemove={() => removeItem(idx)}
                />
              ))}
            </div>
          </section>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-page-200 px-4 md:px-6 py-3 md:py-4
                        flex items-center justify-between">
          {!isNew ? (
            <button onClick={remove} disabled={saving}
                    className="px-3 md:px-4 py-2 text-sm text-bad hover:bg-red-50 rounded
                               disabled:opacity-40 transition-colors">
              Delete
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose}
                    className="px-3 md:px-4 py-2 text-sm border border-page-200 bg-white rounded
                               hover:bg-page-50 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !draft.name?.trim()}
                    className="px-3 md:px-4 py-2 text-sm bg-navy-900 text-chalk-50 rounded
                               hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                               transition-colors font-medium">
              {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </aside>

      {pickerOpen && (
        <EquipmentPicker
          onPick={addItem}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function BundleItemEditor({ item, onChange, onRemove }) {
  const eq = item.equipment || {};
  return (
    <div className="bg-page-50 border border-page-200 rounded p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] text-slate-500">{eq.sku}</div>
          <div className="text-sm font-medium text-slate-900">{eq.description}</div>
        </div>
        <button onClick={onRemove} className="text-slate-400 hover:text-bad p-1" aria-label="Remove">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-medium">Qty</span>
          <input type="number" min="1" value={item.quantity}
                 onChange={(e) => onChange('quantity', parseInt(e.target.value, 10) || 1)}
                 className="w-full px-2 py-1.5 bg-white border border-page-200 rounded text-sm" />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-medium">Type</span>
          <select value={item.item_type}
                  onChange={(e) => onChange('item_type', e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-page-200 rounded text-sm">
            <option value="included">Included</option>
            <option value="optional">Optional</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-medium">
            Override $
          </span>
          <input type="number" step="0.01" placeholder={eq.list_price ?? '—'}
                 value={item.override_price ?? ''}
                 onChange={(e) => onChange('override_price', e.target.value)}
                 className="w-full px-2 py-1.5 bg-white border border-page-200 rounded text-sm font-mono" />
        </label>
      </div>
    </div>
  );
}


// ─── BundlePricingPreview (v26) ────────────────────────────────────────────
// Renders the computed pricing breakdown for the bundle being edited, given
// the current equipment items. Lives inside the admin form so the admin sees
// how their soft_cost / reserve / equipment choices land on the customer's
// monthly. This is the same calculation the rep will see in Increment B.
function BundlePricingPreview({ bundle, items }) {
  const equipment = useMemo(() => {
    return (items || []).map((it) => ({
      list_price: it.override_price != null && it.override_price !== ''
        ? parseFloat(it.override_price)
        : (it.equipment?.list_price ?? 0),
      quantity: it.quantity || 1,
    }));
  }, [items]);

  const pricing = useMemo(
    // v29: pass the bundle's items as `defaultEquipment` so the math helper
    // can back-solve the service reserve from target_monthly_fee. Inside
    // BundlesAdmin the "current equipment" and the "default equipment" are
    // the same thing — this is the bundle's setup, not a deal being built
    // on top of it.
    () => calculateBundlePricing({ bundle, equipment, defaultEquipment: equipment }),
    [bundle, equipment]
  );

  const target = bundle?.target_monthly_fee != null && bundle?.target_monthly_fee !== ''
    ? parseFloat(bundle.target_monthly_fee)
    : null;

  // v29: calibration metadata exposes whether the reserve was back-solved
  // from the target. Used to show "calibrated" hint + warnings.
  const wasCalibrated = pricing.calibration != null;
  const reserveWasNegative = wasCalibrated && pricing.calibration.wasNegative;
  const reserveWasFloored  = wasCalibrated && pricing.calibration.wasFloored;

  return (
    <div className="bg-page-50 border border-page-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs uppercase tracking-wider text-slate-700 font-medium">
          Computed pricing
        </h4>
        {pricing.eligible ? (
          <span className="text-[10px] uppercase tracking-wider font-bold text-ok bg-ok/10 px-2 py-0.5 rounded">
            ✓ Qualifies for lease
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-bold text-bad bg-red-50 px-2 py-0.5 rounded">
            ✗ Below $5,000
          </span>
        )}
      </div>

      <div className="space-y-1.5 text-sm font-mono tabular-nums">
        <PreviewRow label="Hardware total" value={formatCurrency(pricing.hardware)} />
        <PreviewRow
          label={`Soft cost (${formatSoftCost(pricing.softCostPct)})`}
          value={formatCurrency(pricing.softCost)}
        />
        <PreviewRow
          label={wasCalibrated ? 'Service & media reserve (calibrated)' : 'Service & media reserve'}
          value={formatCurrency(pricing.reserve)}
          muted
        />
        <div className="border-t border-page-200 my-1.5" />
        <PreviewRow
          label="Lease basis"
          value={formatCurrency(pricing.leaseBasis)}
          bold
        />
        <PreviewRow
          label={`Monthly raw (× ${pricing.leaseRate})`}
          value={formatCurrency(pricing.monthlyRaw)}
          muted
        />
        <PreviewRow
          label="Customer monthly (rounded)"
          value={formatMonthly(pricing.monthlyCharged)}
          bold
          highlight
        />
      </div>

      {/* v29: target / calibration hint */}
      {target != null && Number.isFinite(target) && (
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Marketed monthly fee: <span className="font-mono">{formatMonthly(target)}/mo</span>.{' '}
          {wasCalibrated && !reserveWasNegative ? (
            <>
              The service reserve is computed from this target and the bundle's default
              equipment so the customer pays{' '}
              <span className="font-mono font-medium text-slate-700">
                {formatMonthly(target)}/mo
              </span>{' '}
              at the default load. Substitutions and additions change the monthly forward
              from here.
            </>
          ) : (
            <>
              Computed monthly:{' '}
              <span className="font-mono font-medium text-slate-700">
                {formatMonthly(pricing.monthlyCharged)}/mo
              </span>
              {target !== pricing.monthlyCharged && (
                <>
                  {' '}({pricing.monthlyCharged > target ? '+' : '−'}
                  ${Math.abs(pricing.monthlyCharged - target).toLocaleString()} from tier)
                </>
              )}
            </>
          )}
        </p>
      )}

      {/* v29: warning when bundle equipment is too expensive for target.
         The reserve math went negative; we floored it at $1,080 but the
         monthly will be HIGHER than the target. Admin needs to either
         raise the target or remove equipment. */}
      {reserveWasNegative && (
        <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded">
          <p className="text-[11px] text-bad leading-relaxed font-medium mb-1">
            Bundle target is too low for this equipment
          </p>
          <p className="text-[11px] text-slate-700 leading-relaxed">
            The math would need a negative service reserve to land at {formatMonthly(target)}/mo.
            Either raise <span className="font-mono">target_monthly_fee</span> or remove
            equipment from the bundle. Customer monthly above is computed with the reserve
            floored at $1,080.
          </p>
        </div>
      )}

      {/* v29: notice when bundle is small and target requires a high reserve.
         Not an error — just informational so admin understands why the
         reserve is higher than the default $1,080. */}
      {wasCalibrated && !reserveWasNegative && pricing.reserve > 1500 && (
        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed italic">
          Reserve is above the $1,080 floor because the bundle's hardware total is
          modest relative to the {formatMonthly(target)} target. Margin on the program
          comes mostly from the reserve in this case.
        </p>
      )}

      {!pricing.eligible && pricing.eligibilityShortfall > 0 && (
        <p className="mt-3 text-[11px] text-bad leading-relaxed">
          Add ~{formatCurrency(pricing.eligibilityShortfall / (1 + pricing.softCostPct))} more
          in hardware to clear the $5,000 lease floor.
        </p>
      )}
    </div>
  );
}

function PreviewRow({ label, value, bold, muted, highlight }) {
  return (
    <div className={`flex items-center justify-between ${highlight ? 'bg-navy-50 -mx-2 px-2 py-1 rounded' : ''}`}>
      <span className={`${muted ? 'text-slate-500' : 'text-slate-700'} text-xs`}>{label}</span>
      <span className={`${bold ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  );
}


// Small form primitives — duplicated from AnnouncementsAdmin for self-containment
function Input({ label, hint, type = 'text', value, onChange, required }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
        {label}{required && <span className="text-bad ml-0.5">*</span>}
      </span>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required}
             className="w-full px-3 py-2.5 md:py-2 bg-white border border-page-200 rounded text-sm
                        focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none transition-colors" />
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}
function Textarea({ label, hint, value, onChange, rows = 3 }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">{label}</span>
      <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={rows}
                className="w-full px-3 py-2.5 md:py-2 bg-white border border-page-200 rounded text-sm
                           focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none transition-colors resize-y" />
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2.5 md:py-2 bg-white border border-page-200 rounded text-sm
                         focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none transition-colors">
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  );
}
function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none pt-6">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
             className="accent-navy-600 w-4 h-4" />
      <span className="text-sm text-slate-800">{label}</span>
    </label>
  );
}
