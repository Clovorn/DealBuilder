import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * useSiteSettings — loads the single row of site_settings.
 *
 * Returns:
 *   settings:  the row, or null while loading / on error
 *   loading:   true on first load
 *   error:     error message string, or null
 *   reload():  re-fetch (used by admin after a save)
 */
export function useSiteSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      setError(error.message);
      setSettings(null);
    } else {
      setSettings(data);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return { settings, loading, error, reload: load };
}
