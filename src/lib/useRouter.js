import { useEffect, useState, useCallback } from 'react';

/**
 * Lightweight hash-based router.
 *
 * Why hash routing: works on Netlify with no extra config (no SPA-redirect file
 * mapping every path to index.html — the hash never hits the server). Also keeps
 * the rest of the app simple — no react-router dependency, no provider.
 *
 * Routes are just strings after the '#'. We expose them as:
 *   parseRoute('#/vendor/bunn')  => { name: 'vendor', params: { slug: 'bunn' } }
 *   parseRoute('')               => { name: 'home', params: {} }
 *
 * Pattern table is small enough to keep inline; if it grows past ~10 routes
 * we'd switch to a real route matcher.
 */
function parseRoute(hash) {
  // Strip leading "#" and any leading "/" so "#/vendor/bunn" and "#vendor/bunn" both work
  const stripped = (hash || '').replace(/^#\/?/, '');
  if (!stripped) return { name: 'home', params: {} };

  // Pull out any query string within the hash (e.g. "quote/Q-2026-0001?t=abc")
  // Hash routing means "?" appears inside the hash and isn't a real URL query,
  // so we parse it ourselves.
  const [pathOnly, queryStr] = stripped.split('?');
  const query = new URLSearchParams(queryStr || '');

  const parts = pathOnly.split('/').filter(Boolean);
  const [first, second] = parts;

  switch (first) {
    case 'home':       return { name: 'home',       params: {} };
    case 'catalog':    return { name: 'catalog',    params: {} };
    case 'bundles':    return { name: 'bundles',    params: {} };
    case 'bundles-guide': return { name: 'bundles-guide', params: {} };
    case 'sell-sheet': return { name: 'sell-sheet', params: {} };
    case 'favorites':  return { name: 'favorites',  params: {} };
    // Deal sheet — optional ?draft=<uuid> hydrates an in-progress draft,
    // optional ?edit=<uuid> hydrates a previously-sent quote for re-sending,
    // optional ?bundle=<uuid> starts the deal in bundle mode (v27).
    // The three are mutually exclusive in practice; if more than one is present,
    // edit > draft > bundle in priority order.
    case 'deal':       return { name: 'deal',       params: {
                                  draftId:     query.get('draft')  || null,
                                  editQuoteId: query.get('edit')   || null,
                                  bundleId:    query.get('bundle') || null,
                                  // leadData is never serialised into the URL — it is
                                  // passed via the navigate() call in-memory only and
                                  // will be null when the page is parsed from the hash.
                                  leadData:    null,
                                } };
    case 'my-deals':   return { name: 'my-deals',   params: {} };   // rep's own drafts + submissions
    case 'my-team':    return { name: 'my-team',    params: {} };   // director's approval queue (v31)
    case 'profile':    return { name: 'profile',    params: {} };   // user's own profile editor
    case 'faq':        return { name: 'faq',        params: { anchor: second || null } };
    case 'vendor':     return { name: 'vendor',     params: { slug: second || null } };
    case 'vendors':    return { name: 'vendors',    params: {} }; // full list
    case 'admin':      return { name: 'admin',      params: { section: second || null } };
    // Public customer-facing quote view — no auth, accessed via emailed link.
    // URL shape: #/quote/Q-2026-0001?t=<token>
    case 'quote':      return { name: 'quote',      params: { quoteNumber: second || null, token: query.get('t') } };
    default:           return { name: 'not-found',  params: { path: stripped } };
  }
}

/**
 * Build a URL from a route name + params. Used for navigation.
 */
export function routeToHash(name, params = {}) {
  switch (name) {
    case 'home':       return '#/home';
    case 'catalog':    return '#/catalog';
    case 'bundles':    return '#/bundles';
    case 'bundles-guide': return '#/bundles-guide';
    case 'sell-sheet': return '#/sell-sheet';
    case 'favorites':  return '#/favorites';
    case 'deal':       {
      // edit > draft > bundle in priority (can't combine)
      if (params.editQuoteId) return `#/deal?edit=${params.editQuoteId}`;
      if (params.draftId)     return `#/deal?draft=${params.draftId}`;
      if (params.bundleId)    return `#/deal?bundle=${params.bundleId}`;
      return '#/deal';
    }
    case 'my-deals':   return '#/my-deals';
    case 'my-team':    return '#/my-team';
    case 'profile':    return '#/profile';
    case 'faq':        return params.anchor ? `#/faq/${params.anchor}` : '#/faq';
    case 'vendors':    return '#/vendors';
    case 'vendor':     return `#/vendor/${params.slug || ''}`;
    case 'admin':      return params.section ? `#/admin/${params.section}` : '#/admin';
    case 'quote':      return params.token
                              ? `#/quote/${params.quoteNumber}?t=${params.token}`
                              : `#/quote/${params.quoteNumber || ''}`;
    default:           return '#/home';
  }
}

/**
 * React hook returning the current route and a navigate function.
 * Components don't need to know about window.location; they just call
 * navigate('vendor', { slug: 'bunn' }).
 */
export function useRouter() {
  const [route, setRoute] = useState(() =>
    typeof window !== 'undefined' ? parseRoute(window.location.hash) : { name: 'home', params: {} }
  );

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((name, params) => {
    const target = routeToHash(name, params);
    // leadData (and any other in-memory-only params) must be preserved when
    // setting the route state directly, since they are never serialised into
    // the URL hash and would be lost if we only relied on parseRoute().
    const parsed = parseRoute(target);
    if (params?.leadData) parsed.params.leadData = params.leadData;
    if (window.location.hash !== target) {
      // Setting the hash fires hashchange which calls setRoute via the
      // listener — but that listener calls parseRoute which loses leadData.
      // So we set the route state directly here first, then update the hash.
      setRoute(parsed);
      window.location.hash = target;
    } else {
      // Re-fire even on same-route navigation so click-on-active-tab feels responsive
      setRoute(parsed);
    }
  }, []);

  return { route, navigate };
}
