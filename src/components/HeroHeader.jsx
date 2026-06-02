/**
 * HeroHeader — top-of-home hero banner.
 *
 * Two rendering modes:
 *   1. With image: full-bleed photo with a darkening overlay (configurable
 *      via hero_overlay 0-100) so the headline stays readable on any photo.
 *   2. Without image: navy gradient band with a soft brand mark on the right.
 *
 * Either mode renders edge-to-edge (full width of the page area) and is
 * skipped entirely if hero_enabled is false.
 */
export default function HeroHeader({ settings }) {
  if (!settings || !settings.hero_enabled) return null;

  const hasHeadline = !!(settings.hero_headline?.trim());
  const hasSubhead  = !!(settings.hero_subhead?.trim());
  const hasImage    = !!(settings.hero_image_url?.trim());
  const overlayPct  = typeof settings.hero_overlay === 'number' ? settings.hero_overlay : 40;

  // Overlay translates from 0-100 to an rgba alpha 0.0-0.85 (capped so we
  // never go to fully solid — there's always some image showing through).
  const overlayAlpha = (Math.max(0, Math.min(100, overlayPct)) / 100) * 0.85;

  if (hasImage) {
    return (
      <section className="relative overflow-hidden bg-navy-900">
        {/* Image layer */}
        <img
          src={settings.hero_image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          aria-hidden="true"
        />
        {/* Dark overlay for text legibility, plus a left-side gradient so
            the text area stays high-contrast even on busy photos. */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg,
              rgba(10, 31, 61, ${Math.min(overlayAlpha + 0.15, 0.95)}) 0%,
              rgba(10, 31, 61, ${overlayAlpha}) 50%,
              rgba(10, 31, 61, ${Math.max(overlayAlpha - 0.15, 0)}) 100%)`,
          }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative px-4 md:px-6 lg:px-10 py-10 md:py-16 lg:py-20 max-w-4xl">
          {hasHeadline && (
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-light text-chalk-50 leading-tight mb-3 md:mb-4">
              {settings.hero_headline}
            </h1>
          )}
          {hasSubhead && (
            <p className="text-sm md:text-lg text-chalk-200 leading-relaxed max-w-2xl">
              {settings.hero_subhead}
            </p>
          )}
        </div>
      </section>
    );
  }

  // Fallback: no image. Navy band with text and a subtle right-side mark.
  return (
    <section className="relative overflow-hidden bg-navy-900 text-chalk-50">
      <div className="absolute -right-20 -bottom-20 w-[28rem] h-[28rem] rounded-full bg-navy-700 opacity-40 blur-3xl" aria-hidden="true" />
      <div className="absolute right-1/4 top-1/3 w-1.5 h-1.5 rounded-full bg-accent-500" aria-hidden="true" />

      <div className="relative px-4 md:px-6 lg:px-10 py-8 md:py-14 lg:py-16 max-w-4xl">
        {hasHeadline && (
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-light text-chalk-50 leading-tight mb-3 md:mb-4">
            {settings.hero_headline}
          </h1>
        )}
        {hasSubhead && (
          <p className="text-sm md:text-lg text-chalk-200 leading-relaxed max-w-2xl">
            {settings.hero_subhead}
          </p>
        )}
      </div>
    </section>
  );
}
