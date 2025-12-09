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
  const variant = _variant === 'close' ? 'close' : 'back';
  const isClose = variant === 'close';

  const _handleBack = () => {
    triggerHaptic('light');
    onBack?.();
  };

  const iconPath = isClose ? 'M6 18L18 6M6 6l12 12' : 'M15 19l-7-7 7-7';
  const ariaLabel = isClose ? 'Close' : 'Go back';

  return (
    <div
      className="bg-[#181818]"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 36px)',
      }}
    >
      <div className="flex items-center justify-between px-4 h-12">
        <button
          type="button"
          onClick={_handleBack}
          aria-label={ariaLabel}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-300 border border-white/10 bg-white/5"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
          </svg>
        </button>

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
