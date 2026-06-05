import { useEffect, useState } from 'react';
import { fetchQuoteForCustomer, recordQuoteView, fetchDealBundle } from '../lib/dealPipeline.js';
import RonnocoLogo from './RonnocoLogo.jsx';
import { DISTRIBUTOR_PROGRAM_BENEFITS, DISTRIBUTOR_PROGRAM_COMPLIANCE, DISTRIBUTOR_PROGRAM_REP_CLOSING, DISTRIBUTOR_PROGRAM_CUSTOMER_SUMMARY } from '../help/distributorProgramMessaging.js';

/**
 * QuoteView — public, customer-facing page for a single quote.
 *
 * Route: #/quote/{quote_number}?t={token}
 *
 * No authentication required. Access control is the token: the page only
 * displays a quote if the URL's token matches the one stored on the deal row.
 * Tokens are 192-bit random strings — practically unguessable.
 *
 * What the customer sees:
 *   - Their store name + customer name
 *   - Cover note from the rep
 *   - Equipment list with quantities and list prices
 *   - Deal type and totals (monthly lease estimate for lease deals)
 *   - Rep's name and email (so they can reply)
 *   - "Valid until" date
 *
 * What the customer does NOT see:
 *   - Cost (internal margin)
 *   - ROM, distributor info, internal notes
 *   - Other internal fields
 */
export default function QuoteView({ quoteNumber, token }) {
  const [state, setState] = useState({ loading: true, quote: null, dealBundle: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!quoteNumber || !token) {
        setState({ loading: false, quote: null, dealBundle: null, error: 'This quote link is missing required information.' });
        return;
      }
      const { data, error } = await fetchQuoteForCustomer(quoteNumber, token);
      if (cancelled) return;

      if (error) {
        setState({ loading: false, quote: null, dealBundle: null, error: 'We had trouble loading this quote. Please contact your Ronnoco sales rep.' });
        return;
      }
      if (!data) {
        setState({ loading: false, quote: null, dealBundle: null, error: 'This quote link isn\'t valid. It may have expired or the link is incorrect — please check the email or contact your Ronnoco sales rep.' });
        return;
      }

      // v27: if this deal has a deal_bundles row, fetch it so we can render
      // the bundle program section + Supply/Service/Marketing inclusion.
      // Best-effort: a missing bundle row is treated as a non-bundle deal,
      // which is the correct fallback for legacy quotes.
      const { bundle: dealBundle } = await fetchDealBundle(data.id);
      if (cancelled) return;

      setState({ loading: false, quote: data, dealBundle, error: null });

      // Best-effort: record that the customer viewed the quote.
      recordQuoteView(quoteNumber, token);
    })();
    return () => { cancelled = true; };
  }, [quoteNumber, token]);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page-50">
        <div className="text-slate-500 text-sm">Loading your quote…</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-page-50">
        <div className="max-w-md bg-white border border-page-200 rounded-lg shadow-card p-8 text-center">
          <RonnocoLogo variant="on-light" className="mb-6 mx-auto" />
          <h1 className="text-xl font-medium text-slate-900 mb-2">Quote not available</h1>
          <p className="text-sm text-slate-600 leading-relaxed">{state.error}</p>
        </div>
      </div>
    );
  }

  return <QuoteDocument quote={state.quote} dealBundle={state.dealBundle} />;
}

// ────────────────────────────────────────────────────────────────────────
// Quote document — the actual customer-facing layout

