import { useEffect, useRef, useState } from 'react';
import { signOut } from '../lib/useAuth.js';

/**
 * UserMenu — the dropdown that opens from the user badge in the header.
 *
 * Holds the user's personal and secondary actions: my deals, my team (if
 * eligible), FAQ, profile, admin, and sign-out.
 *
 * Behavior:
 *   - Click the badge: toggle open/closed.
 *   - Click outside: close.
 *   - Press Escape: close.
 *   - Pick an item: close + perform action.
 */
export default function UserMenu({ profile, session, navigate, isAdmin }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const role = profile?.role || null;
  const roleLabel = role ? ({ admin: 'Admin', director: 'Director', sales: 'Sales', customer: 'Customer' }[role] || role) : 'Loading…';
  const displayName = profile?.display_name || session.user.email;
  const initials = getInitials(profile?.display_name, session.user.email);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function go(routeName) {
    setOpen(false);
    navigate(routeName);
  }

  async function handleSignOut() {
    setOpen(false);
    await signOut();
  }

  return (
    <div className="relative" ref={rootRef}>
      {/* The badge button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 sm:gap-3 px-2 py-1.5 rounded
                   hover:bg-white/5 active:bg-white/10 transition-colors"
      >
        {/* Avatar circle with initials */}
        <div className="w-8 h-8 rounded-full bg-accent-500/20 text-accent-300
                        flex items-center justify-center text-xs font-bold
                        ring-1 ring-accent-500/40 flex-shrink-0">
          {initials}
        </div>
        {/* Name + role — only on larger screens; on mobile the avatar is enough */}
        <div className="text-right hidden sm:block leading-tight">
          <div className="text-sm font-medium text-chalk-50 max-w-[12rem] truncate">
            {displayName}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-chalk-300 font-medium">
            {roleLabel}
          </div>
        </div>
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-chalk-300 transition-transform hidden sm:block
                      ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-elevated
                     border border-page-200 overflow-hidden z-50 animate-fadein"
        >
          {/* User info block */}
          <div className="px-4 py-3 bg-page-50 border-b border-page-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-navy-900 text-chalk-50
                              flex items-center justify-center text-sm font-bold flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 truncate">{displayName}</div>
                <div className="text-xs text-slate-600 truncate">{session.user.email}</div>
                <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded
                                bg-navy-900 text-chalk-50 text-[10px] uppercase
                                tracking-wider font-bold">
                  {roleLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* My deals — rep's workspace for in-progress drafts and submitted
                quotes/deals. Sits above the profile entry because it's a more
                frequent destination than profile/password editing. */}
            <MenuItem
              icon={MyDealsGlyph}
              label="My deals"
              hint="Your drafts and submitted quotes"
              onClick={() => go('my-deals')}
            />
            {/* v31: My Team — manager/admin workspace for approving deals.
                The `isAdmin` prop here is true for both director and admin
                roles (see Shell.jsx where it's computed), so this entry
                appears for the same audience that gets the My Team tab. */}
            {isAdmin && (
              <MenuItem
                icon={TeamGlyph}
                label="My team"
                hint="Approve Purchase and Loan deals from your reps"
                onClick={() => go('my-team')}
              />
            )}
            <MenuItem
              icon={FaqGlyph}
              label="FAQ"
              hint="Help, answers, and process guidance"
              onClick={() => go('faq')}
            />
            <MenuItem
              icon={ProfileGlyph}
              label="My profile"
              hint="Edit your name, change your password"
              onClick={() => go('profile')}
            />
            {isAdmin && (
              <MenuItem
                icon={SettingsGlyph}
                label="Admin"
                hint="Hero, announcements, bundles, vendors"
                onClick={() => go('admin')}
              />
            )}
          </div>

          {/* Sign out — separated visually because it's destructive */}
          <div className="border-t border-page-200 py-1">
            <MenuItem
              icon={SignOutGlyph}
              label="Sign out"
              onClick={handleSignOut}
              tone="danger"
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-page-50 border-t border-page-100 text-[10px] text-slate-500 flex justify-between">
            <span>Ronnoco Deal Builder</span>
            <span className="font-mono">v0.3</span>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, hint, onClick, tone }) {
  const toneClass = tone === 'danger'
    ? 'text-bad hover:bg-red-50'
    : 'text-slate-800 hover:bg-page-50';
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${toneClass}`}
    >
      <Icon />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{hint}</div>}
      </div>
    </button>
  );
}

function getInitials(name, email) {
  const source = name || email || '';
  if (!source) return '?';
  const parts = source.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function ProfileGlyph() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function MyDealsGlyph() {
  // Document with a folded corner + a small checkmark — reads as "your work in progress."
  // Matches the line weight (1.8) and 24x24 viewBox of the other menu glyphs.
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M9 14l2 2 4-4" />
    </svg>
  );
}
// v31: TeamGlyph for the "My team" menu entry. A group of figures —
// matches the TeamIcon used in Shell.jsx's nav tabs at the smaller 16px
// (w-4 h-4) size used by menu entries.
function TeamGlyph() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 20a6 6 0 0 1 12 0" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 4a3 3 0 1 1 0 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 13a5 5 0 0 1 4 4.5" />
    </svg>
  );
}
function FaqGlyph() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}
function SettingsGlyph() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function SignOutGlyph() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}
