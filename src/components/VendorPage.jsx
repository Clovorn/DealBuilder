import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useFavorites } from '../lib/useFavorites.js';
import { useVendors } from '../lib/useVendors.js';
import ItemDetailDrawer from './ItemDetailDrawer.jsx';

export default function VendorPage({ slug, navigate, canEdit, role, userId }) {
  const vendorsList = useVendors();
  const favorites = useFavorites(userId);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openCategoryId, setOpenCategoryId] = useState(null); // start closed per design choice
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  // Resolve slug -> vendor record
  const vendor = vendorsList.bySlug[slug] || null;

  // Load this vendor's items once we know which vendor we are.
  // Use vendor_id from the resolved vendor (not slug) so the filter works
  // regardless of casing or any slug normalization quirks.
  useEffect(() => {
    if (!vendor?.id) {
      // No vendor yet; reset state so we don't show stale items from a previous vendor
      setItems([]);
      return;
    }
    let cancelled = false;
    setItemsLoading(true);
    setError(null);
    supabase
      .from('v_catalog')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('description')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setItems([]);
        } else {
          setItems(data || []);
        }
        setItemsLoading(false);
      });
    return () => { cancelled = true; };
  }, [vendor?.id]);

  // Group items by category — accordion has one section per category that contains items
  const categoryGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((it) =>
          (it.description || '').toLowerCase().includes(q) ||
          (it.model || '').toLowerCase().includes(q) ||
          (it.sku || '').toLowerCase().includes(q) ||
          (it.vendor_item_num || '').toLowerCase().includes(q)
        )
      : items;

    const groups = new Map();
    for (const it of filtered) {
      const key = it.category_id || 'uncategorized';
      const name = it.category || 'Uncategorized';
      if (!groups.has(key)) groups.set(key, { id: key, name, items: [] });
      groups.get(key).items.push(it);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, search]);

  // When the user searches, auto-open all categories with matches so results are visible.
  useEffect(() => {
    if (search.trim() && categoryGroups.length > 0) {
      setOpenCategoryId('__all_open__');
    }
  }, [search, categoryGroups.length]);

  // Loading state for the vendor lookup
  if (vendorsList.loading) {
    return <div className="p-10 text-center text-slate-500 text-sm">Loading…</div>;
  }

  // Vendor not found
  if (!vendor) {
    return (
      <div className="px-4 md:px-10 py-10 max-w-2xl">
        <button onClick={() => navigate('home')}
                className="text-sm text-navy-700 hover:text-navy-900 font-medium mb-4 flex items-center gap-1">
          ← Home
        </button>
        <h1 className="text-2xl font-light text-slate-900 mb-2">Vendor not found</h1>
        <p className="text-slate-600 text-sm">
          We couldn't find a vendor with slug <code className="bg-page-100 px-1.5 py-0.5 rounded font-mono">{slug}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      {/* Breadcrumb back to home */}
      <button onClick={() => navigate('home')}
              className="text-sm text-navy-700 hover:text-navy-900 font-medium mb-3 flex items-center gap-1">
        ← Home
      </button>

      {/* Vendor header: logo + name + product count + website link */}
      <header className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
        <div className="flex-shrink-0">
          {vendor.logo_url ? (
            <img src={vendor.logo_url} alt={vendor.display_name}
                 className="h-12 md:h-16 max-w-[200px] object-contain" />
          ) : (
            <div className="text-3xl md:text-4xl font-black text-navy-900 tracking-tight"
                 style={{ letterSpacing: '-0.02em' }}>
              {vendor.display_name}
            </div>
          )}
        </div>
        <div className="md:ml-4 md:border-l md:border-page-200 md:pl-6">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
            Vendor
          </p>
          <h1 className="text-xl md:text-2xl font-light text-slate-900 mb-1">
            {vendor.display_name}
            <span className="ml-2 md:ml-3 text-sm text-slate-500 font-normal">
              {vendor.product_count} {vendor.product_count === 1 ? 'product' : 'products'}
            </span>
          </h1>
          {vendor.website_url && (
            <a href={vendor.website_url} target="_blank" rel="noreferrer noopener"
               className="text-xs text-navy-700 hover:text-navy-900 font-medium">
              {vendor.website_url.replace(/^https?:\/\//, '')} ↗
            </a>
          )}
        </div>
      </header>

      {/* Search within this vendor */}
      <div className="relative mb-5 md:mb-6 max-w-md">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${vendor.display_name} products…`}
          className="w-full pl-10 pr-3 py-2.5 md:py-2 bg-white border border-page-200
                     rounded focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10
                     focus:outline-none transition-colors text-sm"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
             fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>

      {itemsLoading && <div className="py-10 text-center text-slate-500 text-sm">Loading products…</div>}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!itemsLoading && !error && categoryGroups.length === 0 && (
        <div className="bg-white border border-page-200 rounded-lg py-12 text-center">
          <p className="text-slate-500 text-sm">
            {search ? 'No products match your search.' : 'No products from this vendor yet.'}
          </p>
        </div>
      )}

      {/* Accordion of categories */}
      {!itemsLoading && !error && categoryGroups.length > 0 && (
        <div className="space-y-2">
          {categoryGroups.map((group) => {
            const isOpen = openCategoryId === group.id || openCategoryId === '__all_open__';
            return (
              <CategoryAccordion
                key={group.id}
                group={group}
                isOpen={isOpen}
                onToggle={() =>
                  setOpenCategoryId((cur) => {
                    // If "all open" mode, switch to single-open mode with this one
                    if (cur === '__all_open__') return null;
                    return cur === group.id ? null : group.id;
                  })
                }
                onItemClick={setSelectedItem}
                favorites={favorites}
              />
            );
          })}
        </div>
      )}

      {selectedItem && (
        <ItemDetailDrawer
          item={selectedItem}
          canEdit={canEdit}
          role={role}
          isFavorited={favorites.isFavorited(selectedItem.id)}
          onToggleFavorite={() => favorites.toggle(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
          onUpdated={(updated) => {
            setItems((prev) => prev.map((it) => (it.id === updated.id ? { ...it, ...updated } : it)));
            setSelectedItem({ ...selectedItem, ...updated });
          }}
        />
      )}
    </div>
  );
}

function CategoryAccordion({ group, isOpen, onToggle, onItemClick, favorites }) {
  return (
    <div className="bg-white border border-page-200 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={`w-full px-4 md:px-5 py-3 md:py-3.5 flex items-center justify-between
                    transition-colors text-left
                    ${isOpen ? 'bg-navy-900 text-chalk-50' : 'hover:bg-page-50'}`}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-base md:text-lg font-medium truncate
                            ${isOpen ? 'text-chalk-50' : 'text-slate-900'}`}>
            {group.name}
          </span>
          <span className={`text-xs md:text-sm font-medium
                            ${isOpen ? 'text-chalk-300' : 'text-slate-500'}`}>
            {group.items.length}
          </span>
        </div>
        <svg className={`w-5 h-5 flex-shrink-0 transition-transform duration-150
                          ${isOpen ? 'rotate-180 text-chalk-100' : 'text-slate-500'}`}
             fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-page-200">
          <ul className="divide-y divide-page-100">
            {group.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onItemClick(item)}
                  className="w-full text-left px-4 md:px-5 py-3 hover:bg-navy-50 transition-colors flex items-start gap-3"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); favorites.toggle(item.id); }}
                    className={`mt-0.5 flex-shrink-0 p-1
                                ${favorites.isFavorited(item.id) ? 'text-accent-500' : 'text-slate-300 hover:text-accent-500'}`}
                    aria-label={favorites.isFavorited(item.id) ? 'Unfavorite' : 'Favorite'}
                  >
                    <svg className="w-4 h-4"
                         fill={favorites.isFavorited(item.id) ? 'currentColor' : 'none'}
                         stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 leading-snug">
                      {item.description}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs">
                      <span className="font-mono text-[10px] text-slate-500">{item.sku}</span>
                      {item.model && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500">{item.model}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono tabular-nums text-sm text-slate-900">
                      {item.list_price != null
                        ? `$${item.list_price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        : '—'}
                    </div>
                    {item.lease_monthly_estimate != null && (
                      <div className="inline-flex items-center gap-1 mt-0.5 text-xs font-mono tabular-nums text-accent-700 font-medium">
                        <span className="w-1 h-1 rounded-full bg-accent-500" />
                        ${Math.round(item.lease_monthly_estimate).toLocaleString()}/mo
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
