/**
 * DealDetailView — shared inline detail panel for a single deal row.
 *
 * Originally implemented as the `PendingDealDetails` component inside
 * MyTeamPage.jsx (v31 Session 5). v32 lifts it out so the same six
 * detail sections are available to:
 *   - The director on My Team (gated to pending_director phase)
 *   - The rep on My Deals (any phase, including their own active deals)
 *
 * Sections rendered (in order):
 *   1. Equipment              — parsed table from raw_csv, falls back to text
 *   2. Contact info           — email / phone / address / chain
 *   3. Coffee program & dist. — supplier, spend, distributor identity
 *   4. Sales rep notes        — free-text from the rep at submit time
 *   5. Customer decision      — only when populated (post-quote)
 *   6. Director decision      — only when populated (post-approval) — v32 NEW
 *   7. Equipment costs        — totals only (per-item lives in section 1)
 *
 * The director-decision block is new vs. the original MyTeam component —
 * it gives reps visibility into the approval feedback when a deal comes
 * back rejected or approved.
 *
 * All helpers (DetailSection, DefinitionList, EmptyDetailLine,
 * parseEquipmentFromRawCsv, numberOrNull, formatCurrencyOrEmpty) are
 * co-located here. MyTeamPage and MyDealsPage both import from this
 * module — no duplication.
 */
import { useMemo } from 'react';