function QuoteDocument({ quote, dealBundle }) {
  // Pull equipment items from raw_csv (preserved snapshot from submission)
  const equipmentItems = quote.raw_csv?.equipment_items || [];
  const totalNumeric  = quote.raw_csv?.total_eq_cost_numeric ?? 0;
  const monthlyLease  = quote.raw_csv?.monthly_lease_estimate ?? null;
  const qualifiesLease = !!quote.raw_csv?.qualifies_for_finance;

  // v27: bundle deals carry deal_bundles row with the true (rounded) monthly
  // and the bundle's program name. When present, the quote renders as a
  // program quote with the customer-monthly = monthly_charged.
  const isBundleDeal = !!dealBundle;
  const bundleMonthly = dealBundle?.monthly_charged ?? null;
  const bundleTerm    = dealBundle?.bundle_term_months ?? 36;

  const customerName = quote.contact_name
    || [quote.first_name, quote.last_name].filter(Boolean).join(' ')
    || null;
  const customerPhone = quote.contact_cell || quote.phone || null;
  const validUntilStr = quote.quote_valid_until
    ? new Date(quote.quote_valid_until + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const sentDateStr = quote.quote_first_sent_at
    ? new Date(quote.quote_first_sent_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  // Lease vs purchase vs finance vs loan: customer-friendly labels.
  // Bundle deals override with the program name + a "Distributor Program"
  // eyebrow so the customer sees the program identity, not just "Equipment Lease".
  const dealTypeLabel = isBundleDeal
    ? (dealBundle.bundle_name || 'Distributor Program')
    : (({
        'Lease Equipment':      'Equipment Lease',
        'Finance Equipment':    'Equipment Financing',
        'Purchase From Ronnoco':'Equipment Purchase',
        'Loan Equipment':       'Equipment Placement (Loan Program)',
      })[quote.deal_type] || quote.deal_type || 'Equipment Quote');

  const isLeaseDealType = quote.deal_type === 'Lease Equipment';
  const isFinanceDealType = quote.deal_type === 'Finance Equipment';
  // Quotes that show the Estimated Monthly Lease line to the customer.
  // Lease + Finance both display it: on Lease it's the lease estimate the
  // customer is likely to pay; on Finance it's a reference figure using
  // Ronnoco's standard lease factor — the actual finance terms come from
  // underwriting after the credit application is approved.
  const showsMonthlyEstimate = isLeaseDealType || isFinanceDealType;

  return (
    <div className="min-h-screen bg-page-50">
      {/* Top banner — keeps Ronnoco branding visible */}
      <header className="bg-navy-900 text-chalk-50 py-5 px-4 print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <RonnocoLogo variant="on-dark" />
          <button
            onClick={() => window.print()}
            className="text-xs uppercase tracking-wider text-chalk-200 hover:text-chalk-50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print / Save as PDF
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Quote header card */}
        <div className="bg-white border border-page-200 rounded-lg shadow-card overflow-hidden">
          <div className="px-6 md:px-10 py-6 md:py-8 border-b border-page-200">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
                  {isBundleDeal ? 'Distributor Program Quote' : 'Equipment Quote'}
                </p>
                <h1 className="text-2xl md:text-3xl font-light text-slate-900">
                  {dealTypeLabel}
                </h1>
                {quote.store_name && (
                  <p className="text-sm text-slate-600 mt-2">
                    Prepared for <span className="font-medium text-slate-900">{quote.store_name}</span>
                    {customerName && <> · Attn: <span className="font-medium text-slate-900">{customerName}</span></>}
                  </p>
                )}
                {isBundleDeal ? (
                  <p className="text-sm text-slate-600 mt-3 max-w-2xl leading-relaxed">
                    {DISTRIBUTOR_PROGRAM_CUSTOMER_SUMMARY}
                  </p>
                ) : (
                  <p className="text-sm text-slate-600 mt-3 max-w-2xl leading-relaxed">
                    This quote is built around the equipment, pricing, and structure selected for your business needs.
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-0.5">Quote Number</p>
                <p className="font-mono text-lg text-slate-900">{quote.quote_number}</p>
                {sentDateStr && <p className="text-xs text-slate-500 mt-1">Sent {sentDateStr}</p>}
              </div>
            </div>
          </div>

          {/* Cover note */}
          {quote.quote_cover_note && (
            <div className="px-6 md:px-10 py-5 bg-accent-500/5 border-b border-page-200">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {quote.quote_cover_note}
              </p>
            </div>
          )}

          {/* Customer info */}
          {(quote.address || quote.city || quote.state || customerName || customerPhone || quote.contact_email) && (
            <div className="px-6 md:px-10 py-5 border-b border-page-200">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-3 font-semibold">Customer Information</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
                <div className="space-y-1 leading-relaxed">
                  {quote.store_name && <p><span className="font-medium text-slate-900">Store:</span> {quote.store_name}</p>}
                  {customerName && <p><span className="font-medium text-slate-900">Customer:</span> {customerName}</p>}
                  {customerPhone && <p><span className="font-medium text-slate-900">Customer Phone:</span> {customerPhone}</p>}
                  {quote.contact_email && <p><span className="font-medium text-slate-900">Customer Email:</span> {quote.contact_email}</p>}
                </div>
                {(quote.address || quote.city || quote.state || quote.zip_code) && (
                  <div className="space-y-1 leading-relaxed">
                    <p className="font-medium text-slate-900">Location</p>
                    {quote.address && <p>{quote.address}</p>}
                    <p>{[quote.city, quote.state, quote.zip_code].filter(Boolean).join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Equipment list */}
          <div className="px-6 md:px-10 py-6 border-b border-page-200">
            <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-3 font-semibold">
              {isBundleDeal ? 'Equipment Included in this Program' : 'Equipment'}
            </h2>
            {equipmentItems.length === 0 ? (
              <p className="text-sm text-slate-500 italic">{quote.equipment_selection || 'No equipment listed.'}</p>
            ) : (
              <div className="overflow-x-auto -mx-2">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                      <th className="px-2 py-2 w-12">Qty</th>
                      <th className="px-2 py-2">Item</th>
                      {!isBundleDeal && <th className="px-2 py-2 text-right">Unit Price</th>}
                      {!isBundleDeal && <th className="px-2 py-2 text-right">Extended</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-page-100">
                    {equipmentItems.map((it, i) => {
                      // Non-bundle deals price off the catalog's "Price 50+ units"
                      // tier; fall back to list price when a 50+ price isn't on
                      // file. This keeps the per-line numbers consistent with the
                      // deal total (which is computed the same way at submit time).
                      // Exception (Jun 2026): Dr. Coffee products always use List Price.
                      const p50 = it.price_50_plus;
                      const catalogPrice = (it.vendor === 'Dr. Coffee')
                        ? (it.list_price ?? 0)
                        : (p50 != null && p50 !== '' && Number(p50) > 0)
                          ? Number(p50)
                          : (it.list_price ?? 0);
                      // Custom sell price (Purchase/Cash and Finance only,
                      // raise-only). The submit-time snapshot already strips
                      // overrides on other deal types, but we gate by deal
                      // type here too for defense-in-depth and apply only
                      // when the override is actually above the catalog price.
                      const allowOv = quote.deal_type === 'Purchase Equipment'
                                   || quote.deal_type === 'Finance Equipment';
                      const ov = Number(it.sell_price_override);
                      const unitPrice = (allowOv && Number.isFinite(ov) && ov > catalogPrice)
                        ? ov
                        : catalogPrice;
                      const extended  = unitPrice * (it.quantity || 1);
                      return (
                        <tr key={i} className="text-slate-700">
                          <td className="px-2 py-3 align-top font-mono text-slate-600">{it.quantity}</td>
                          <td className="px-2 py-3 align-top">
                            <div className="font-medium text-slate-900">{it.description}</div>
                            {(it.vendor || it.model || it.sku) && (
                              <div className="text-xs text-slate-500 mt-0.5">{[it.vendor, it.model, it.sku].filter(Boolean).join(' · ')}</div>
                            )}
                          </td>
                          {!isBundleDeal && <td className="px-2 py-3 align-top text-right tabular-nums">{formatUSD(unitPrice)}</td>}
                          {!isBundleDeal && <td className="px-2 py-3 align-top text-right tabular-nums font-medium text-slate-900">{formatUSD(extended)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Program inclusion callout (bundle deals only) — v28 wording:
              digital media, program-branded marketing, equipment service;
              conditional on compliance with the SSM Agreement. */}
          {isBundleDeal && (
            <div className="px-6 md:px-10 py-6 border-b border-page-200 bg-accent-500/5">
              <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6">
                <div>
                  <h3 className="text-[11px] uppercase tracking-wider text-accent-700 mb-2 font-semibold">
                    Included with your {dealBundle.bundle_name || 'Program'}
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed mb-3">
                    This is not just an equipment quote. It is a complete beverage growth program that gives the customer access to new equipment, digital marketing support, and service when they stay compliant with the program agreement.
                  </p>
                  <ul className="space-y-2">
                    {DISTRIBUTOR_PROGRAM_BENEFITS.slice(0, 5).map((item) => (
                      <li key={item} className="text-sm text-slate-700 leading-relaxed flex gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-600 flex-shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white border border-page-200 rounded-2xl p-4">
                  <h3 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">Program compliance</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {DISTRIBUTOR_PROGRAM_COMPLIANCE}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pricing summary */}
          <div className="px-6 md:px-10 py-6">
            {isBundleDeal ? (
              /* v27 bundle deal: customer sees ONLY the rounded monthly + term.
                 No equipment total, no per-item math, no $5K fallback. The bundle
                 lease basis and soft cost are internal numbers. */
              <div className="flex flex-col gap-2 items-end">
                <div className="flex gap-12 text-base">
                  <span className="text-slate-700 font-medium">Monthly Payment</span>
                  <span className="font-mono tabular-nums text-2xl font-medium text-navy-900 min-w-[140px] text-right">
                    {bundleMonthly != null
                      ? `$${bundleMonthly.toLocaleString()}`
                      : '—'}
                    <span className="text-slate-500 text-sm font-sans font-normal ml-0.5">/mo</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-md text-right">
                  {bundleTerm}-month Program lease. Final terms are subject to credit approval.
                </p>
              </div>
            ) : (
              /* Non-bundle deal: original equipment total + lease estimate. */
              <div className="flex flex-col gap-2 items-end">
                <div className="flex gap-12 text-sm">
                  <span className="text-slate-600">Equipment Total</span>
                  <span className="font-mono tabular-nums text-slate-900 min-w-[120px] text-right">{formatUSD(totalNumeric)}</span>
                </div>

                {showsMonthlyEstimate && qualifiesLease && monthlyLease != null && (
                  <>
                    <div className="flex gap-12 text-sm">
                      <span className="text-slate-600">Estimated Monthly Lease</span>
                      <span className="font-mono tabular-nums text-slate-900 min-w-[120px] text-right">{formatUSD(monthlyLease)} <span className="text-slate-500 text-xs font-sans">/mo</span></span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 max-w-md text-right">
                      {isFinanceDealType
                        ? 'Estimate uses Ronnoco\u2019s standard lease factor for reference. Actual financing terms are set after credit approval and may differ.'
                        : 'Monthly estimate uses Ronnoco\u2019s standard lease factor and assumes a typical lease term. Final terms are subject to credit approval and may vary based on lease length and program.'}
                    </p>
                  </>
                )}

                {isLeaseDealType && !qualifiesLease && (
                  <p className="text-xs text-slate-500 mt-2 max-w-md text-right">
                    This package is below Ronnoco's $5,000 lease minimum and would be processed as a direct purchase.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Rep contact */}
        {(quote.sales_rep || quote.sales_rep_email) && (
          <div className="mt-6 bg-white border border-page-200 rounded-lg p-5 md:p-6">
            <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 font-semibold">Your Ronnoco Representative</p>
            <p className="text-sm text-slate-700">
              {quote.sales_rep && <span className="font-medium text-slate-900">{quote.sales_rep}</span>}
              {quote.sales_rep_email && (
                <>
                  {quote.sales_rep && <> · </>}
                  <a href={`mailto:${quote.sales_rep_email}`} className="text-navy-700 hover:text-navy-900 underline decoration-navy-300">
                    {quote.sales_rep_email}
                  </a>
                </>
              )}
            </p>
            <p className="text-xs text-slate-500 mt-3 leading-relaxed">
              {isBundleDeal
                ? `${DISTRIBUTOR_PROGRAM_REP_CLOSING} Reply to the email this quote came in, or contact your rep directly to review program options and next steps.`
                : 'Questions about this quote, want to change something, or ready to move forward? Reply to the email this quote came in, or contact your rep directly.'}
            </p>
          </div>
        )}

        {/* Validity & disclaimers */}
        <div className="mt-6 text-xs text-slate-500 leading-relaxed space-y-2 px-1">
          {validUntilStr && (
            <p>This quote is valid through <span className="font-medium text-slate-700">{validUntilStr}</span>.</p>
          )}
          <p>
            Pricing reflects current list prices and is subject to change. Lease and finance terms are estimates subject
            to credit approval. Final pricing, terms, and equipment availability will be confirmed by the leasing team
            before any agreement is executed.
          </p>
        </div>
      </main>
    </div>
  );
}

function formatUSD(n) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
