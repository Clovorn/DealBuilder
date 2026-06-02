import { useAuth } from './lib/useAuth.js';
import { useRouter } from './lib/useRouter.js';
import LoginScreen from './components/LoginScreen.jsx';
import Shell from './components/Shell.jsx';
import Home from './components/Home.jsx';
import CatalogBrowser from './components/CatalogBrowser.jsx';
import BundlesBrowser from './components/BundlesBrowser.jsx';
import BundlesGuidePage from './components/BundlesGuidePage.jsx';
import SellSheetPage from './components/SellSheetPage.jsx';
import VendorPage from './components/VendorPage.jsx';
import VendorsDirectory from './components/VendorsDirectory.jsx';
import AdminHome from './components/admin/AdminHome.jsx';
import AnnouncementsAdmin from './components/admin/AnnouncementsAdmin.jsx';
import BundlesAdmin from './components/admin/BundlesAdmin.jsx';
import VendorsAdmin from './components/admin/VendorsAdmin.jsx';
import FieldRequirementsAdmin from './components/admin/FieldRequirementsAdmin.jsx';
import HeroAdmin from './components/admin/HeroAdmin.jsx';
import LookupListsAdmin from './components/admin/LookupListsAdmin.jsx';
import UsersAdmin from './components/admin/UsersAdmin.jsx';
import DealBuilder from './components/DealBuilder.jsx';
import MyDealsPage from './components/MyDealsPage.jsx';
import MyTeamPage from './components/MyTeamPage.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import FaqPage from './components/FaqPage.jsx';
import QuoteView from './components/QuoteView.jsx';
import RonnocoLogo from './components/RonnocoLogo.jsx';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function App() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return <ConfigurationRequired />;
  }

  const { session, profile, loading, setProfile } = useAuth();
  const { route, navigate } = useRouter();

  // Public route: customer-facing quote view. Renders WITHOUT auth — the customer
  // arrives via an emailed link and shouldn't be asked to sign in. Access control
  // is the token in the URL, matched against the deal's quote_token column.
  // This check must happen BEFORE the auth gate below.
  if (route.name === 'quote') {
    return <QuoteView quoteNumber={route.params.quoteNumber} token={route.params.token} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page-50">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  const role = profile?.role || null;

  // Permission split (v23):
  //   canEditCatalog — write access to equipment, bundles, vendors, etc.
  //                     ADMIN ONLY. Directors are sales-management, not catalog managers.
  //   isAdmin        — full admin access including user management.
  //                     ADMIN ONLY.
  //   isManagerOrAdmin — can the user see/manage deals beyond their own?
  //                     Directors (over their reps) + admins (everyone).
  //                     Used by the pipeline dashboard, exposed here for any
  //                     in-app screens that surface team-level data.
  const canEditCatalog = role === 'admin';
  const isAdmin = role === 'admin';
  const isManagerOrAdmin = role === 'admin' || role === 'director';
  const userId = session.user.id;

  // Inactive account guard. RLS on user_profiles already returns active rows
  // for self-reads, so an inactive user gets profile = null (treated as sales
  // default) BUT we should also surface a clear message here.
  if (profile && profile.active === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-page-50">
        <div className="max-w-md bg-white border border-page-200 rounded-lg shadow-card p-8 text-center">
          <RonnocoLogo variant="on-light" className="mb-6 mx-auto" />
          <h1 className="text-xl font-medium text-slate-900 mb-3">Account inactive</h1>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Your account has been deactivated. Contact an administrator if this is unexpected.
          </p>
        </div>
      </div>
    );
  }

  // Customer view — restricted, no catalog/vendor access
  if (role === 'customer') {
    return (
      <Shell profile={profile} session={session} routeName="home" navigate={navigate}>
        <div className="px-4 md:px-10 py-10">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
            Customer Portal
          </p>
          <h1 className="text-2xl md:text-3xl font-light text-slate-900 mb-4">Your Quotes</h1>
          <p className="text-slate-600">
            Quote viewer coming soon. You'll see your active and archived quotes here.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell profile={profile} session={session} routeName={route.name} navigate={navigate}>
      {route.name === 'home' && (
        <Home navigate={navigate} profile={profile} />
      )}

      {route.name === 'catalog' && (
        <CatalogBrowser canEdit={canEditCatalog} role={role} userId={userId} />
      )}

      {route.name === 'bundles' && (
        <BundlesBrowser canEdit={canEditCatalog} navigate={navigate} />
      )}

      {route.name === 'bundles-guide' && (
        <BundlesBrowser canEdit={canEditCatalog} navigate={navigate} initialGuideOpen={true} guideOnly={true} />
      )}

      {route.name === 'sell-sheet' && (
        <SellSheetPage navigate={navigate} profile={profile} session={session} />
      )}

      {route.name === 'favorites' && (
        <CatalogBrowser canEdit={canEditCatalog} role={role} userId={userId} favoritesOnly={true} />
      )}

      {route.name === 'vendor' && (
        <VendorPage
          slug={route.params.slug}
          navigate={navigate}
          canEdit={canEditCatalog}
          role={role}
          userId={userId}
        />
      )}

      {route.name === 'vendors' && (
        <VendorsDirectory navigate={navigate} />
      )}

      {route.name === 'deal' && (
        <DealBuilder
          profile={profile}
          session={session}
          navigate={navigate}
          draftId={route.params.draftId}
          editQuoteId={route.params.editQuoteId}
          bundleId={route.params.bundleId}
          leadData={route.params.leadData ?? null}
        />
      )}

      {route.name === 'my-deals' && (
        <MyDealsPage
          profile={profile}
          session={session}
          navigate={navigate}
        />
      )}

      {/* My Team — director's & admin's approval queue (v31). Gated to
          managers and admins only; reps who hit the URL directly get the
          friendly "no access" panel below. */}
      {route.name === 'my-team' && isManagerOrAdmin && (
        <MyTeamPage
          profile={profile}
          session={session}
          navigate={navigate}
        />
      )}

      {route.name === 'my-team' && !isManagerOrAdmin && (
        <div className="px-4 md:px-10 py-10 text-center">
          <p className="text-slate-500">You don't have access to this section.</p>
        </div>
      )}

      {route.name === 'profile' && (
        <ProfilePage
          profile={profile}
          session={session}
          navigate={navigate}
          onProfileUpdated={(updated) => setProfile(updated)}
        />
      )}

      {route.name === 'faq' && (
        <FaqPage navigate={navigate} initialAnchor={route.params.anchor} />
      )}

      {route.name === 'admin' && isAdmin && (
        <>
          {!route.params.section && <AdminHome onNavigate={(s) => navigate('admin', { section: s })} />}
          {route.params.section === 'hero' && (
            <HeroAdmin onBack={() => navigate('admin')} userId={userId} />
          )}
          {route.params.section === 'announcements' && (
            <AnnouncementsAdmin onBack={() => navigate('admin')} userId={userId} />
          )}
          {route.params.section === 'bundles' && (
            <BundlesAdmin onBack={() => navigate('admin')} userId={userId} />
          )}
          {route.params.section === 'vendors' && (
            <VendorsAdmin onBack={() => navigate('admin')} />
          )}
          {route.params.section === 'lookup-lists' && (
            <LookupListsAdmin onBack={() => navigate('admin')} />
          )}
          {route.params.section === 'field-requirements' && (
            <FieldRequirementsAdmin onBack={() => navigate('admin')} />
          )}
          {route.params.section === 'users' && (
            <UsersAdmin onBack={() => navigate('admin')} currentUserId={userId} />
          )}
        </>
      )}

      {route.name === 'admin' && !isAdmin && (
        <div className="px-4 md:px-10 py-10 text-center">
          <p className="text-slate-500">You don't have access to this section.</p>
        </div>
      )}

      {route.name === 'not-found' && (
        <div className="px-4 md:px-10 py-10 max-w-2xl">
          <h1 className="text-2xl font-light text-slate-900 mb-2">Page not found</h1>
          <p className="text-slate-600 text-sm mb-4">
            The URL <code className="bg-page-100 px-1.5 py-0.5 rounded font-mono text-xs">{route.params.path}</code> doesn't exist.
          </p>
          <button onClick={() => navigate('home')}
                  className="text-sm text-navy-700 hover:text-navy-900 font-medium">
            ← Back to home
          </button>
        </div>
      )}
    </Shell>
  );
}

function ConfigurationRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-page-50">
      <div className="max-w-md bg-white border border-page-200 rounded-lg shadow-card p-8">
        <RonnocoLogo variant="on-light" className="mb-6" />
        <h1 className="text-xl font-medium text-slate-900 mb-3">Configuration required</h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          The Supabase environment variables are not set. Add{' '}
          <code className="bg-page-100 px-1.5 py-0.5 rounded text-xs font-mono">VITE_SUPABASE_URL</code>{' '}
          and{' '}
          <code className="bg-page-100 px-1.5 py-0.5 rounded text-xs font-mono">VITE_SUPABASE_ANON_KEY</code>{' '}
          to your Netlify site's environment variables, then redeploy.
        </p>
      </div>
    </div>
  );
}
