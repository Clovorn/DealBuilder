import { useState } from 'react';
import { useVendors } from '../lib/useVendors.js';
import VendorLogoButton from './VendorLogoButton.jsx';

export default function VendorsDirectory({ navigate }) {
  const { all, loading, error } = useVendors();
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? all.filter((v) =>
        v.display_name.toLowerCase().includes(search.toLowerCase()) ||
        (v.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : all;

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <button onClick={() => navigate('home')}
              className="text-sm text-navy-700 hover:text-navy-900 font-medium mb-3 flex items-center gap-1">
        ← Home
      </button>

      <div className="mb-5 md:mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">Directory</p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">
          All vendors
          <span className="ml-2 md:ml-3 text-sm md:text-base text-slate-500 font-normal">
            {filtered.length}
            {filtered.length !== all.length && (
              <span className="text-slate-400"> of {all.length}</span>
            )}
          </span>
        </h1>
      </div>

      <div className="relative mb-6 max-w-md">
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

      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white border border-page-200 rounded-lg py-12 text-center text-slate-500 text-sm">
          No vendors match your search.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {filtered.map((v) => (
            <VendorLogoButton
              key={v.id}
              vendor={v}
              onClick={() => navigate('vendor', { slug: v.slug })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
