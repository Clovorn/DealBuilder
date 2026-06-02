import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const SECTION_CONFIG = {
  promotion: {
    label: 'Promotions',
    accent: 'border-l-accent-500',
    badgeBg: 'bg-accent-500/10',
    badgeText: 'text-accent-600',
  },
  special_deal: {
    label: 'Special Deals',
    accent: 'border-l-navy-500',
    badgeBg: 'bg-navy-500/10',
    badgeText: 'text-navy-700',
  },
  news: {
    label: 'Latest News',
    accent: 'border-l-slate-400',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-600',
  },
};

export default function AnnouncementsStrip() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('v_active_announcements')
      .select('*')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Failed to load announcements:', error);
        } else {
          setItems(data || []);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading || items.length === 0) return null;

  const grouped = {
    promotion:    items.filter((a) => a.type === 'promotion'),
    special_deal: items.filter((a) => a.type === 'special_deal'),
    news:         items.filter((a) => a.type === 'news'),
  };

  return (
    <section className="bg-white border-b border-page-200">
      <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <h2 className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium">
            What's new
          </h2>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="md:hidden text-xs text-navy-700 hover:text-navy-900 font-medium"
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>

        {!collapsed && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {Object.keys(SECTION_CONFIG).map((type) => (
              <AnnouncementColumn
                key={type}
                type={type}
                items={grouped[type]}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AnnouncementColumn({ type, items }) {
  const cfg = SECTION_CONFIG[type];
  if (items.length === 0) {
    return (
      <div>
        <SectionLabel cfg={cfg} />
        <div className="text-xs text-slate-400 italic">No items yet.</div>
      </div>
    );
  }
  return (
    <div>
      <SectionLabel cfg={cfg} count={items.length} />
      <div className="space-y-2">
        {items.slice(0, 3).map((a) => (
          <AnnouncementCard key={a.id} item={a} cfg={cfg} />
        ))}
        {items.length > 3 && (
          <div className="text-xs text-slate-500 pt-1">
            + {items.length - 3} more
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ cfg, count }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span
        className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase
                    tracking-wider font-bold ${cfg.badgeBg} ${cfg.badgeText}`}
      >
        {cfg.label}
      </span>
      {count != null && (
        <span className="text-xs text-slate-400">{count}</span>
      )}
    </div>
  );
}

function AnnouncementCard({ item, cfg }) {
  return (
    <article
      className={`bg-white border border-page-200 rounded-md p-3 hover:border-page-300
                  transition-colors ${cfg.accent} border-l-2`}
    >
      <h3 className="text-sm font-medium text-slate-900 leading-snug mb-1">
        {item.title}
      </h3>
      {item.summary && (
        <p className="text-xs text-slate-600 leading-relaxed">{item.summary}</p>
      )}
      {item.link_url && (
        <a
          href={item.link_url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-block mt-2 text-xs text-navy-700 hover:text-navy-900 font-medium"
        >
          Learn more →
        </a>
      )}
    </article>
  );
}
