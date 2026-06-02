import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useFavorites } from '../lib/useFavorites.js';
import ItemDetailDrawer from './ItemDetailDrawer.jsx';

const PAGE_SIZE_DESKTOP = 50;
const PAGE_SIZE_MOBILE = 25;

export default function CatalogBrowser({ canEdit, role, userId, favoritesOnly = false }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const favorites = useFavorites(userId);

  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [leaseOnly, setLeaseOnly] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(favoritesOnly);
  const [sortKey, setSortKey] = useState('description');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    setShowFavoritesOnly(favoritesOnly);
  }, [favoritesOnly]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from('v_catalog')
      .select('*')
      .order('description', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setItems(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const { vendors, categories } = useMemo(() => {
    const v = new Set(), c = new Set();
    for (const it of items) {
      if (it.vendor) v.add(it.vendor);
      if (it.category) c.add(it.category);
    }
    return { vendors: [...v].sort(), categories: [...c].sort() };
  }, [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (showFavoritesOnly) {
      result = result.filter((it) => favorites.isFavorited(it.id));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((it) =>
        (it.description || '').toLowerCase().includes(q) ||
        (it.model || '').toLowerCase().includes(q) ||
        (it.sku || '').toLowerCase().includes(q) ||
        (it.vendor_item_num || '').toLowerCase().includes(q)
      );
    }
    if (vendorFilter)   result = result.filter((it) => it.vendor === vendorFilter);
    if (categoryFilter) result = result.filter((it) => it.category === categoryFilter);
    if (leaseOnly)      result = result.filter((it) => it.lease_eligible);
    result = [...result].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return result;
  }, [items, search, vendorFilter, categoryFilter, leaseOnly, showFavoritesOnly, sortKey, sortDir, favorites]);

  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const pageSize = isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => { setPage(0); }, [search, vendorFilter, categoryFilter, leaseOnly, showFavoritesOnly]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function clearFilters() {
    setSearch(''); setVendorFilter(''); setCategoryFilter('');
    setLeaseOnly(false); setShowFavoritesOnly(false);
  }
  const hasActiveFilters = search || vendorFilter || categoryFilter || leaseOnly || showFavoritesOnly;

  return (
    <>
      <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
        <div className="mb-4 md:mb-6">
          <div className="flex items-end justify-between gap-3 mb-3 md:mb-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
                {favoritesOnly ? 'My' : 'Catalog'}
              </p>
              <h1 className="text-2xl md:text-3xl font-light text-slate-900">
                {favoritesOnly ? 'Favorites' : 'Equipment'}
                <span className="ml-2 md:ml-3 text-sm md:text-base text-slate-500 font-normal">
                  {filtered.length.toLocaleString()}
                  {filtered.length !== items.length && (
                    <span className="text-slate-400"> of {items.length.toLocaleString()}</span>
                  )}
                </span>
              </h1>
            </div>

            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="md:hidden flex items-center gap-1.5 px-3 py-2 bg-white border border-page-200
                         rounded text-sm text-slate-700 active:bg-page-50"
              aria-label="Toggle filters"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 6h18M6 12h12M9 18h6" />
              </svg>
              Filters
              {hasActiveFilters && <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />}
            </button>
          </div>

          <div className="relative mb-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, model, SKU, vendor #…"
              className="w-full pl-10 pr-3 py-3 md:py-2 bg-white border border-page-200
                         rounded focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10
                         focus:outline-none transition-colors text-sm md:text-base"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>

          <div className={`flex flex-wrap gap-2 md:gap-3 items-center ${filtersOpen ? '' : 'hidden md:flex'}`}>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="flex-1 md:flex-initial min-w-[140px] px-3 py-2 bg-white border border-page-200 rounded
                         text-sm focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10
                         focus:outline-none transition-colors"
            >
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="flex-1 md:flex-initial min-w-[140px] px-3 py-2 bg-white border border-page-200 rounded
                         text-sm focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10
                         focus:outline-none transition-colors"
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none px-2 py-1">
              <input type="checkbox" checked={leaseOnly} onChange={(e) => setLeaseOnly(e.target.checked)}
                     className="accent-navy-600 w-4 h-4" />
              Lease-eligible
            </label>

            {!favoritesOnly && (
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none px-2 py-1">
                <input type="checkbox" checked={showFavoritesOnly} onChange={(e) => setShowFavoritesOnly(e.target.checked)}
                       className="accent-accent-500 w-4 h-4" />
                Favorites only
              </label>
            )}

            {hasActiveFilters && (
              <button onClick={clearFilters}
                      className="px-2 py-1 text-sm text-navy-700 hover:text-navy-900
                                 underline-offset-2 hover:underline transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {loading && <div className="py-20 text-center text-slate-500">Loading catalog…</div>}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">Couldn't load catalog: {error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="hidden md:block bg-white border border-page-200 rounded-lg shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-page-50 border-b border-page-200">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-600 font-medium">
                      <th className="px-3 py-3 w-10"></th>
                      <Th sortKey="sku" current={sortKey} dir={sortDir} onClick={toggleSort}>SKU</Th>
                      <Th sortKey="vendor" current={sortKey} dir={sortDir} onClick={toggleSort}>Vendor</Th>
                      <Th sortKey="description" current={sortKey} dir={sortDir} onClick={toggleSort}>Description</Th>
                      <Th sortKey="category" current={sortKey} dir={sortDir} onClick={toggleSort}>Category</Th>
                      <Th sortKey="list_price" current={sortKey} dir={sortDir} onClick={toggleSort} align="right">List</Th>
                      <th className="px-3 py-3 text-right font-medium w-32">Lease /mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item, idx) => (
                      <tr key={item.id} onClick={() => setSelectedItem(item)}
                          className={`cursor-pointer transition-colors border-b border-page-100 last:border-b-0
                                      hover:bg-navy-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-page-50/50'}`}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <FavoriteStar isFavorite={favorites.isFavorited(item.id)} onClick={() => favorites.toggle(item.id)} />
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-600">{item.sku}</td>
                        <td className="px-3 py-3 text-slate-800 whitespace-nowrap">{item.vendor || '—'}</td>
                        <td className="px-3 py-3 text-slate-900">
                          <div className="font-medium">{item.description}</div>
                          {item.model && <div className="text-xs text-slate-500 mt-0.5">{item.model}</div>}
                        </td>
                        <td className="px-3 py-3 text-slate-700 text-xs whitespace-nowrap">{item.category || '—'}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-900">
                          {item.list_price != null
                            ? `$${item.list_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {item.lease_monthly_estimate != null ? (
                            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-sm text-accent-700 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                              ${Math.round(item.lease_monthly_estimate).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wider text-slate-400">
                              Not eligible
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {pageItems.length === 0 && (
                      <tr>
                        <td colSpan="7" className="px-3 py-16 text-center text-slate-500">
                          {favoritesOnly || showFavoritesOnly
                            ? 'No favorites yet. Tap the star on any item to add it here.'
                            : 'No items match your filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filtered.length > pageSize && <Pagination page={page} setPage={setPage} pageSize={pageSize} total={filtered.length} totalPages={totalPages} />}
            </div>

            <div className="md:hidden space-y-2">
              {pageItems.map((item) => (
                <article key={item.id} onClick={() => setSelectedItem(item)}
                         className="bg-white border border-page-200 rounded-lg p-3 active:bg-navy-50 transition-colors cursor-pointer">
                  <div className="flex items-start gap-3">
                    <button onClick={(e) => { e.stopPropagation(); favorites.toggle(item.id); }}
                            className="mt-0.5 flex-shrink-0"
                            aria-label={favorites.isFavorited(item.id) ? 'Unfavorite' : 'Favorite'}>
                      <FavoriteStar isFavorite={favorites.isFavorited(item.id)} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900 text-sm leading-snug">{item.description}</div>
                      {item.model && <div className="text-xs text-slate-500 mt-0.5">{item.model}</div>}
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        <span className="text-slate-700">{item.vendor || '—'}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-slate-500">{item.category || '—'}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono tabular-nums text-sm text-slate-900">
                        {item.list_price != null
                          ? `$${item.list_price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : '—'}
                      </div>
                      {item.lease_monthly_estimate != null && (
                        <div className="inline-flex items-center gap-1 mt-1 text-xs font-mono tabular-nums text-accent-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                          ${Math.round(item.lease_monthly_estimate).toLocaleString()}/mo
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {pageItems.length === 0 && (
                <div className="bg-white border border-page-200 rounded-lg py-12 text-center text-slate-500 text-sm">
                  {favoritesOnly || showFavoritesOnly
                    ? 'No favorites yet. Tap the star on any item to add it here.'
                    : 'No items match your filters.'}
                </div>
              )}
              {filtered.length > pageSize && <Pagination page={page} setPage={setPage} pageSize={pageSize} total={filtered.length} totalPages={totalPages} mobile />}
            </div>
          </>
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
    </>
  );
}

function Th({ sortKey, current, dir, onClick, align = 'left', children }) {
  const isActive = sortKey === current;
  return (
    <th onClick={() => onClick(sortKey)}
        className={`px-3 py-3 font-medium cursor-pointer select-none
                    hover:text-navy-900 transition-colors
                    ${align === 'right' ? 'text-right' : ''}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {isActive && <span className="text-navy-600 text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
}

function FavoriteStar({ isFavorite, onClick }) {
  const content = (
    <svg className="w-5 h-5" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
  if (!onClick) {
    return <span className={isFavorite ? 'text-accent-500' : 'text-slate-300'}>{content}</span>;
  }
  return (
    <button onClick={onClick}
            className={`p-1 transition-colors ${isFavorite ? 'text-accent-500' : 'text-slate-300 hover:text-accent-500'}`}
            aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}>
      {content}
    </button>
  );
}

function Pagination({ page, setPage, pageSize, total, totalPages, mobile = false }) {
  return (
    <div className={`${mobile ? '' : 'bg-page-50 border-t border-page-200'} px-4 py-3 flex items-center justify-between text-sm`}>
      <div className="text-slate-600 text-xs md:text-sm">
        <span className="font-medium text-slate-900">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)}</span>{' '}of {total.toLocaleString()}
      </div>
      <div className="flex gap-1">
        <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="px-3 py-1.5 border border-page-200 rounded bg-white
                           hover:bg-page-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm">
          ←
        </button>
        <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1.5 border border-page-200 rounded bg-white
                           hover:bg-page-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm">
          →
        </button>
      </div>
    </div>
  );
}