export default function DealDetailView({ deal }) {
  const equipment = useMemo(() => parseEquipmentFromRawCsv(deal.raw_csv), [deal.raw_csv]);
  const equipmentText = (deal.equipment_selection || '').trim();
  const hasEquipmentRows = equipment && equipment.length > 0;
  const hasEquipmentText = !hasEquipmentRows && equipmentText.length > 0;

  const contactRows = [
    ['Email',   deal.email],
    ['Phone',   deal.phone],
    ['Address', deal.address],
    ['City / State', [deal.city, deal.state].filter(Boolean).join(', ')],
    ['Chain store',  deal.chain_store],
  ].filter(([_, v]) => v);

  const distributorRows = [
    ['Coffee program',                deal.coffee_program],
    ['Current coffee supplier',       deal.current_coffee_supplier],
    ['Coffee spend (last 3 months)',  formatCurrencyOrEmpty(deal.coffee_spend_3mo)],
    ['Expected monthly sales',        formatCurrencyOrEmpty(deal.expected_monthly_sales)],
    ['Parent distributor',            deal.parent_distributor],
    ['Parent distributor #',          deal.parent_distributor_num],
    ['Sub group',                     deal.sub_group],
    ['Distributor warehouse',         deal.distributor_warehouse],
    ['Distributor rep',               deal.distributor_rep_name],
    ['Distributor rep email',         deal.distributor_rep_email],
    ['Distributor rep phone',         deal.distributor_rep_phone],
    ["Distributor's customer #",      deal.distributor_customer_num],
  ].filter(([_, v]) => v);

  const economicsRows = [
    ['Total equipment cost', deal.total_eq_cost],
    ['Monthly charged',      formatCurrencyOrEmpty(deal.total_monthly_charged)],
  ].filter(([_, v]) => v);

  const repNotes = (deal.notes || '').trim();
  const customerDecisionNotes = (deal.customer_decision_notes || '').trim();
  const directorDecisionNotes = (deal.director_decision_notes || '').trim();
  const hasDirectorDecision = deal.director_decision && deal.director_decision !== null;

  return (
    <div className="p-4 md:p-5 space-y-4">

      {/* Equipment */}
      <DetailSection title="Equipment">
        {hasEquipmentRows ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-page-50 border-b border-page-200">
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium">
                  <th className="px-2 py-1.5 font-medium">Item</th>
                  <th className="px-2 py-1.5 font-medium text-center w-12">Qty</th>
                  <th className="px-2 py-1.5 font-medium text-right w-24">Price</th>
                  <th className="px-2 py-1.5 font-medium text-right w-24">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-page-200">
                {equipment.map((row, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 text-slate-800">{row.name || '—'}</td>
                    <td className="px-2 py-1.5 text-center text-slate-700">{row.quantity ?? 1}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-700">
                      {formatCurrencyOrEmpty(row.unit_price)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-900 font-medium">
                      {formatCurrencyOrEmpty(row.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : hasEquipmentText ? (
          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans bg-page-50 border border-page-200 rounded p-2.5">
            {equipmentText}
          </pre>
        ) : (
          <EmptyDetailLine text="No equipment recorded on this deal." />
        )}
      </DetailSection>

      {/* Contact */}
      <DetailSection title="Contact info">
        {contactRows.length > 0 ? (
          <DefinitionList rows={contactRows} />
        ) : (
          <EmptyDetailLine text="No contact info captured." />
        )}
      </DetailSection>

      {/* Coffee & Distributor */}
      <DetailSection title="Coffee program & distributor">
        {distributorRows.length > 0 ? (
          <DefinitionList rows={distributorRows} />
        ) : (
          <EmptyDetailLine text="No coffee or distributor info on this deal." />
        )}
      </DetailSection>

      {/* Sales rep notes */}
      <DetailSection title="Sales rep notes">
        {repNotes ? (
          <p className="text-xs text-slate-700 whitespace-pre-wrap bg-page-50 border border-page-200 rounded p-2.5 leading-relaxed">
            {repNotes}
          </p>
        ) : (
          <EmptyDetailLine text="No notes on this deal." />
        )}
      </DetailSection>

      {/* Customer decision notes (when present) */}
      {customerDecisionNotes && (
        <DetailSection title="Customer decision notes">
          <p className="text-xs text-slate-700 whitespace-pre-wrap bg-page-50 border border-page-200 rounded p-2.5 leading-relaxed">
            {customerDecisionNotes}
          </p>
        </DetailSection>
      )}

      {/* Director decision (v32 NEW). Visible when director has made a
          call. Shows decision + notes so the rep can see approval feedback
          without leaving the page. Color-coded subtly: amber for rejected,
          green for approved. */}
      {hasDirectorDecision && (
        <DetailSection title="Director decision">
          <div className={`text-xs p-2.5 rounded border whitespace-pre-wrap leading-relaxed
                          ${deal.director_decision === 'rejected'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
            <div className="font-semibold mb-1 uppercase tracking-wider text-[10px]">
              {deal.director_decision === 'rejected' ? 'Sent back for revision' : 'Approved'}
              {deal.director_decision_by && (
                <span className="font-normal normal-case tracking-normal ml-1">
                  · by {deal.director_decision_by}
                </span>
              )}
            </div>
            {directorDecisionNotes
              ? directorDecisionNotes
              : <em className="text-[11px] opacity-70">No notes provided.</em>}
          </div>
        </DetailSection>
      )}

      {/* Equipment costs (totals only) */}
      <DetailSection title="Equipment costs">
        {economicsRows.length > 0 ? (
          <DefinitionList rows={economicsRows} />
        ) : (
          <EmptyDetailLine text="No equipment cost totals captured." />
        )}
      </DetailSection>
    </div>
  );
}

/* ───────────────────────── Layout helpers ───────────────────────── */

function DetailSection({ title, children }) {
  return (
    <div>
      <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DefinitionList({ rows }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex items-baseline gap-2 min-w-0">
          <dt className="text-slate-500 flex-shrink-0">{label}:</dt>
          <dd className="text-slate-800 font-medium truncate" title={String(value)}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyDetailLine({ text }) {
  return <p className="text-[11px] text-slate-400 italic">{text}</p>;
}

/* ───────────────────────── Parsing & formatting ───────────────────────── */

/**
 * Best-effort parse of the deal's raw_csv (JSONB) into a clean equipment list.
 *
 * raw_csv can be one of three shapes depending on the deal's origin:
 *   - Deal Builder submissions: `{ equipment: [{ name, quantity, list_price, ... }] }`
 *     or `{ equipment_items: [...] }` (older payloads)
 *   - Legacy Jotform imports: a nested structure that varies; we don't try
 *     to mine those — they fall back to `equipment_selection` text.
 *   - Null / undefined: bundle-only or partial submissions.
 *
 * Returns `null` if no recognizable structured equipment list exists. The
 * caller falls back to the text dump in that case.
 */
export function parseEquipmentFromRawCsv(rawCsv) {
  if (!rawCsv) return null;
  // Sometimes Supabase returns jsonb already-parsed; sometimes as a string
  // (this is unusual but seen with raw_csv historically). Normalize.
  let payload = rawCsv;
  if (typeof rawCsv === 'string') {
    try { payload = JSON.parse(rawCsv); } catch { return null; }
  }
  const items =
    (Array.isArray(payload?.equipment) && payload.equipment) ||
    (Array.isArray(payload?.equipment_items) && payload.equipment_items) ||
    null;
  if (!items || items.length === 0) return null;
  return items.map((it) => {
    const qty = Number(it.quantity ?? it.qty ?? 1) || 1;
    const price = numberOrNull(it.list_price ?? it.unit_price ?? it.price);
    const subtotal = price != null ? price * qty : numberOrNull(it.subtotal);
    return {
      name: it.name || it.item_name || it.description || it.sku || 'Unnamed item',
      quantity: qty,
      unit_price: price,
      subtotal,
    };
  });
}

export function numberOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatCurrencyOrEmpty(v) {
  if (v == null || v === '') return '';
  // Handle both raw numbers and pre-formatted strings (some columns are text
  // like total_eq_cost = "$5,400.00" from the original Jotform import).
  if (typeof v === 'string' && /[\$,]/.test(v)) return v;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
