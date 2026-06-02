/**
 * VendorLogoButton — clickable card for a featured vendor on the home page.
 *
 * Falls back to a clean text wordmark if no logo URL is set yet, so the home
 * page looks complete from day one and improves visually as logos are uploaded.
 */
export default function VendorLogoButton({ vendor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group bg-white border border-page-200 rounded-lg p-4 md:p-5
                 hover:border-navy-300 hover:shadow-card active:bg-navy-50
                 transition-all flex flex-col items-center justify-center
                 min-h-[120px] md:min-h-[140px] w-full"
      aria-label={`View ${vendor.display_name} products`}
    >
      <div className="flex-1 flex items-center justify-center w-full">
        {vendor.logo_url ? (
          <img
            src={vendor.logo_url}
            alt={vendor.display_name}
            className="max-h-12 md:max-h-16 max-w-full object-contain"
          />
        ) : (
          <span className="text-xl md:text-2xl font-black text-navy-900 tracking-tight text-center"
                style={{ letterSpacing: '-0.02em' }}>
            {vendor.display_name}
          </span>
        )}
      </div>
      <div className="text-[10px] md:text-xs uppercase tracking-wider text-slate-500 mt-2
                      group-hover:text-navy-700 transition-colors font-medium">
        {vendor.product_count} {vendor.product_count === 1 ? 'product' : 'products'}
      </div>
    </button>
  );
}
