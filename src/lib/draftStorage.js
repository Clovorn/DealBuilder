/**
 * Draft storage — durable, cross-device, per-rep deal drafts.
 *
 * Each row in `public.deal_drafts` (catalog Supabase project) holds the full
 * in-progress state of a deal sheet: the `draft` form-state object, the
 * `equipmentItems` array, the chosen `submit_mode` ('quote'|'deal'), and a
 * human-friendly `draft_name` for the workspace list.
 *
 * Lifecycle:
 *   - Rep clicks "Save draft" on a fresh form  → insertDraft() creates a row.
 *   - Rep clicks "Save draft" on a hydrated form → updateDraft() bumps the row.
 *   - Rep clicks Submit (quote or deal)         → deleteDraft() removes the row.
 *   - Rep clicks "Delete" in My Deals workspace → deleteDraft() removes the row.
 *
 * Access control is RLS — each policy checks user_id = auth.uid(). The anon
 * role has no policies at all, so unauthenticated calls can't touch this table.
 *
 * All functions return { data, error } in Supabase style so callers can handle
 * failures uniformly.
 */
import { supabase } from './supabase.js';

/**
 * Build a default draft_name from the in-progress form state.
 * Rule (per v22b spec):
 *   - "<Store name> — <City>"   if store_name is filled (city optional)
 *   - "<Store name>"            if only store_name
 *   - "Untitled draft"          if nothing meaningful filled
 *
 * Called when a draft is first saved. The rep can override it later from the
 * workspace by renaming the row.
 */
export function defaultDraftName(draft) {
  const store = (draft?.store_name || '').trim();
  const city  = (draft?.city || '').trim();
  if (store && city) return `${store} — ${city}`;
  if (store)         return store;
  return 'Untitled draft';
}

/**
 * Insert a brand-new draft row. The caller passes the authenticated user's id
 * and email so we can stamp them onto the row (user_id is the FK, email is
 * denormalized for display in the workspace list).
 *
 * Returns { data: <row>, error }.
 */
export async function insertDraft({ userId, email, submitMode, draft, equipmentItems, draftName }) {
  const name = draftName || defaultDraftName(draft);
  const { data, error } = await supabase
    .from('deal_drafts')
    .insert({
      user_id: userId,
      sales_rep_email: email,
      submit_mode: submitMode,
      draft_state: draft,
      equipment_items: equipmentItems,
      draft_name: name,
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Update an existing draft row by id. The RLS policy enforces ownership, so
 * a rep can't accidentally (or intentionally) overwrite someone else's draft
 * by guessing an id.
 *
 * If `draftName` is null/undefined, the existing name is kept (we don't want
 * to clobber a rep's custom rename just because they re-saved).
 */
export async function updateDraft({ id, submitMode, draft, equipmentItems, draftName }) {
  const patch = {
    submit_mode: submitMode,
    draft_state: draft,
    equipment_items: equipmentItems,
  };
  if (draftName != null) patch.draft_name = draftName;

  const { data, error } = await supabase
    .from('deal_drafts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

/**
 * Fetch one draft by id. Used when DealBuilder hydrates from a `?draft=<uuid>`
 * URL param. Returns null data + null error if not found (vs an actual DB
 * error), so the caller can distinguish "draft was deleted" from "DB is down."
 */
export async function fetchDraft(id) {
  const { data, error } = await supabase
    .from('deal_drafts')
    .select('id, user_id, sales_rep_email, draft_name, submit_mode, draft_state, equipment_items, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  return { data, error };
}

/**
 * List all drafts owned by the current authenticated user, newest first.
 * RLS scopes the result to user_id = auth.uid() automatically.
 */
export async function listMyDrafts() {
  const { data, error } = await supabase
    .from('deal_drafts')
    .select('id, draft_name, submit_mode, equipment_items, created_at, updated_at, draft_state')
    .order('updated_at', { ascending: false });
  return { data: data || [], error };
}

/**
 * Delete a draft by id. Used both when the rep clicks Submit (the form state
 * is now in the pipeline DB, draft is no longer needed) and when the rep
 * clicks "Delete" from the workspace list.
 *
 * Best-effort from the submit handler's perspective — if the delete fails,
 * the deal has still been submitted successfully, so we don't want to block.
 */
export async function deleteDraft(id) {
  const { error } = await supabase
    .from('deal_drafts')
    .delete()
    .eq('id', id);
  return { error };
}

/**
 * Rename a draft. Separate from updateDraft so the workspace can rename
 * inline without re-uploading the entire draft_state/equipment_items payload.
 */
export async function renameDraft(id, newName) {
  const { data, error } = await supabase
    .from('deal_drafts')
    .update({ draft_name: newName })
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}
