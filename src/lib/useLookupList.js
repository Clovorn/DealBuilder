import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Cached fetch for a lookup list. Subsequent calls for the same list_key
 * within a single page session reuse the in-memory cache rather than hitting
 * the database again — dropdowns are small, change infrequently, and we open
 * the deal form many times per session.
 */
const CACHE = new Map(); // list_key → Promise<rows>

function fetchList(listKey) {
  if (!CACHE.has(listKey)) {
    const p = supabase
      .from('lookup_lists')
      .select('value, sort_order, email, notes')
      .eq('list_key', listKey)
      .eq('active', true)
      .order('sort_order')
      .order('value')
      .then(({ data, error }) => {
        if (error) {
          // Bust the cache so a retry can succeed if it was transient
          CACHE.delete(listKey);
          throw error;
        }
        return data || [];
      });
    CACHE.set(listKey, p);
  }
  return CACHE.get(listKey);
}

/** Forget the cached version of a list — call after admin edits. */
export function invalidateLookupList(listKey) {
  CACHE.delete(listKey);
}

/**
 * useLookupList — returns { options, loading, error } for a given lookup_lists key.
 * Options have shape { value, email, notes }.
 */
export function useLookupList(listKey) {
  const [state, setState] = useState({ options: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchList(listKey)
      .then((options) => { if (!cancelled) setState({ options, loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setState({ options: [], loading: false, error: err.message }); });
    return () => { cancelled = true; };
  }, [listKey]);

  return state;
}
