import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * useVendors — loads the list of vendors that have at least one active product.
 *
 * Returns:
 *   all:       Array of all active vendors, sorted by display_name
 *   featured:  Subset marked featured, sorted by featured_sort_order
 *   bySlug:    Map of slug -> vendor for fast lookup
 *   loading, error
 */
export function useVendors() {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('v_active_vendors')
      .select('*')
      .order('display_name')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setAll(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const featured = all
    .filter((v) => v.featured)
    .sort((a, b) => a.featured_sort_order - b.featured_sort_order);

  const bySlug = {};
  for (const v of all) if (v.slug) bySlug[v.slug] = v;

  return { all, featured, bySlug, loading, error };
}
