import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useVendors } from '../lib/useVendors.js';
import { useSiteSettings } from '../lib/useSiteSettings.js';
import VendorLogoButton from './VendorLogoButton.jsx';
import HeroHeader from './HeroHeader.jsx';

const SECTION_CONFIG = {
  promotion:    { label: "What's New",       accent: 'border-l-accent-500', badge: 'bg-accent-500/10 text-accent-700' },
  special_deal: { label: 'Special Deals',    accent: 'border-l-navy-500',   badge: 'bg-navy-500/10 text-navy-700' },
  news:         { label: 'Latest News',      accent: 'border-l-slate-400',  badge: 'bg-slate-100 text-slate-700' },
};

export default function Home({ navigate, profile }) {
  const [announcements, setAnnouncements] = useState([]);
  const [annLoading, setAnnLoading] = useState(true);
  const vendors = useVendors();
  const { settings: siteSettings } = useSiteSettings();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('v_active_announcements')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setAnnouncements(data || []);
        setAnnLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const grouped = {
    promotion:    announcements.filter((a) => a.type === 'promotion'),
    special_deal: announcements.filter((a) => a.type === 'special_deal'),
    news:         announcements.filter((a) => a.type === 'news'),
  };

  const greetingName = profile?.display_name?.split(' ')?.[0] || null;

  return (
    <>
      {/* Full-bleed hero — only renders if hero_enabled in site_settings */}
      <HeroHeader settings={siteSettings} />

      <div className="px-4 md:px-6 lg:px-10 py-6 md:py-8">
        {/* Welcome row — small now that the hero handles the headline impact */}
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h2 className="text-xl md:text-2xl font-light text-slate-900">
            {greetingName ? `Welcome back, ${greetingName}.` : 'Welcome back.'}
          </h2>
        </div>

      {/* Announcements grid: three sections side by side on desktop, stacked on mobile */}
      {!annLoading && announcements.length > 0 && (
        <section className="mb-10 md:mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {Object.keys(SECTION_CONFIG).map((type) => (
              <AnnouncementSection
                key={type}
                type={type}
                items={grouped[type]}
                cfg={SECTION_CONFIG[type]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Featured vendors */}
      <section className="mb-10 md:mb-12">
        <div className="flex items-end justify-between gap-3 mb-4">
          <h2 className="text-lg md:text-xl font-light text-slate-900">
            Browse by vendor
          </h2>
          {vendors.all.length > vendors.featured.length && (
            <button
              onClick={() => navigate('vendors')}
              className="text-sm text-navy-700 hover:text-navy-900 font-medium"
            >
              All vendors ({vendors.all.length}) →
            </button>
          )}
        </div>

        {vendors.loading && (
          <div className="py-12 text-center text-slate-500 text-sm">Loading vendors…</div>
        )}

        {!vendors.loading && vendors.featured.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
            {vendors.featured.map((v) => (
              <VendorLogoButton
                key={v.id}
                vendor={v}
                onClick={() => navigate('vendor', { slug: v.slug })}
              />
            ))}
          </div>
        )}

        {!vendors.loading && vendors.featured.length === 0 && (
          <div className="bg-white border border-page-200 rounded-lg p-8 text-center">
            <p className="text-sm text-slate-500 mb-3">No featured vendors set up yet.</p>
            <button
              onClick={() => navigate('vendors')}
              className="text-sm text-navy-700 hover:text-navy-900 font-medium"
            >
              See all vendors →
            </button>
          </div>
        )}
      </section>

      {/* Quick links */}
      <section>
        <h2 className="text-lg md:text-xl font-light text-slate-900 mb-4">
          Quick links
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <QuickLink
            title="New deal"
            description="Build a deal sheet — equipment, customer, distribution."
            onClick={() => navigate('deal')}
            icon={DealIcon}
            emphasized
          />
          <QuickLink
            title="Full catalog"
            description="Search 259 items by SKU, model, vendor, or category."
            onClick={() => navigate('catalog')}
            icon={CatalogIcon}
          />
          <QuickLink
            title="Bundles"
            description="Packaged equipment programs with lease and purchase pricing."
            onClick={() => navigate('bundles')}
            icon={BundlesIcon}
          />
          <QuickLink
            title="Sell Sheet"
            description="Customer-ready overview of Ronnoco programs, service, and marketing."
            onClick={() => navigate('sell-sheet')}
            icon={DocumentIcon}
          />
          <QuickLink
            title="My favorites"
            description="Quick access to items you've starred."
            onClick={() => navigate('favorites')}
            icon={StarIcon}
          />
        </div>
      </section>
      </div>
    </>
  );
}

function AnnouncementSection({ type, items, cfg }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase
                          tracking-wider font-bold ${cfg.badge}`}>
          {cfg.label}
        </span>
        {items.length > 0 && (
          <span className="text-xs text-slate-400">{items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-slate-400 italic">No items right now.</div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 4).map((a) => (
            <AnnouncementCard key={a.id} item={a} accent={cfg.accent} />
          ))}
          {items.length > 4 && (
            <div className="text-xs text-slate-500 pt-1">+ {items.length - 4} more</div>
          )}
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({ item, accent }) {
  return (
    <article className={`bg-white border border-page-200 ${accent} border-l-2
                         rounded-md p-3 md:p-4 hover:border-page-300 transition-colors`}>
      <h3 className="text-sm font-medium text-slate-900 leading-snug mb-1">{item.title}</h3>
      {item.summary && (
        <p className="text-xs md:text-sm text-slate-600 leading-relaxed">{item.summary}</p>
      )}
      {item.link_url && (
        <a href={item.link_url} target="_blank" rel="noreferrer noopener"
           className="inline-block mt-2 text-xs text-navy-700 hover:text-navy-900 font-medium">
          Learn more →
        </a>
      )}
    </article>
  );
}

function QuickLink({ title, description, onClick, icon: Icon, emphasized = false }) {
  return (
    <button onClick={onClick}
            className={`text-left rounded-lg p-4 md:p-5 transition-all
                       ${emphasized
                         ? 'bg-navy-900 text-chalk-50 border border-navy-900 hover:bg-navy-800 active:bg-navy-950 shadow-card'
                         : 'bg-white border border-page-200 hover:border-navy-300 hover:shadow-card active:bg-navy-50'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
                         ${emphasized
                           ? 'bg-white/15 text-chalk-50'
                           : 'bg-navy-900 text-chalk-50'}`}>
          <Icon />
        </div>
        <div className="min-w-0">
          <h3 className={`text-sm font-medium mb-0.5 ${emphasized ? 'text-chalk-50' : 'text-slate-900'}`}>{title}</h3>
          <p className={`text-xs leading-relaxed ${emphasized ? 'text-chalk-200' : 'text-slate-600'}`}>{description}</p>
        </div>
      </div>
    </button>
  );
}

function CatalogIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function BundlesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}
function DealIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M9 13l2 2 4-4" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M8 13h8M8 17h6M8 9h2" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  );
}
