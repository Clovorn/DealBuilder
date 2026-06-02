import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function BundleDetailView({ bundle, onClose, onStartDeal }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('bundle_items')
      .select(`
        id, quantity, item_type, override_price, sort_order, notes,
        equipment:equipment_id (
          id, sku, description, model, list_price, vendor_id, category_id,
          vendors:vendor_id ( name ),
          equipment_categories:category_id ( name )
        )
      `)
      .eq('bundle_id', bundle.id)
      .order('item_type')
      .order('sort_order')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setItems(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [bundle.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const included = items.filter((it) => it.item_type === 'included');

  // v27: bundles now use the computed pricing model. Show only the marketed
  // "starts at" monthly fee from target_monthly_fee. Falls back to legacy
  // monthly_lease_price for any bundles not yet configured under the new model.
  const startsAt = bundle.target_monthly_fee ?? bundle.monthly_lease_price ?? null;
  const termMonths = bundle.term_months ?? bundle.lease_term_months ?? 36;

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-navy-950/50 backdrop-blur-[2px] z-40" />

      <aside className="fixed bg-white shadow-elevated z-50 overflow-y-auto border-page-200
                        inset-x-0 bottom-0 top-12 rounded-t-2xl border-t
                        md:inset-y-0 md:right-0 md:left-auto md:top-0 md:max-w-2xl md:w-full
                        md:rounded-t-none md:border-l md:border-t-0">

        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-page-300" />
        </div>

        <div className="sticky top-0 bg-navy-900 text-chalk-50 px-4 md:px-6 py-3 md:py-4 z-10
                        flex items-center justify-between border-b border-navy-800">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-chalk-300 mb-0.5 font-medium">
              Distributor Program Bundle{bundle.category ? ` · ${bundle.category}` : ''}
            </p>
            <h2 className="text-base md:text-lg font-medium text-chalk-50 truncate">
              {bundle.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded transition-colors ml-2" aria-label="Close">
            <svg className="w-5 h-5 text-chalk-100" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {/* Hero image — full-width banner, only when uploaded */}
          {bundle.image_url && (
            <img
              src={bundle.image_url}
              alt={bundle.name}
              className="w-full h-48 md:h-64 object-contain rounded-lg border border-page-200 bg-page-100"
            />
          )}

          {bundle.long_description && (
            <p className="text-sm text-slate-700 leading-relaxed">{bundle.long_description}</p>
          )}

          {/* Pricing summary — v29: at the bundle's default load the customer
              pays exactly target_monthly_fee. Substitutions and add-ons move
              the monthly forward. The detail view shows the base tier price. */}
          <div className="bg-page-50 border border-page-200 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">
              Program Lease
            </div>
            {startsAt != null ? (
              <>
                <div className="font-mono tabular-nums text-2xl font-medium text-navy-900">
                  ${startsAt.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                  <span className="text-sm text-slate-500 font-sans font-normal">/mo</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {termMonths}-month term · Customer's actual monthly is computed from
                  the equipment included on their deal.
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500 italic">
                Marketed monthly fee not yet configured.
              </div>
            )}
          </div>

          {/* Supply/Service/Marketing inclusion — v28 wording: digital media,
              program-branded marketing, equipment service; conditional on
              compliance with the SSM Agreement. */}
          <div className="bg-accent-500/5 border border-accent-500/20 rounded-lg p-4">
            <h3 className="text-xs uppercase tracking-[0.2em] text-accent-700 mb-2 font-semibold">
              Included with this Program
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              Customers receive <span className="font-medium">program-branded marketing</span>,
              {' '}<span className="font-medium">digital media</span>, and
              {' '}<span className="font-medium">equipment service</span> for the duration of the lease —
              {' '}when in compliance with their <span className="font-medium">Supply, Service &amp; Marketing Agreement</span> with Ronnoco.
            </p>
          </div>

          {loading && <div className="py-8 text-center text-slate-500 text-sm">Loading items…</div>}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <section>
              <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3 font-medium">
                Included Equipment ({included.length})
              </h3>
              {included.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No items added yet.</p>
              ) : (
                <div className="space-y-2">
                  {included.map((it) => <BundleItemRow key={it.id} item={it} />)}
                </div>
              )}
            </section>
          )}

          {/* Start deal CTA — sticks at bottom of scroll content */}
          {onStartDeal && (
            <div className="pt-4">
              <button
                onClick={onStartDeal}
                className="w-full px-4 py-3 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                           hover:bg-navy-800 transition-colors">
                Start deal from this bundle →
              </button>
              <p className="text-[11px] text-slate-500 mt-2 text-center leading-relaxed">
                The customer's monthly will be calculated from the equipment included
                on the deal — the rep can substitute eligible equipment in the next step.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function BundleItemRow({ item, optional = false }) {
  const eq = item.equipment;
  if (!eq) return null;
  const price = item.override_price ?? eq.list_price;
  const vendor = eq.vendors?.name;
  const category = eq.equipment_categories?.name;

  return (
    <div className="flex items-start justify-between gap-3 p-3 bg-white border border-page-200 rounded">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[10px] text-slate-500">{eq.sku}</span>
          {item.quantity > 1 && (
            <span className="text-[10px] uppercase tracking-wider text-navy-700 bg-navy-50
                             px-1.5 py-0.5 rounded font-medium">
              ×{item.quantity}
            </span>
          )}
          {optional && (
            <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-page-100
                             px-1.5 py-0.5 rounded font-medium">
              optional
            </span>
          )}
        </div>
        <div className="text-sm text-slate-900 font-medium leading-snug">{eq.description}</div>
        <div className="text-xs text-slate-500 mt-0.5">
          {vendor}{category ? ` · ${category}` : ''}
        </div>
        {item.notes && (
          <div className="text-xs text-slate-600 italic mt-1">{item.notes}</div>
        )}
      </div>
      {price != null && (
        <div className="text-right flex-shrink-0">
          <div className="font-mono tabular-nums text-sm text-slate-900">
            ${(price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </div>
          {item.quantity > 1 && (
            <div className="text-[10px] text-slate-400">
              ${price.toLocaleString(undefined, { minimumFractionDigits: 0 })} ea
            </div>
          )}
        </div>
      )}
    </div>
  );
}
