/**
 * RonnocoLogo — shows the company brand mark.
 *
 * Drop-in logo strategy:
 *   1. If you've uploaded a logo file to the public Supabase Storage bucket
 *      named 'brand', set VITE_LOGO_URL to its public URL in Netlify env vars.
 *      Example: VITE_LOGO_URL=https://gmttcwimwvdupqnxbiaq.supabase.co/storage/v1/object/public/brand/ronnoco-logo.svg
 *   2. Otherwise, this falls back to a clean wordmark rendered in CSS.
 *
 * The wordmark is intentionally simple — a placeholder, not a competing brand.
 * Replace by setting VITE_LOGO_URL and redeploying.
 */
export default function RonnocoLogo({ variant = 'on-dark', className = '' }) {
  const customUrl = import.meta.env.VITE_LOGO_URL;

  if (customUrl) {
    return (
      <img
        src={customUrl}
        alt="Ronnoco"
        className={`h-8 w-auto ${className}`}
      />
    );
  }

  // Wordmark fallback. Two variants tuned for dark vs. light backgrounds.
  const textColor =
    variant === 'on-dark' ? 'text-chalk-50' : 'text-navy-900';
  const accentColor =
    variant === 'on-dark' ? 'text-accent-500' : 'text-accent-600';

  return (
    <div className={`flex items-baseline gap-1 ${className}`}>
      <span
        className={`font-black tracking-tight text-2xl leading-none ${textColor}`}
        style={{ letterSpacing: '-0.02em' }}
      >
        RONNOCO
      </span>
      <span className={`text-2xl leading-none ${accentColor}`}>•</span>
    </div>
  );
}
