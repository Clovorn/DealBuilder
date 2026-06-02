import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import BundleDetailView from './BundleDetailView.jsx';
import BundlesGuidePage from './BundlesGuidePage.jsx';

export default function BundlesBrowser({ canEdit, navigate, initialGuideOpen = false, guideOnly = false }) {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [search, setSearch] = useState('');
  const [showGuide, setShowGuide] = useState(initialGuideOpen);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('v_bundles_with_totals')
      .select('*')
      .order('featured', { ascending: false })
      .order('sort_order')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setBundles(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = search.trim()
    ? bundles.filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase()) ||
        (b.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (b.category || '').toLowerCase().includes(search.toLowerCase())
      )
    : bundles;

  if (showGuide) {
    return (
      <BundlesGuidePage
        bundles={bundles}
        navigate={(name, params) => {
          if (name === 'bundles') {
            setShowGuide(false);
            if (guideOnly && navigate) navigate('bundles');
            return;
          }
          navigate?.(name, params);
        }}
      />
    );
  }

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="mb-4 md:mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
          Catalog
        </p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900 mb-3">
          Distributor Program Bundles
          <span className="ml-2 md:ml-3 text-sm md:text-base text-slate-500 font-normal">
            {filtered.length}
          </span>
        </h1>

        <p className="text-sm text-slate-600 leading-relaxed max-w-3xl mb-5">
          These bundles are specifically related to branded equipment packages
          connected to Distributor Programs (such as My Daily Crave, Java Select,
          Coffee House, and more). Each bundle includes the equipment listed for
          the monthly fee associated. Customers in these programs start with the
          base program and add equipment on top of the package, in addition to
          the base bundle cost.
        </p>

        <div className="flex flex-wrap gap-3 items-center mb-5">
          <button
            onClick={() => setShowGuide(true)}
            className="px-4 py-2 rounded-full bg-navy-900 text-chalk-50 text-sm font-medium hover:bg-navy-800 transition-colors"
          >
            Open bundles guide
          </button>
          <p className="text-sm text-slate-500">
            Sales help for explaining bundle pricing, process, and positioning.
          </p>
        </div>

        <div className="relative max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bundles…"
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
      </div>

      {loading && <div className="py-20 text-center text-slate-500">Loading bundles…</div>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">Couldn't load bundles: {error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="bg-white border border-page-200 rounded-lg py-16 text-center">
              <p className="text-slate-500 text-sm mb-1">
                {search ? 'No bundles match your search.' : 'No bundles yet.'}
              </p>
              {canEdit && !search && (
                <p className="text-xs text-slate-400">
                  Create your first bundle in the Admin section.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {filtered.map((bundle) => (
                <BundleCard
                  key={bundle.id}
                  bundle={bundle}
                  onClick={() => setSelectedBundle(bundle)}
                  onStartDeal={() => navigate && navigate('deal', { bundleId: bundle.id })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selectedBundle && (
        <BundleDetailView
          bundle={selectedBundle}
          onClose={() => setSelectedBundle(null)}
          onStartDeal={() => {
            const id = selectedBundle.id;
            setSelectedBundle(null);
            if (navigate) navigate('deal', { bundleId: id });
          }}
        />
      )}
    </div>
  );
}

function BundleCard({ bundle, onClick, onStartDeal }) {
  // v27: bundles now use the computed pricing model. Show only the marketed
  // "starts at" monthly fee from target_monthly_fee. No cash price.
  // Falls back to legacy monthly_lease_price for any bundles that haven't
  // been configured with target_monthly_fee yet.
  const startsAt = bundle.target_monthly_fee ?? bundle.monthly_lease_price ?? null;

  return (
    <article
      className={`bg-white border rounded-lg p-4 md:p-5 transition-all
                  hover:shadow-card
                  ${bundle.featured ? 'border-accent-500/40 ring-1 ring-accent-500/20' : 'border-page-200'}`}
    >
      {/* v29: every distributor bundle gets a "Program Bundle" identifier
          badge. Featured stays as a separate accent that admins toggle to
          highlight specific bundles. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="inline-block text-[10px] uppercase tracking-wider font-bold
                         text-navy-700 bg-navy-100 px-2 py-0.5 rounded">
          Program Bundle
        </span>
        {bundle.featured && (
          <span className="inline-block text-[10px] uppercase tracking-wider font-bold
                           text-accent-700 bg-accent-500/10 px-2 py-0.5 rounded">
            Featured
          </span>
        )}
      </div>

      <div onClick={onClick} className="cursor-pointer active:bg-navy-50 -mx-1 -mt-1 px-1 pt-1 rounded">
        {bundle.image_url ? (
          <img src={bundle.image_url} alt={bundle.name}
               className="w-full h-32 object-contain rounded mb-3 bg-page-100" />
        ) : (
          <div className="w-full h-32 rounded mb-3 bg-gradient-to-br from-navy-100 to-page-100
                          flex items-center justify-center">
            <svg className="w-10 h-10 text-navy-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}

        <h3 className="text-base font-medium text-slate-900 leading-snug mb-1">
          {bundle.name}
        </h3>
        {bundle.category && (
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
            {bundle.category}
          </p>
        )}
        {bundle.description && (
          <p className="text-sm text-slate-600 leading-relaxed mb-3 line-clamp-2">
            {bundle.description}
          </p>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-page-100">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <div className="text-xs text-slate-500">
            {bundle.included_items_count} included
          </div>
          {startsAt != null && (
            <div className="font-mono tabular-nums text-base font-medium text-navy-900">
              ${startsAt.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              <span className="text-xs text-slate-500 font-sans font-normal">/mo</span>
            </div>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onStartDeal?.(); }}
          className="w-full px-3 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                     hover:bg-navy-800 transition-colors">
          Start deal from this bundle →
        </button>
      </div>
    </article>
  );
}
