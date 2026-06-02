/**
 * notifications.js — OneRonnoco-native rebuild.
 *
 * Reads/writes the single OneRonnoco `notifications` table. The native schema
 * uses (recipient_email, subject, body, related_entity_*, status, read_at);
 * this module maps that to the field names the NotificationBell UI expects
 * (title, body, deal_id, is_read, created_at) so the component is unchanged.
 *
 * "Read" state is native `status` ('read' = read, anything else = unread).
 * The email-preference toggle (originally a pipeline `team_members` table)
 * has no native equivalent yet; those calls degrade to a default-on no-op so
 * the Profile screen's toggle still renders and the in-app bell is unaffected.
 */
import { supabase } from './supabase.js';

const PAGE_SIZE = 25;

export const isNotificationsConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

function toUiNotification(row) {
  return {
    id: row.id,
    deal_id: row.related_entity_type === 'deal' ? row.related_entity_id : null,
    kind: row.trigger_event || 'info',
    title: row.subject || '',
    body: row.body || '',
    link_path: null,
    is_read: row.status === 'read',
    created_at: row.created_at,
    read_at: row.read_at,
    created_by: null,
  };
}

export async function fetchNotifications(recipientEmail, { limit = PAGE_SIZE } = {}) {
  if (!recipientEmail) return { data: [], error: null };
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_email, subject, body, trigger_event, related_entity_type, related_entity_id, status, read_at, created_at')
    .eq('recipient_email', recipientEmail)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: (data || []).map(toUiNotification), error };
}

export async function fetchUnreadCount(recipientEmail) {
  if (!recipientEmail) return { count: 0, error: null };
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_email', recipientEmail)
    .neq('status', 'read');
  return { count: count || 0, error };
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .neq('status', 'read');
  return { error };
}

export async function markAllNotificationsRead(recipientEmail) {
  if (!recipientEmail) return { error: null };
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('recipient_email', recipientEmail)
    .neq('status', 'read');
  return { error };
}

/* ── Email preference: no native table yet. Default-on, no-op writes so the
 *    Profile toggle keeps working without erroring. ── */
export async function fetchEmailNotificationsEnabled(/* email */) {
  return { enabled: true, exists: false, error: null };
}

export async function setEmailNotificationsEnabled(/* email, enabled, displayName */) {
  // No-op until a native preference store exists. Returning success keeps the
  // toggle responsive; wire to a real column when added.
  return { error: null };
}
