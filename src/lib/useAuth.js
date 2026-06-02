import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * useAuth — OneRonnoco rebuild.
 *
 * Reads the signed-in user's row from public.users (the OneRonnoco user table)
 * instead of the old catalog project's user_profiles. The returned `profile`
 * keeps the same shape the UI already consumes:
 *   { user_id, role, display_name, active, director_id, title, phone }
 * mapped from the native columns (id, role, display_name/full_name,
 * is_active, director_id, title, phone).
 */
function mapUserRow(row) {
  if (!row) return null;
  return {
    user_id: row.id,
    role: row.role,
    display_name: row.display_name || row.full_name || null,
    active: row.is_active !== false,
    director_id: row.director_id || null,
    title: row.title || null,
    phone: row.phone || null,
  };
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile(userId, sessionUser = null) {
      let { data, error } = await supabase
        .from('users')
        .select('id, role, full_name, display_name, is_active, director_id, title, phone')
        .eq('id', userId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        // Fall back to a minimal synthesized profile so the app stays usable
        // even if the users row is missing (e.g. an auth account created
        // before its profile row was provisioned).
        if (error) console.error('Failed to load profile:', error);
        if (sessionUser) {
          setProfile({
            user_id: userId, role: 'sales_rep',
            display_name: sessionUser.email || null,
            active: true, director_id: null, title: null, phone: null,
            _synthesized: true,
          });
        } else {
          setProfile(null);
        }
      } else {
        setProfile(mapUserRow(data));
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id, data.session.user)
          .finally(() => { if (!cancelled) setLoading(false); });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      if (newSession?.user) {
        loadProfile(newSession.user.id, newSession.user);
      } else {
        setProfile(null);
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  return { session, profile, loading, setProfile };
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}
