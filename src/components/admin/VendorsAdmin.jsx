import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

export default function VendorsAdmin({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_active_vendors')
      .select('*')
      .order('featured', { ascending: false })
      .order('featured_sort_order')
      .order('display_name');
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  const filtered = search.trim()
    ? rows.filter((r) =>
        r.display_name.toLowerCase().includes(search.toLowerCase()) ||
        (r.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button onClick={onBack}
                className="text-sm text-navy-700 hover:text-navy-900 font-medium flex items-center gap-1">
          ← Admin
        </button>
      </div>

      <div className="mb-5 md:mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">Admin</p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">
          Vendors
          <span className="ml-2 md:ml-3 text-sm md:text-base text-slate-500 font-normal">{rows.length}</span>
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-2xl">
          Upload vendor logos, set the display name shown to users, and mark which vendors appear as featured buttons on the home page.
        </p>
      </div>

      <div className="relative mb-5 max-w-md">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendors…"
          className="w-full pl-10 pr-3 py-2.5 md:py-2 bg-white border border-page-200 rounded
                     text-sm focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10
                     focus:outline-none transition-colors"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
             fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>

      {loading && <div className="py-10 text-center text-slate-500 text-sm">Loading…</div>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {filtered.map((v) => (
            <article key={v.id} onClick={() => setEditing(v)}
                     className="bg-white border border-page-200 rounded-lg p-3 md:p-4 cursor-pointer
                                hover:border-navy-300 hover:shadow-card transition-all
                                flex items-center gap-4">
              <div className="w-16 h-12 flex-shrink-0 flex items-center justify-center bg-page-50 rounded">
                {v.logo_url ? (
                  <img src={v.logo_url} alt={v.display_name}
                       className="max-h-10 max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">No logo</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm md:text-base font-medium text-slate-900">
                    {v.display_name}
                  </h3>
                  {v.featured && (
                    <span className="text-[10px] uppercase tracking-wider font-bold
                                     text-accent-700 bg-accent-500/10 px-1.5 py-0.5 rounded">
                      Featured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
                  {v.name !== v.display_name && (
                    <span className="normal-case text-xs">{v.name}</span>
                  )}
                  <span>·</span>
                  <span>{v.product_count} products</span>
                  <span>·</span>
                  <span className="font-mono normal-case text-xs text-slate-500">/{v.slug}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <VendorEditor vendor={editing}
                      onClose={() => setEditing(null)}
                      onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function VendorEditor({ vendor, onClose, onSaved }) {
  const [draft, setDraft] = useState({
    display_name:        vendor.display_name || '',
    slug:                vendor.slug || '',
    featured:            !!vendor.featured,
    featured_sort_order: vendor.featured_sort_order ?? 0,
    logo_url:            vendor.logo_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const update = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    // Filename: <slug>-<timestamp>.<ext> — slug-prefixed so it's easy to find
    // in the bucket, timestamp-suffixed so re-uploads don't collide and we
    // can roll back if needed.
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const safeSlug = draft.slug || vendor.slug || 'vendor';
    const path = `${safeSlug}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('vendor-logos')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (upErr) {
      setUploading(false);
      setError(`Upload failed: ${upErr.message}`);
      return;
    }

    const { data } = supabase.storage.from('vendor-logos').getPublicUrl(path);
    update('logo_url', data.publicUrl);
    setUploading(false);
  }

  async function save() {
    setSaving(true); setError(null);
    const payload = {
      display_name:        draft.display_name.trim() || vendor.name,
      slug:                (draft.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || null,
      featured:            !!draft.featured,
      featured_sort_order: parseInt(draft.featured_sort_order, 10) || 0,
      logo_url:            draft.logo_url?.trim() || null,
    };
    const { error } = await supabase.from('vendors').update(payload).eq('id', vendor.id);
    setSaving(false);
    if (error) setError(error.message);
    else onSaved();
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-navy-950/50 backdrop-blur-[2px] z-40" />
      <aside className="fixed bg-white shadow-elevated z-50 overflow-y-auto border-page-200
                        inset-x-0 bottom-0 top-12 rounded-t-2xl border-t
                        md:inset-y-0 md:right-0 md:left-auto md:top-0 md:max-w-xl md:w-full
                        md:rounded-t-none md:border-l md:border-t-0">

        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-page-300" />
        </div>

        <div className="sticky top-0 bg-navy-900 text-chalk-50 px-4 md:px-6 py-3 md:py-4 z-10
                        flex items-center justify-between border-b border-navy-800">
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-chalk-300 mb-0.5 font-medium">
              Vendor
            </p>
            <h2 className="text-base md:text-lg font-medium text-chalk-50 truncate">
              {vendor.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded transition-colors ml-2" aria-label="Close">
            <svg className="w-5 h-5 text-chalk-100" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-5 pb-32">
          {/* Logo upload */}
          <section>
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium mb-3">
              Logo
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-24 h-16 flex-shrink-0 flex items-center justify-center
                              bg-page-50 border border-page-200 rounded">
                {draft.logo_url ? (
                  <img src={draft.logo_url} alt="Logo preview"
                       className="max-h-14 max-w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">No logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleFileSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-2 text-sm border border-page-200 bg-white rounded
                             hover:bg-page-50 disabled:opacity-40 transition-colors">
                  {uploading ? 'Uploading…' : draft.logo_url ? 'Replace logo' : 'Upload logo'}
                </button>
                {draft.logo_url && (
                  <button
                    type="button"
                    onClick={() => update('logo_url', '')}
                    className="text-xs text-bad hover:underline self-start">
                    Remove
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              PNG, JPG, WebP, or SVG. Max 2 MB. Transparent backgrounds work best.
            </p>
          </section>

          {/* Display + routing */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium">Display</h3>
            <Input label="Display name" hint="Friendly name shown to users (e.g., 'Curtis' instead of 'SEB Professional North America')"
                   value={draft.display_name} onChange={(v) => update('display_name', v)} />
            <Input label="URL slug" hint="Used in the URL: /#/vendor/<slug>. Lowercase letters, numbers, and hyphens only."
                   value={draft.slug} onChange={(v) => update('slug', v)} />
          </section>

          {/* Featured toggle + sort */}
          <section className="space-y-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium">Home page</h3>
            <div className="grid grid-cols-2 gap-3 items-end">
              <Checkbox label="Featured on home" checked={draft.featured} onChange={(v) => update('featured', v)} />
              <Input label="Sort order" type="number" hint="Lower numbers appear first"
                     value={draft.featured_sort_order} onChange={(v) => update('featured_sort_order', v)} />
            </div>
          </section>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-page-200 px-4 md:px-6 py-3 md:py-4
                        flex items-center justify-end gap-2">
          <button onClick={onClose}
                  className="px-3 md:px-4 py-2 text-sm border border-page-200 bg-white rounded
                             hover:bg-page-50 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
                  className="px-3 md:px-4 py-2 text-sm bg-navy-900 text-chalk-50 rounded
                             hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                             transition-colors font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </aside>
    </>
  );
}

function Input({ label, hint, type = 'text', value, onChange }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">{label}</span>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
             className="w-full px-3 py-2.5 md:py-2 bg-white border border-page-200 rounded text-sm
                        focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none transition-colors" />
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
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
