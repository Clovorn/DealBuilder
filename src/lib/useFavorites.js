import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * useFavorites — manages the current user's favorited equipment items.
 *
 * Returns:
 *   favoriteIds: Set<uuid>     — fast lookup for "is item X favorited?"
 *   loading:     boolean
 *   toggle(id):  function      — adds/removes optimistically with rollback on error
 *   isFavorited(id): function  — convenience predicate
 */
export function useFavorites(userId) {
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setFavoriteIds(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('user_favorites')
      .select('equipment_id')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load favorites:', error);
          setFavoriteIds(new Set());
        } else {
          setFavoriteIds(new Set(data.map((r) => r.equipment_id)));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    async (equipmentId) => {
      if (!userId || !equipmentId) return;
      const wasFavorited = favoriteIds.has(equipmentId);
      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorited) next.delete(equipmentId);
        else next.add(equipmentId);
        return next;
      });
      // Persist
      const { error } = wasFavorited
        ? await supabase
            .from('user_favorites')
            .delete()
            .eq('user_id', userId)
            .eq('equipment_id', equipmentId)
        : await supabase
            .from('user_favorites')
            .insert({ user_id: userId, equipment_id: equipmentId });
      // Rollback if it failed
      if (error) {
        console.error('Failed to toggle favorite:', error);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFavorited) next.add(equipmentId);
          else next.delete(equipmentId);
          return next;
        });
      }
    },
    [userId, favoriteIds]
  );

  const isFavorited = useCallback(
    (equipmentId) => favoriteIds.has(equipmentId),
    [favoriteIds]
  );

  return { favoriteIds, loading, toggle, isFavorited };
}
