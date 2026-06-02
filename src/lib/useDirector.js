import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * useDirector — fetches the currently signed-in user's director info via
 * the get_my_director() RPC on the catalog project.
 *
 * Why an RPC and not a direct query: the rep's user_profiles row doesn't
 * include the director's email, and the rep can't read the director's
 * user_profiles row under RLS. SECURITY DEFINER on the RPC bridges that
 * cleanly without exposing the rest of the directory.
 *
 * Returns:
 *   {
 *     director: { director_user_id, director_name, director_email } | null,
 *     loading:  boolean,
 *     error:    string | null,
 *   }
 *
 * Returns director=null in both "loaded but no director assigned" and
 * "RPC errored" cases — distinguish via `error`.
 */
export function useDirector({ enabled = true } = {}) {
  const [director, setDirector] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc('get_my_director')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setDirector(null);
        } else {
          // RPC returns table → array. We expect 0 or 1 row.
          setDirector(Array.isArray(data) && data.length > 0 ? data[0] : null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { director, loading, error };
}
