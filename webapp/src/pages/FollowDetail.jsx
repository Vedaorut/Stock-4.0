import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Layout/Header';
import ActionsList from '../components/Follows/ActionsList';
import ConfirmDialog from '../components/Follows/ConfirmDialog';
import MarkupSliderModal from '../components/Follows/MarkupSliderModal';
import { useFollowsApi } from '../hooks/useApi';
import { useStore } from '../store/useStore';
import { useTelegram } from '../hooks/useTelegram';
import { useBackButton } from '../hooks/useBackButton';

export default function FollowDetail() {
  const followDetailId = useStore((state) => state.followDetailId);
  const { getDetail, updateMarkup, switchMode, deleteFollow } = useFollowsApi();
  const { triggerHaptic } = useTelegram();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [follow, setFollow] = useState(null);

  // Modal states
  const [isMarkupModalOpen, setIsMarkupModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSwitchModeDialogOpen, setIsSwitchModeDialogOpen] = useState(false);

  // Back button handler
  const handleBack = useCallback(() => {
    triggerHaptic('light');
    useStore.getState().setFollowDetailId(null);
  }, [triggerHaptic]);

  // Telegram BackButton integration
  useBackButton(handleBack);

  // Load follow data
  const loadFollow = useCallback(
    async (signal) => {
      if (!followDetailId) return { status: 'error', error: 'No follow ID' };

      const response = await getDetail(followDetailId, { signal });

      if (signal?.aborted) return { status: 'aborted' };

      if (response.error) {
        console.error('[FollowDetail] Error loading follow:', response.error);
        return { status: 'error', error: 'Failed to load subscription' };
      }

      const followData = response.data?.data || response.data;
      setFollow(followData);
      return { status: 'success' };
    },
    [followDetailId, getDetail]
  );

  useEffect(() => {
    if (!followDetailId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    loadFollow(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted && result?.status === 'error') {
          setError(result.error);
          setFollow(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [followDetailId, loadFollow]);

  // Handle markup update
  const handleUpdateMarkup = useCallback(
    async (markupData) => {
      if (!followDetailId || !follow) return;

      triggerHaptic('medium');

      try {
        await updateMarkup(followDetailId, markupData);

        // Update local state
        setFollow((prev) => ({
          ...prev,
          markup_type: markupData.markupType,
          markup_percentage: markupData.markupPercentage,
          markup_fixed: markupData.markupFixed,
        }));

        triggerHaptic('success');
      } catch (err) {
        console.error('[FollowDetail] Error updating markup:', err);
        triggerHaptic('error');
      }
    },
    [followDetailId, follow, updateMarkup, triggerHaptic]
  );

  // Handle mode switch
  const handleSwitchMode = useCallback(async () => {
    if (!followDetailId || !follow) return;

    const newMode = follow.mode === 'monitor' ? 'resell' : 'monitor';

    triggerHaptic('medium');

    try {
      await switchMode(followDetailId, newMode);

      // Update local state
      setFollow((prev) => ({
        ...prev,
        mode: newMode,
      }));

      triggerHaptic('success');
    } catch (err) {
      console.error('[FollowDetail] Error switching mode:', err);
      triggerHaptic('error');
    }
  }, [followDetailId, follow, switchMode, triggerHaptic]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!followDetailId) return;

    triggerHaptic('medium');

    try {
      await deleteFollow(followDetailId);
      triggerHaptic('success');

      // Navigate back to follows list
      useStore.getState().setFollowDetailId(null);
    } catch (err) {
      console.error('[FollowDetail] Error deleting follow:', err);
      triggerHaptic('error');
    }
  }, [followDetailId, deleteFollow, triggerHaptic]);

  // Get display values
  const shopName = follow?.source_shop_name || follow?.shop_name || 'Loading...';
  const mode = follow?.mode || 'monitor';
  const markupType = follow?.markup_type || 'percentage';
  const markupPercentage = follow?.markup_percentage ?? 25;
  const markupFixed = follow?.markup_fixed ?? 0;

  // Compute display markup for ActionsList
  const displayMarkup = markupType === 'percentage' ? markupPercentage : markupFixed;

  return (
    <div
      className="h-screen overflow-y-auto"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 56px)',
        paddingBottom: 'calc(var(--tabbar-total) + 20px)',
      }}
    >
      <Header title={shopName} />

      <div className="px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-orange-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-16 h-16 text-red-500 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-400 mb-2">{error}</h3>
            <motion.button
              onClick={() => loadFollow()}
              className="touch-target bg-orange-primary hover:bg-orange-light text-white font-semibold px-6 rounded-xl transition-colors duration-300 mt-4"
              whileTap={{ scale: 0.95 }}
            >
              Try again
            </motion.button>
          </div>
        ) : follow ? (
          <>
            {/* Shop Info Card */}
            <motion.div
              className="glass-card rounded-2xl p-4 border border-white/10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <div className="flex items-center gap-4">
                {/* Shop Avatar */}
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-primary/20 to-orange-light/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-orange-primary">
                    {shopName.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Shop Info */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-semibold text-lg truncate">{shopName}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        mode === 'resell'
                          ? 'bg-orange-primary/20 text-orange-primary'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {mode === 'resell' ? 'Resale' : 'Monitoring'}
                    </span>
                    {mode === 'resell' && (
                      <span className="text-gray-400 text-xs">
                        +{markupType === 'percentage' ? `${markupPercentage}%` : `$${markupFixed}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
                <div className="text-center">
                  <div className="text-white font-semibold">{follow.products_count || 0}</div>
                  <div className="text-gray-400 text-xs">Products</div>
                </div>
                <div className="text-center">
                  <div className="text-white font-semibold">
                    {new Date(follow.created_at).toLocaleDateString()}
                  </div>
                  <div className="text-gray-400 text-xs">Since</div>
                </div>
              </div>
            </motion.div>

            {/* Actions List */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <ActionsList
                mode={mode}
                markup={displayMarkup}
                onEditMarkup={() => {
                  triggerHaptic('light');
                  setIsMarkupModalOpen(true);
                }}
                onSwitchMode={() => {
                  triggerHaptic('light');
                  setIsSwitchModeDialogOpen(true);
                }}
                onDelete={() => {
                  triggerHaptic('light');
                  setIsDeleteDialogOpen(true);
                }}
              />
            </motion.div>
          </>
        ) : null}
      </div>

      {/* Markup Modal */}
      <MarkupSliderModal
        isOpen={isMarkupModalOpen}
        onClose={() => setIsMarkupModalOpen(false)}
        onConfirm={handleUpdateMarkup}
        currentMarkup={markupPercentage}
        currentMarkupType={markupType}
        currentMarkupFixed={markupFixed}
      />

      {/* Switch Mode Confirm Dialog */}
      <ConfirmDialog
        isOpen={isSwitchModeDialogOpen}
        onClose={() => setIsSwitchModeDialogOpen(false)}
        onConfirm={handleSwitchMode}
        title="Switch Mode"
        message={
          mode === 'monitor'
            ? 'Switch to Resale mode? Products from this shop will be added to your catalog with your markup.'
            : 'Switch to Monitoring mode? Products will only be tracked but not added to your catalog.'
        }
        confirmText="Switch"
        cancelText="Cancel"
      />

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Delete Subscription"
        message="Are you sure you want to delete this subscription? All synced products will be removed from your catalog. This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </div>
  );
}
