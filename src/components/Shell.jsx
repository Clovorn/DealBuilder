import RonnocoLogo from './RonnocoLogo.jsx';
import UserMenu from './UserMenu.jsx';
import NotificationBell from './NotificationBell.jsx';

// Regular nav tabs — the main browsable areas. Admin, My Team, and FAQ live
// in the user menu now; New Deal is a separate primary CTA, rendered as an
// outlined button beside the tabs (because it's an action, not a place).
const TABS = [
  { key: 'home',       label: 'Home',       routeName: 'home',       icon: HomeIcon },
  { key: 'catalog',    label: 'Catalog',    routeName: 'catalog',    icon: CatalogIcon },
  { key: 'bundles',    label: 'Bundles',    routeName: 'bundles',    icon: BundlesIcon },
  { key: 'favorites',  label: 'Favorites',  routeName: 'favorites',  icon: StarIcon },
];

/**
 * Shell takes a `routeName` (one of 'home','catalog','bundles','favorites','my-team',
 * 'admin','vendor','vendors','profile','deal','not-found') and a `navigate(name, params)`
 * function. Vendor / vendors / profile pages bucket under 'home' for highlight purposes.
 */
export default function Shell({ profile, session, routeName, navigate, children }) {
  const role = profile?.role || null;
  // isAdmin here is true for managers (director + admin) — used to show the
  // Admin menu entry. Kept under this name for backward-compat with the
  // existing UserMenu prop API; the value covers all "elevated" roles.
  const isAdmin = role === 'admin' || role === 'director';
  const isManagerOrAdmin = isAdmin;  // alias for tab filtering clarity

  const visibleTabs = TABS;

  // For highlighting, treat vendor & profile sub-pages as part of 'home'
  const activeTab =
    routeName === 'vendor' || routeName === 'vendors' || routeName === 'profile'
      ? 'home'
      : routeName;

  const isDealActive = activeTab === 'deal';

  return (
    <div className="min-h-screen bg-page-50 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="bg-navy-900 text-chalk-50 shadow-navbar sticky top-0 z-30 print:hidden
                         pt-[env(safe-area-inset-top)]
                         pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="px-4 md:px-6 lg:px-10 py-3 md:py-4 flex items-center justify-between gap-4">
          <button onClick={() => navigate('home')}
                  className="flex items-center gap-4 group" aria-label="Go to home">
            <RonnocoLogo variant="on-dark" />
            <div className="hidden md:block h-6 w-px bg-chalk-50/15" />
            <div className="hidden md:block">
              <div className="text-xs uppercase tracking-[0.18em] text-chalk-300 group-hover:text-chalk-50 transition-colors font-medium">
                Deal Builder
              </div>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {visibleTabs.map((t) => (
              <button key={t.key} onClick={() => navigate(t.routeName)}
                      className={`px-3 py-1.5 text-sm rounded transition-colors font-medium
                        ${activeTab === t.key
                          ? 'bg-white/10 text-chalk-50'
                          : 'text-chalk-200 hover:text-chalk-50 hover:bg-white/5'}`}>
                {t.label}
              </button>
            ))}

            {/* New Deal — outlined primary CTA, set apart from the regular tabs.
                When active (we're on the deal builder), the outline solidifies. */}
            <button
              onClick={() => navigate('deal')}
              className={`ml-2 px-4 py-1.5 text-sm font-medium rounded border transition-colors
                ${isDealActive
                  ? 'bg-white text-navy-900 border-white'
                  : 'bg-transparent text-chalk-50 border-chalk-50/70 hover:bg-white/10 hover:border-chalk-50'}`}
            >
              + New Deal
            </button>
          </nav>

          <div className="flex items-center gap-1">
            {/* v32: notification bell. Hidden for customer-role users (they
                don't have deals to be notified about) and for unauthenticated
                sessions (the bell component also guards on recipientEmail). */}
            {role !== 'customer' && session?.user?.email && (
              <NotificationBell
                recipientEmail={session.user.email}
                navigate={navigate}
              />
            )}

            <UserMenu
              profile={profile}
              session={session}
              navigate={navigate}
              isAdmin={isAdmin}
            />
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-4rem)] md:min-h-0">{children}</main>

      {/* Mobile bottom tab bar. Grid column count = visible tab count + 1
          (the +1 is the New Deal button below the map). With My Team and FAQ
          moved into the user menu, mobile stays a clean 5-cell layout. */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 bg-white border-t border-page-200 z-40 print:hidden
                      pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(10,31,61,0.05)] mobile-bottom-nav">
        <div className="grid grid-cols-5">
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button key={t.key} onClick={() => navigate(t.routeName)}
                      className={`py-2.5 flex flex-col items-center gap-0.5 transition-colors
                        ${active ? 'text-navy-900' : 'text-slate-500 hover:text-slate-700'}`}
                      aria-label={t.label}>
                <Icon active={active} />
                <span className={`text-[10px] uppercase tracking-wider font-medium
                                  ${active ? 'text-navy-900' : 'text-slate-500'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}

          {/* Mobile New Deal — uses the navy color and a subtle outline to stand
              out from the regular tabs without breaking the bottom-bar pattern */}
          <button
            onClick={() => navigate('deal')}
            aria-label="New Deal"
            className={`py-2.5 flex flex-col items-center gap-0.5 transition-colors mx-1 my-1 rounded
              ${isDealActive
                ? 'bg-navy-900 text-chalk-50'
                : 'border border-navy-900/40 text-navy-900 hover:bg-navy-900 hover:text-chalk-50'}`}
          >
            <DealIcon active={isDealActive} />
            <span className="text-[10px] uppercase tracking-wider font-bold">
              New Deal
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function HomeIcon({ active }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 2-2m0 0 7-7 7 7M5 10v10a1 1 0 0 0 1 1h3m10-11 2 2m-2-2v10a1 1 0 0 1-1 1h-3m-6 0a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1m-6 0h6" />
    </svg>
  );
}
function CatalogIcon({ active }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function BundlesIcon({ active }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}
function DealIcon({ active }) {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M9 13l2 2 4-4" />
    </svg>
  );
}
function StarIcon({ active }) {
  return (
    <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}
// v31: My Team icon. Reads as "a group" — primary figure centered with two
// secondary figures behind it. Same 24x24 viewBox and stroke weights as
// the other nav icons.

