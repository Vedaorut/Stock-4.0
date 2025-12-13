import { motion, AnimatePresence } from 'framer-motion';
import { Fragment } from 'react';
import {
    BuildingStorefrontIcon,
    EyeIcon,
    ArrowRightIcon,
    TrashIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { useTranslation } from '../../i18n/useTranslation';

export default function ManageSubscriptionModal({ isOpen, onClose, subscription, onStartMonitoring, onOpenCatalog, onUnsubscribe }) {
    const { t } = useTranslation();

    if (!isOpen || !subscription) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <Fragment>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal Sheet */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-[#1C1C1E] rounded-t-[32px] overflow-hidden border-t border-white/10"
                        style={{ maxHeight: '90vh' }}
                    >
                        {/* Handle Bar */}
                        <div className="flex justify-center pt-3 pb-2" onClick={onClose}>
                            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
                        </div>

                        <div className="px-6 pb-10 pt-2">
                            {/* Header */}
                            <div className="flex items-start justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-2xl bg-[#2C2C2E] flex items-center justify-center border border-white/5 shadow-inner">
                                        {subscription.shop_logo ? (
                                            <img src={subscription.shop_logo} alt={subscription.shop_name} className="w-full h-full object-cover rounded-2xl" />
                                        ) : (
                                            <BuildingStorefrontIcon className="w-8 h-8 text-white/40" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-white mb-1">{subscription.shop_name}</h2>
                                        <div className="flex items-center gap-2">
                                            <span className="bg-[#2ECC71]/10 text-[#2ECC71] text-xs font-bold px-2 py-0.5 rounded-md border border-[#2ECC71]/20">
                                                {t('shop.subscribed')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                                >
                                    <XMarkIcon className="w-6 h-6 text-white/60" />
                                </button>
                            </div>

                            {/* Actions Grid */}
                            <div className="space-y-3">
                                {/* Primary: Start Monitoring */}
                                <button
                                    onClick={onStartMonitoring}
                                    className="w-full group relative overflow-hidden rounded-2xl bg-[#FF6B00] p-4 text-left transition-transform active:scale-[0.98]"
                                >
                                    <div className="relative z-10 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2.5 bg-black/20 rounded-xl">
                                                <EyeIcon className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-white">
                                                    {t('follows.startMonitoring')}
                                                </h3>
                                                <p className="text-white/80 text-sm font-medium">
                                                    Track prices & stock
                                                </p>
                                            </div>
                                        </div>
                                        <ArrowRightIcon className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                    {/* Decor */}
                                    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 blur-xl rounded-full" />
                                </button>

                                {/* Secondary: Open Catalog */}
                                <button
                                    onClick={onOpenCatalog}
                                    className="w-full group relative overflow-hidden rounded-2xl bg-[#2C2C2E] border border-white/5 p-4 text-left transition-transform active:scale-[0.98]"
                                >
                                    <div className="relative z-10 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2.5 bg-white/5 rounded-xl group-hover:bg-white/10 transition-colors">
                                                <BuildingStorefrontIcon className="w-6 h-6 text-white" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-white">
                                                    {t('follows.openCatalog')}
                                                </h3>
                                                <p className="text-white/50 text-sm">
                                                    Browse products
                                                </p>
                                            </div>
                                        </div>
                                        <ArrowRightIcon className="w-5 h-5 text-white/30 group-hover:text-white transition-colors" />
                                    </div>
                                </button>

                                {/* Danger: Unsubscribe */}
                                <button
                                    onClick={onUnsubscribe}
                                    className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl text-red-500 font-medium hover:bg-red-500/10 transition-colors active:scale-[0.98]"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                    {t('subscriptions.unsubscribe')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </Fragment>
            )}
        </AnimatePresence>
    );
}
