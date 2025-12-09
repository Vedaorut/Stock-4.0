import { motion } from 'framer-motion';
import { useTelegram } from '../../hooks/useTelegram';

/**
 * PageHeader component
 *
 * @param {string} title - Page title
 * @param {Function} onBack - Callback for back button (used with useBackButton)
 * @param {ReactNode} action - Optional element for right side of header
 * @param {'back'|'close'} variant - Button type: 'back' (back arrow) or 'close' (x icon)
 */
export default function PageHeader({ title, onBack, action, variant: _variant = 'back' }) {
  const { triggerHaptic } = useTelegram();

  const _handleBack = () => {
    triggerHaptic('light');
    onBack();
  };

  return (
    <div
      className="bg-[#181818]"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 36px)',
      }}
    >
      <div className="flex items-center justify-between px-4 h-12">
        {/* Spacer for symmetry (Back button is now native-only) */}
        <div style={{ width: '40px', height: '40px' }} />

        {/* Title */}
        <h1
          className="flex-1 text-center text-lg font-bold text-white px-2"
          style={{ letterSpacing: '-0.02em', lineHeight: '1.2' }}
        >
          {title}
        </h1>

        {/* Action Button (optional) */}
        <div className="flex items-center justify-end" style={{ width: '40px', height: '40px' }}>
          {action}
        </div>
      </div>
    </div>
  );
}
