import { useState, useEffect, useMemo, useRef } from 'react';
import { FAQ_SECTIONS } from '../help/faqContent.js';

/**
 * FaqPage — internal Help & FAQ.
 *
 * Layout:
 *   Desktop: two columns — sticky TOC on left, content on right.
 *   Mobile:  TOC collapses into a "Jump to section…" dropdown above content.
 *
 * Features:
 *   - Search filters TOC and highlights matching sections in content.
 *   - Section anchors so URLs like #/faq/deal-types-explained are deep-linkable.
 *   - Scroll-spy: as the user scrolls, the TOC highlights the section they're in.
 *
 * Content lives in /src/help/faqContent.js. To edit an article: change the data
 * file, redeploy. No DB, no markdown lib.
 */
export default function FaqPage({ navigate, initialAnchor = null }) {
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState(initialAnchor || FAQ_SECTIONS[0]?.id);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const sectionRefs = useRef({});

  // Jump to initial anchor on mount or when it changes (from URL)
  useEffect(() => {
    if (initialAnchor) {
      const el = sectionRefs.current[initialAnchor];
      if (el) {
        // Defer so layout settles after first render
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
      setActiveId(initialAnchor);
    }
  }, [initialAnchor]);

  // Scroll-spy: pick the section closest to the top of the viewport
  useEffect(() => {
    const onScroll = () => {
      let bestId = FAQ_SECTIONS[0]?.id;
      let bestTop = -Infinity;
      const probeY = 140; // a little below the sticky header
      for (const s of FAQ_SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        // Section is "active" if its top has crossed the probe line.
        if (top <= probeY && top > bestTop) {
          bestTop = top;
          bestId = s.id;
        }
      }
      if (bestId !== activeId) setActiveId(bestId);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activeId]);

  // Filter sections by search (matches title, summary, or any block text)
  const filteredIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return new Set(FAQ_SECTIONS.map((s) => s.id));
    const matches = new Set();
    for (const s of FAQ_SECTIONS) {
      const haystack = [
        s.title,
        s.summary || '',
        ...s.blocks.flatMap(blockToSearchText),
      ].join(' ').toLowerCase();
      if (haystack.includes(q)) matches.add(s.id);
    }
    return matches;
  }, [search]);

  function jumpTo(id) {
    setMobileTocOpen(false);
    const el = sectionRefs.current[id];
    if (!el) return;
    // Update the hash without a full re-render via the router
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', `#/faq/${id}`);
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  }

  const visible = FAQ_SECTIONS.filter((s) => filteredIds.has(s.id));

  return (
    <div className="px-4 md:px-6 lg:px-10 py-6 md:py-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6 md:mb-8 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
          Help & FAQ
        </p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">
          Ronnoco Deal Builder Documentation
        </h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          Everything you need to know about using the application — from finding equipment in the
          catalog to submitting a deal to the leasing team. Use the table of contents or search to
          jump to a topic.
        </p>
      </div>

      <div className="grid gap-6 lg:gap-10 lg:grid-cols-[16rem_1fr]">
        {/* TOC sidebar (desktop) / collapsible header (mobile) */}
        <aside className="lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          {/* Search */}
          <div className="mb-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the docs…"
              className="w-full px-3 py-2 text-sm bg-white border border-page-200 rounded-md
                         focus:outline-none focus:ring-2 focus:ring-navy-300 focus:border-navy-300"
            />
          </div>

          {/* Mobile: toggle button. Desktop: always show list. */}
          <button
            type="button"
            onClick={() => setMobileTocOpen((v) => !v)}
            className="lg:hidden w-full flex items-center justify-between px-3 py-2 text-sm
                       bg-white border border-page-200 rounded-md font-medium text-slate-700"
            aria-expanded={mobileTocOpen}
          >
            <span>
              Jump to section
              {activeId && (
                <span className="text-slate-400 font-normal">
                  {' '}· {FAQ_SECTIONS.find((s) => s.id === activeId)?.title}
                </span>
              )}
            </span>
            <svg className={`w-4 h-4 transition-transform ${mobileTocOpen ? 'rotate-180' : ''}`}
                 fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <nav className={`${mobileTocOpen ? 'block' : 'hidden'} lg:block mt-2 lg:mt-0
                          bg-white lg:bg-transparent border lg:border-0 border-page-200 rounded-md
                          overflow-hidden`}>
            <ul className="py-1">
              {FAQ_SECTIONS.map((s) => {
                const dimmed = !filteredIds.has(s.id);
                const active = activeId === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => jumpTo(s.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-start gap-2
                        ${active
                          ? 'bg-navy-50 text-navy-900 font-medium border-l-2 border-navy-700'
                          : 'text-slate-600 hover:text-navy-900 hover:bg-page-50 border-l-2 border-transparent'}
                        ${dimmed ? 'opacity-40' : ''}`}
                      disabled={dimmed}
                    >
                      <span className="text-xs text-slate-400 font-mono mt-0.5 w-4 flex-shrink-0">
                        {s.number}.
                      </span>
                      <span className="flex-1 leading-snug">
                        {s.title}
                        {s.starred && (
                          <span className="ml-1 text-accent-500" aria-label="key article">★</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* Content */}
        <article className="min-w-0">
          {visible.length === 0 && (
            <div className="bg-white border border-page-200 rounded-lg p-8 text-center">
              <p className="text-slate-500 text-sm">
                No sections match "<span className="font-medium text-slate-700">{search}</span>".
              </p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-2 text-sm text-navy-700 hover:text-navy-900 font-medium"
              >
                Clear search
              </button>
            </div>
          )}

          {visible.map((s, idx) => (
            <section
              key={s.id}
              id={s.id}
              ref={(el) => { if (el) sectionRefs.current[s.id] = el; }}
              className={`scroll-mt-24 ${idx > 0 ? 'mt-14' : ''}`}
            >
              <header className="mb-4 pb-3 border-b border-page-200">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-sm font-mono text-slate-400">{s.number}.</span>
                  <h2 className="text-xl md:text-2xl font-light text-slate-900">
                    {s.title}
                    {s.starred && (
                      <span className="ml-2 text-accent-500" title="Key article">★</span>
                    )}
                  </h2>
                </div>
                {s.summary && (
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-3xl">{s.summary}</p>
                )}
              </header>

              <div className="space-y-3 max-w-3xl">
                {s.blocks.map((b, i) => <Block key={i} block={b} />)}
              </div>
            </section>
          ))}

          {/* Back-to-top */}
          {visible.length > 0 && (
            <div className="mt-12 pt-6 border-t border-page-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="text-sm text-navy-700 hover:text-navy-900 font-medium"
              >
                ↑ Back to top
              </button>
              <p className="text-xs text-slate-400">
                Can't find what you need? Contact your admin.
              </p>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Block renderer

function Block({ block }) {
  switch (block.type) {
    case 'p':
      return <p className="text-sm md:text-[15px] text-slate-700 leading-relaxed"><InlineText text={block.text} /></p>;

    case 'h3':
      return (
        <h3 className="text-base md:text-lg font-medium text-slate-900 mt-5 mb-1.5">
          {block.text}
        </h3>
      );

    case 'ul':
      return (
        <ul className="list-disc pl-5 space-y-1.5 text-sm md:text-[15px] text-slate-700 leading-relaxed marker:text-slate-400">
          {block.items.map((item, i) => (
            <li key={i}><InlineText text={item} /></li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol className="list-decimal pl-5 space-y-1.5 text-sm md:text-[15px] text-slate-700 leading-relaxed marker:text-slate-400">
          {block.items.map((item, i) => (
            <li key={i}><InlineText text={item} /></li>
          ))}
        </ol>
      );

    case 'callout': {
      const toneClasses = {
        info:    'bg-navy-50 border-navy-200 text-navy-900',
        warning: 'bg-amber-50 border-amber-200 text-amber-900',
        tip:     'bg-emerald-50 border-emerald-200 text-emerald-900',
      };
      const icon = { info: 'ℹ', warning: '⚠', tip: '💡' }[block.tone] || 'ℹ';
      return (
        <div className={`border-l-4 rounded-r px-4 py-3 text-sm leading-relaxed
                        ${toneClasses[block.tone] || toneClasses.info}`}>
          <span className="font-semibold mr-2" aria-hidden="true">{icon}</span>
          <InlineText text={block.text} />
        </div>
      );
    }

    case 'table':
      return (
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="bg-page-100">
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left font-medium text-slate-700 px-3 py-2 border border-page-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className={i % 2 ? 'bg-page-50' : 'bg-white'}>
                  {row.map((cell, j) => (
                    <td key={j} className="text-slate-700 px-3 py-2 border border-page-200 align-top">
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Inline formatting: **bold**, *italic*, `code`, [text](#anchor)

function InlineText({ text }) {
  if (!text) return null;
  // Tokenize: build an array of {type, content} segments.
  const segments = parseInline(String(text));
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'bold':   return <strong key={i} className="font-semibold text-slate-900">{seg.content}</strong>;
          case 'italic': return <em key={i}>{seg.content}</em>;
          case 'code':   return <code key={i} className="bg-page-100 px-1.5 py-0.5 rounded text-xs font-mono text-navy-800">{seg.content}</code>;
          case 'link':   return (
            <a key={i} href={seg.href}
               className="text-navy-700 hover:text-navy-900 underline decoration-navy-300 hover:decoration-navy-600">
              {seg.content}
            </a>
          );
          default:       return <span key={i}>{seg.content}</span>;
        }
      })}
    </>
  );
}

// Simple tokenizer — runs in a single pass over the string, recognizing the four
// markdown-lite patterns. We don't use a real markdown parser because we only
// need these four and the regex approach keeps bundle size and surface area small.
function parseInline(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    // Try each pattern in turn at the current position
    const rest = text.slice(i);

    // **bold**
    const bold = rest.match(/^\*\*([^*]+)\*\*/);
    if (bold) { out.push({ type: 'bold', content: bold[1] }); i += bold[0].length; continue; }

    // `code`
    const code = rest.match(/^`([^`]+)`/);
    if (code) { out.push({ type: 'code', content: code[1] }); i += code[0].length; continue; }

    // [text](#anchor) — only support hash anchors (internal links)
    const link = rest.match(/^\[([^\]]+)\]\((#[^)]+)\)/);
    if (link) {
      // Convert plain #anchor → router-friendly #/faq/anchor
      const anchor = link[2].slice(1);
      const href = `#/faq/${anchor}`;
      out.push({ type: 'link', content: link[1], href });
      i += link[0].length;
      continue;
    }

    // *italic* — must not be ** (handled above), and must not match an empty *
    const italic = rest.match(/^\*([^*\s][^*]*)\*/);
    if (italic) { out.push({ type: 'italic', content: italic[1] }); i += italic[0].length; continue; }

    // No match — gather literal characters until the next potential marker
    const nextMarker = rest.search(/[*`\[]/);
    if (nextMarker === -1) {
      out.push({ type: 'text', content: rest });
      break;
    }
    if (nextMarker === 0) {
      // The marker didn't match a pattern (e.g. a lone '*' or '['); pass it through literally
      out.push({ type: 'text', content: rest[0] });
      i += 1;
    } else {
      out.push({ type: 'text', content: rest.slice(0, nextMarker) });
      i += nextMarker;
    }
  }
  return out;
}

// Flatten a content block into the strings we search over
function blockToSearchText(block) {
  if (block.type === 'p' || block.type === 'h3' || block.type === 'callout') return [block.text || ''];
  if (block.type === 'ul' || block.type === 'ol') return block.items || [];
  if (block.type === 'table') {
    return [
      ...(block.headers || []),
      ...((block.rows || []).flat()),
    ];
  }
  return [];
}
