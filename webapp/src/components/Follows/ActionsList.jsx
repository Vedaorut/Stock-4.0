import { PencilIcon, ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';
import InteractiveListItem from '../common/InteractiveListItem';

export default function ActionsList({ mode, markup, markupType, onEditMarkup, onSwitchMode, onDelete }) {
  const modeLabel = mode === 'monitor' ? 'Мониторинг' : 'Перепродажа';
  const switchToMode = mode === 'monitor' ? 'resell' : 'monitor';
  const switchToLabel = switchToMode === 'monitor' ? 'Мониторинг' : 'Перепродажа';

  return (
    <div className="space-y-8">
      {/* Секция: НАСТРОЙКИ */}
      <div>
        <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-widest px-4 mb-3">
          Настройки
        </h3>
        <div className="bg-[#1E1E1E] rounded-3xl overflow-hidden border border-white/5">
          {/* Изменить наценку (только для resell) */}
          {mode === 'resell' && (
            <>
              <InteractiveListItem
                onClick={onEditMarkup}
                className="w-full group active:bg-white/5"
                style={{
                  minHeight: '76px',
                  padding: '16px 20px',
                }}
              >
                <div className="w-11 h-11 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center flex-shrink-0 group-active:scale-95 transition-transform duration-200">
                  <PencilIcon className="w-5 h-5 text-[#FF6B00]" />
                </div>
                <div className="flex-1 min-w-0 px-4 text-left">
                  <div className="text-white font-semibold text-[15px]">Изменить наценку</div>
                  <div className="text-white/40 text-xs mt-0.5 font-medium">Текущая: <span className="text-white/60">+{markupType === 'fixed' ? `$${markup}` : `${markup}%`}</span></div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </div>
              </InteractiveListItem>
              <div className="h-px bg-white/5 mx-4" />
            </>
          )}

          {/* Переключить режим */}
          <InteractiveListItem
            onClick={onSwitchMode}
            className="w-full group active:bg-white/5"
            style={{
              minHeight: '76px',
              padding: '16px 20px',
            }}
          >
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 group-active:scale-95 transition-transform duration-200">
              <ArrowPathIcon className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0 px-4 text-left">
              <div className="text-white font-semibold text-[15px]">Переключить режим</div>
              <div className="text-white/40 text-xs mt-0.5 font-medium">
                На <span className="text-blue-400">{switchToLabel.toLowerCase()}</span>
              </div>
            </div>
             <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/20">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
            </div>
          </InteractiveListItem>
        </div>
      </div>

      {/* Секция: ОПАСНАЯ ЗОНА */}
      <div>
        <h3 className="text-[11px] font-bold text-red-500/40 uppercase tracking-widest px-4 mb-3">
          Опасная зона
        </h3>
        <div className="bg-[#1E1E1E] rounded-3xl overflow-hidden border border-red-500/10">
          <InteractiveListItem
            onClick={onDelete}
            className="w-full group active:bg-red-500/5"
            rippleColor="rgba(239, 68, 68, 0.2)"
            style={{
              minHeight: '76px',
              padding: '16px 20px',
            }}
          >
            <div className="w-11 h-11 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 group-active:scale-95 transition-transform duration-200">
              <TrashIcon className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 min-w-0 px-4 text-left">
              <div className="text-red-500 font-semibold text-[15px]">Удалить подписку</div>
              <div className="text-red-500/40 text-xs mt-0.5 font-medium">Действие необратимо</div>
            </div>
          </InteractiveListItem>
        </div>
      </div>
    </div>
  );
}