import { motion } from 'framer-motion';

const controlSpring = { type: 'spring', stiffness: 500, damping: 35 };

export default function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex gap-1 p-1.5 bg-black/20 rounded-2xl mb-6 border border-white/5 backdrop-blur-sm">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors z-10 ${
              isActive ? 'text-white' : 'text-white/40 hover:text-white/60'
            }`}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {isActive && (
              <motion.div
                layoutId="activeTabBackground"
                className="absolute inset-0 bg-white/10 rounded-xl border border-white/5 shadow-sm"
                transition={controlSpring}
                style={{ zIndex: -1 }}
              />
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}