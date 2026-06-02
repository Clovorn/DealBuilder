/**
 * NotificationBell (v32).
 *
 * Lives in the header (Shell.jsx) between the nav tabs and the user menu.
 * Three pieces of UX:
 *
 *   1. The bell icon itself, with a small unread badge over the top-right.
 *      Badge shows the count when 1-9, "9+" when 10 or more, and is
 *      hidden when there are no unreads.
 *
 *   2. A dropdown panel anchored to the bell. Lists up to 25 of the
 *      latest notifications, newest first. Each item shows an icon
 *      (kind-specific), title, body (truncated), relative time, and
 *      a subtle unread dot when applicable.
 *
 *   3. A footer with "Mark all read" when there are any unreads.
 *
 * Click behavior: clicking an item navigates to the deal it references
 * (via the link_path, parsed into a route name + params) and marks the
 * notification read.
 *
 * Polling: re-fetches count every 60s, and the full list every time
 * the dropdown opens. Cheap — count is a single indexed lookup.
 *
 * Visibility: only rendered when the user has an email (logged in) and
 * the dealPipeline is configured. Customers don't get a bell.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/notifications.js';

const POLL_MS = 60_000;

export default function NotificationBell({ recipientEmail, navigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  // Background poll for the unread count. Independent of the dropdown
  // being open — we want the badge to update without the rep clicking
  // the bell. 60s cadence is plenty for a sales tool.
  useEffect(() => {
    if (!recipientEmail) return undefined;
    let cancelled = false;

    async function poll() {
      const { count } = await fetchUnreadCount(recipientEmail);
      if (!cancelled) setUnreadCount(count);
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [recipientEmail]);

  // Re-fetch the list whenever the dropdown opens.
  const loadList = useCallback(async () => {
    if (!recipientEmail) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchNotifications(recipientEmail);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setItems(data);
  }, [recipientEmail]);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleItemClick(item) {
    if (!item.is_read) {
      await markNotificationRead(item.id);
      setItems((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, is_read: true } : p))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    // link_path is "#/deals/<id>" — we navigate to the my-deals route
    // and let the page surface the right row. (Future: deep-link into
    // the expanded detail panel via a param.)
    if (item.link_path) {
      navigate?.('my-deals');
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    await markAllNotificationsRead(recipientEmail);
    setItems((prev) => prev.map((p) => ({ ...p, is_read: true })));
    setUnreadCount(0);
  }

  if (!recipientEmail) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        className="relative p-2 rounded-full text-chalk-200 hover:text-chalk-50 hover:bg-white/10 transition-colors"
      >
        <BellIcon ringing={unreadCount > 0} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1
                           bg-accent-500 text-white text-[10px] font-bold rounded-full
                           flex items-center justify-center leading-none
                           ring-2 ring-navy-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,380px)] bg-white border border-page-200
                        rounded-lg shadow-xl z-50 max-h-[70vh] flex flex-col overflow-hidden">
          <header className="px-4 py-3 border-b border-page-200 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-navy-700 hover:text-navy-900 font-medium hover:underline"
              >
                Mark all read
              </button>
            )}
          </header>

          <div className="overflow-y-auto flex-1">
            {loading && items.length === 0 ? (
              <EmptyState text="Loading…" />
            ) : error ? (
              <EmptyState text={`Couldn't load: ${error}`} tone="error" />
            ) : items.length === 0 ? (
              <EmptyState text="You're all caught up." subtext="New activity on your deals will show up here." />
            ) : (
              <ul className="divide-y divide-page-100">
                {items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </ul>
            )}
          </div>

          <footer className="px-4 py-2 border-t border-page-200 bg-page-50 text-[11px] text-slate-500">
            Showing the latest {items.length || 0} {items.length === 1 ? 'item' : 'items'}
            {unreadCount > 0 && ` · ${unreadCount} unread`}
          </footer>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Row ───────────────────────── */

function NotificationRow({ item, onClick }) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left px-4 py-3 flex gap-3 items-start
                   hover:bg-page-50 transition-colors
                   ${item.is_read ? '' : 'bg-accent-500/5'}`}
      >
        <div className="flex-shrink-0 mt-0.5">
          <KindIcon kind={item.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className={`text-sm leading-snug flex-1 min-w-0
                          ${item.is_read ? 'text-slate-700' : 'text-slate-900 font-medium'}`}>
              {item.title}
            </p>
            {!item.is_read && (
              <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-accent-500" />
            )}
          </div>
          {item.body && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
              {item.body}
            </p>
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            {formatRelativeTime(item.created_at)}
            {item.created_by && item.created_by !== 'system' && (
              <span> · by {item.created_by}</span>
            )}
          </p>
        </div>
      </button>
    </li>
  );
}

function EmptyState({ text, subtext, tone }) {
  return (
    <div className="px-6 py-8 text-center">
      <p className={`text-sm ${tone === 'error' ? 'text-bad' : 'text-slate-600'}`}>
        {text}
      </p>
      {subtext && (
        <p className="text-xs text-slate-400 mt-1">{subtext}</p>
      )}
    </div>
  );
}

/* ───────────────────────── Iconography ───────────────────────── */

function BellIcon({ ringing }) {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={ringing ? 2.1 : 1.8}
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function KindIcon({ kind }) {
  const wrap = (color, child) => (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center
                    ${color}`}>
      {child}
    </div>
  );
  switch (kind) {
    case 'decision':
      return wrap('bg-emerald-100 text-emerald-700',
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12l5 5L20 7" />
        </svg>
      );
    case 'phase_change':
      return wrap('bg-sky-100 text-sky-700',
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'note':
      return wrap('bg-amber-100 text-amber-700',
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'system':
    default:
      return wrap('bg-slate-100 text-slate-600',
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2"
             strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
  }
}

/* ───────────────────────── Time formatting ───────────────────────── */

/**
 * Returns a short relative time like "just now", "5m", "2h", "yesterday",
 * "3d ago", or a date for older items.
 */
function formatRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
