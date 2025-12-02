/**
 * SyncedBadge - Badge indicating product is synced from another shop
 */
const SyncedBadge = ({ sourceName, t }) => (
  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-400 flex items-center gap-1">
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
    {sourceName ? t('product.syncedFrom', { shop: sourceName }) : t('product.synced')}
  </span>
);

export default SyncedBadge;
