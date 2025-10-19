import { useState } from 'react';
import { motion } from 'framer-motion';
import Header from '../components/Layout/Header';
import { useTelegram } from '../hooks/useTelegram';
import { useStore } from '../store/useStore';
import { useTranslation } from '../i18n/useTranslation';
import WalletsModal from '../components/Settings/WalletsModal';
import OrdersModal from '../components/Settings/OrdersModal';
import LanguageModal from '../components/Settings/LanguageModal';

const getSettingsSections = (t, lang) => {
  const languageNames = { 'ru': 'Русский', 'en': 'English' };

  return [
    {
      title: t('settings.title'),
      items: [
        {
          id: 'wallet',
          label: t('settings.myWallet'),
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          ),
        },
        {
          id: 'orders',
          label: t('settings.myOrders'),
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          ),
        },
        {
          id: 'language',
          label: t('settings.language'),
          icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          ),
          value: languageNames[lang] || 'Русский',
        },
      ],
    },
  ];
};

export default function Settings() {
  const { user, triggerHaptic } = useTelegram();
  const { clearCart } = useStore();
  const { t, lang } = useTranslation();
  const [showWallets, setShowWallets] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [showLanguage, setShowLanguage] = useState(false);

  const settingsSections = getSettingsSections(t, lang);

  const handleSettingClick = (itemId) => {
    triggerHaptic('light');

    switch (itemId) {
      case 'wallet':
        setShowWallets(true);
        break;
      case 'orders':
        setShowOrders(true);
        break;
      case 'language':
        setShowLanguage(true);
        break;
      default:
        console.log('Setting clicked:', itemId);
    }
  };

  return (
    <div className="min-h-screen pb-24 pt-20">
      <Header title={t('settings.title')} />

      <div className="px-4 py-6">
        {/* User Card */}
        {user && (
          <motion.div
            className="glass-card rounded-2xl p-6 mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-orange-primary flex items-center justify-center text-white text-2xl font-bold">
                {user.first_name?.[0] || 'U'}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white mb-1">
                  {user.first_name} {user.last_name}
                </h2>
                {user.username && (
                  <p className="text-sm text-gray-400">@{user.username}</p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingsSections.map((section, sectionIndex) => (
            <motion.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: sectionIndex * 0.1 }}
            >
              <h3 className="text-sm font-semibold text-gray-400 mb-3 px-2">
                {section.title}
              </h3>
              <div className="glass-card rounded-2xl overflow-hidden">
                {section.items.map((item, index) => (
                  <motion.button
                    key={item.id}
                    onClick={() => handleSettingClick(item.id)}
                    className={`w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-white/5 ${
                      index !== section.items.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="text-gray-400">{item.icon}</div>
                    <span className="flex-1 text-white font-medium">{item.label}</span>
                    {item.value && (
                      <span className="text-gray-400 text-sm">{item.value}</span>
                    )}
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* App Version */}
        <div className="text-center mt-8">
          <p className="text-xs text-gray-500">{t('settings.version')} 1.0.0</p>
        </div>
      </div>

      {/* Modals */}
      <WalletsModal isOpen={showWallets} onClose={() => setShowWallets(false)} />
      <OrdersModal isOpen={showOrders} onClose={() => setShowOrders(false)} />
      <LanguageModal isOpen={showLanguage} onClose={() => setShowLanguage(false)} />
    </div>
  );
}
