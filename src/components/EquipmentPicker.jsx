import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useFavorites } from '../lib/useFavorites.js';

/**
 * EquipmentPicker — modal for selecting an equipment item from the catalog.
 *
 * Used by:
 *   - DealBuilder (when building a deal's equipment selection)
 *   - BundlesAdmin (when adding items to a bundle)
 *
 * Calls onPick(equipment) when an item is chosen. The picker stays open
 * after each pick if `multiSelect` is true (caller handles closing).
 *
 * Bundle-mode filter (v27):
 *   - allowedEquipmentIds: optional Set<uuid>. When provided, the picker
 *     shows ONLY items whose id is in the set. Used by DealBuilder bundle
 *     mode to restrict reps to bundle-eligible items + the bundle's
 *     pre-loaded core items.
 *   - scopeLabel: optional string shown in the header to explain the filter
 *     (e.g. "Showing items eligible for this bundle").
 *
 * Favorites (v34):
 *   - userId: optional uuid. When provided, the picker loads the rep's
 *     favorited items and offers a "Favorites" filter toggle plus a star
 *     marker on favorited rows — a fast path to the gear a rep sells
 *     regularly. Favorites intersect with the bundle filter when both apply.
 */
export default function EquipmentPicker({ onPick, onClose, multiSelect = true, allowedEquipmentIds = null, scopeLabel = null, userId = null }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const { favoriteIds, loading: favLoading } = useFavorites(userId);
  const hasFavorites = favoriteIds.size > 0;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('v_catalog')
      .select('id, sku, description, model, list_price, price_50_plus, lease_eligible, lease_monthly_estimate, vendor, vendor_id, category')
      .eq('active', true)
      .order('description')
      .limit(500)
      .then(({ data }) => {
        if (cancelled) return;
        setItems(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Compile vendor list from loaded items
  const vendors = useMemo(() => {
    const set = new Set();
    for (const it of items) if (it.vendor) set.add(it.vendor);
    return [...set].sort();
  }, [items]);

  // Filter by favorites + search + vendor + (in bundle mode) by allowed equipment ids
  const filtered = useMemo(() => {
    let list = items;
    if (allowedEquipmentIds instanceof Set && allowedEquipmentIds.size > 0) {
      list = list.filter((it) => allowedEquipmentIds.has(it.id));
    }
    if (favoritesOnly && hasFavorites) {
      list = list.filter((it) => favoriteIds.has(it.id));
    }
    if (vendorFilter) list = list.filter((it) => it.vendor === vendorFilter);
    if (!search.trim()) return list.slice(0, 100);
    const q = search.toLowerCase();
    return list.filter((it) =>
      (it.description || '').toLowerCase().includes(q) ||
      (it.sku || '').toLowerCase().includes(q) ||
      (it.model || '').toLowerCase().includes(q)
    ).slice(0, 100);
  }, [items, search, vendorFilter, allowedEquipmentIds, favoritesOnly, hasFavorites, favoriteIds]);

  // If the rep clears their last favorite while the filter is on, drop back
  // to the full list so they aren't stuck looking at an empty picker.
  useEffect(() => {
    if (favoritesOnly && !favLoading && !hasFavorites) setFavoritesOnly(false);
  }, [favoritesOnly, favLoading, hasFavorites]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-navy-950/60 backdrop-blur-[2px] z-[60]" />
      <div className="fixed inset-x-0 md:inset-x-auto md:right-8 top-8 md:top-16 bottom-8 md:bottom-16
                      md:w-[42rem] bg-white rounded-2xl md:rounded-lg shadow-elevated z-[70]
                      overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-page-200 flex items-center justify-between bg-navy-900 text-chalk-50">
          <h3 className="text-sm font-medium">Select equipment</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {scopeLabel && (
          <div className="px-4 py-2 bg-navy-50 border-b border-navy-100 text-xs text-navy-900 flex items-start gap-2">
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{scopeLabel}</span>
          </div>
        )}

        <div className="p-3 border-b border-page-200 space-y-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by description, SKU, or model…"
            autoFocus
            className="w-full px-3 py-2 bg-white border border-page-200 rounded text-sm
                       focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none"
          />
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-page-200 rounded text-sm
                       focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none"
          >
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>

          {/* v34: Favorites quick-filter. Only shown when the rep actually has
              favorites — otherwise it's dead UI. Lets a rep jump straight to
              the gear they sell regularly. */}
          {userId && hasFavorites && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setFavoritesOnly(false)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors
                  ${!favoritesOnly
                    ? 'bg-navy-900 text-chalk-50'
                    : 'bg-white border border-page-200 text-slate-600 hover:bg-navy-50'}`}
              >
                All equipment
              </button>
              <button
                type="button"
                onClick={() => setFavoritesOnly(true)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5
                  ${favoritesOnly
                    ? 'bg-accent-500 text-white'
                    : 'bg-white border border-page-200 text-slate-600 hover:bg-navy-50'}`}
              >
                <svg className="w-3.5 h-3.5" fill={favoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                My favorites
                <span className="font-mono opacity-80">({favoriteIds.size})</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-6 text-center text-sm text-slate-500">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">
              {favoritesOnly
                ? 'None of your favorites match this search. Star items in the Catalog to build your favorites list.'
                : 'No matches.'}
            </div>
          )}
          {!loading && filtered.map((it) => {
            const fav = favoriteIds.has(it.id);
            return (
            <button
              key={it.id}
              onClick={() => onPick(it)}
              className="w-full text-left px-3 py-2.5 border-b border-page-100 hover:bg-navy-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {fav && (
                      <svg className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-label="Favorite">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    )}
                    <div className="text-sm font-medium text-slate-900 truncate">{it.description}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 flex-wrap">
                    <span className="font-mono">{it.sku}</span>
                    {it.vendor && <span>· {it.vendor}</span>}
                    {it.model && <span>· {it.model}</span>}
                    {it.category && <span>· {it.category}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {it.list_price != null && (
                    <div className="font-mono tabular-nums text-sm text-slate-900">
                      ${it.list_price.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </div>
                  )}
                  {it.lease_monthly_estimate != null && (
                    <div className="text-[10px] text-accent-700 font-medium font-mono">
                      ${Math.round(it.lease_monthly_estimate)}/mo
                    </div>
                  )}
                </div>
              </div>
            </button>
            );
          })}
        </div>

        {multiSelect && (
          <div className="px-4 py-2.5 border-t border-page-200 bg-page-50 text-[11px] text-slate-500 text-center">
            Tap an item to add it. Tap again to add more. Close when done.
          </div>
        )}
      </div>
    </>
  );
}
