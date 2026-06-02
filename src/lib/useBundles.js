import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * fetchBundleById — load a bundle + its included items.
 *
 * Used by the Deal Builder when starting a deal from a bundle. The returned
 * shape gives the caller:
 *   - bundle config (math params + display fields)
 *   - the default equipment list (item_type='included' rows, joined to equipment)
 *
 * Note: 'optional' bundle_items rows were removed in v26 migration; the only
 * item_type expected here is 'included'. Filter is defensive in case any
 * legacy rows remain.
 */
export async function fetchBundleById(bundleId) {
  if (!bundleId) {
    return { bundle: null, items: [], error: 'No bundle id provided.' };
  }

  // Load the bundle config.
  const { data: bundle, error: bundleErr } = await supabase
    .from('bundles')
    .select(`
      id, name, description, long_description, image_url, category,
      target_monthly_fee, soft_cost_pct, service_reserve, term_months, lease_rate,
      active, featured
    `)
    .eq('id', bundleId)
    .maybeSingle();

  if (bundleErr) return { bundle: null, items: [], error: bundleErr.message };
  if (!bundle)   return { bundle: null, items: [], error: 'Bundle not found.' };

  // Load the included items with equipment details.
  const { data: rows, error: itemsErr } = await supabase
    .from('bundle_items')
    .select(`
      id, quantity, item_type, override_price, sort_order,
      equipment:equipment_id (
        id, sku, description, model, list_price, bundle_eligible,
        vendors:vendor_id ( name )
      )
    `)
    .eq('bundle_id', bundleId)
    .eq('item_type', 'included')
    .order('sort_order');

  if (itemsErr) return { bundle, items: [], error: itemsErr.message };

  // Normalize into the shape DealBuilder uses for equipmentItems.
  const items = (rows || [])
    .filter((r) => r.equipment) // skip orphans where equipment was deleted
    .map((r) => ({
      equipment_id: r.equipment.id,
      sku:          r.equipment.sku,
      description:  r.equipment.description,
      model:        r.equipment.model,
      vendor:       r.equipment.vendors?.name || null,
      list_price:   r.override_price != null ? r.override_price : r.equipment.list_price,
      quantity:     r.quantity || 1,
      // bundle-flow metadata
      from_bundle:  true,                       // mark items that came from the bundle's default list
      bundle_eligible: r.equipment.bundle_eligible === true,
    }));

  return { bundle, items, error: null };
}

/**
 * useBundleEligibleEquipment — load all currently bundle-eligible equipment.
 * Used by the Deal Builder in bundle mode to know which items the rep can
 * add via the EquipmentPicker.
 *
 * Returns equipment.id values as a Set for fast lookup.
 */
export function useBundleEligibleEquipment({ enabled = true } = {}) {
  const [ids, setIds]         = useState(null);   // Set<uuid> | null while loading
  const [loading, setLoading] = useState(enabled);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('v_bundle_eligible_equipment')
      .select('id')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setIds(new Set());
        } else {
          setIds(new Set((data || []).map((r) => r.id)));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return { ids, loading, error };
}
