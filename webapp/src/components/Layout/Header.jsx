/**
 * Simple Static Header
 * NOT fixed - scrolls with content
 * Single solid color - no gradients or shadows
 */
export default function Header({ title, subtitle }) {
  return (
    <header className="bg-[#181818]" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 36px)' }}>
      <div className="flex items-center justify-center h-12 px-5">
        <div className="text-center">
          <h1 className="text-[22px] font-bold text-white tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-white/50 font-medium uppercase tracking-widest mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
