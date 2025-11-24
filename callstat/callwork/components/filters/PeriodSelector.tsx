'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'

export type PeriodPreset = 'today' | 'week' | 'thisMonth' | 'lastMonth' | 'custom'

interface PeriodSelectorProps {
  selectedPreset: PeriodPreset
  range: { start: Date; end: Date }
  onPresetChange: (preset: PeriodPreset, range: { start: Date; end: Date }) => void
  title?: string
  orientation?: 'horizontal' | 'vertical'
}

const toDateInputValue = (date: Date) => date.toISOString().split('T')[0]

export function PeriodSelector({ 
  selectedPreset, 
  range, 
  onPresetChange, 
  title = 'Период',
  orientation = 'horizontal'
}: PeriodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const presets: Array<{ key: PeriodPreset; label: string; short: string }> = useMemo(
    () => [
      { key: 'today', label: 'Сегодня', short: '1Д' },
      { key: 'week', label: '7 дней', short: '7Д' },
      { key: 'thisMonth', label: 'Этот месяц', short: 'ТМ' },
      { key: 'lastMonth', label: 'Прошлый месяц', short: 'ПМ' },
      { key: 'custom', label: 'Свой диапазон', short: '...' },
    ],
    []
  )

  // Close click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handlePreset = (preset: PeriodPreset) => {
    const now = new Date()
    let start = new Date(range.start)
    let end = new Date(range.end)

    switch (preset) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        start = new Date(now)
        start.setDate(now.getDate() - 7)
        end = now
        break
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1)
        end = now
        break
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        end = new Date(now.getFullYear(), now.getMonth(), 0)
        break
      case 'custom':
      default:
        break
    }
    onPresetChange(preset, { start, end })
    if (preset !== 'custom') {
        setIsOpen(false)
    }
  }

  const handleCustomChange = (key: 'start' | 'end', value: string) => {
    const next = {
      start: key === 'start' ? new Date(value) : range.start,
      end: key === 'end' ? new Date(value) : range.end,
    }
    onPresetChange('custom', next)
  }

  const formattedRange = `${range.start.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} - ${range.end.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`
  const activeLabel = presets.find(p => p.key === selectedPreset)?.label || 'Свой диапазон'
  const activeShort = presets.find(p => p.key === selectedPreset)?.short || '...'

  const isVertical = orientation === 'vertical'

  return (
    <div 
      ref={containerRef}
      className={`bg-[var(--card)] rounded-2xl shadow-md border border-[var(--border)] transition-all duration-300 relative
        ${isVertical ? 'p-2 w-[64px] flex flex-col items-center gap-2' : 'p-4 w-full sm:w-[280px] space-y-3'}
      `}
    >
      {/* Header */}
      {isVertical ? (
         <div className="text-[var(--primary)] p-1">
            <Calendar className="w-5 h-5" />
         </div>
      ) : (
        <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--primary)]" />
            <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
        </div>
      )}

      <div className={isVertical ? 'w-full' : 'relative'}>
        {isVertical ? (
             <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-10 h-10 mx-auto flex items-center justify-center bg-[var(--secondary)] hover:bg-[var(--muted)] text-[var(--foreground)] text-xs font-bold rounded-full transition-colors duration-200 border border-transparent focus:border-[var(--primary)] outline-none"
             >
                {activeShort}
             </button>
        ) : (
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between bg-[var(--secondary)] hover:bg-[var(--muted)] text-[var(--foreground)] text-sm font-medium px-3 py-2 rounded-lg transition-colors duration-200 border border-transparent focus:border-[var(--primary)] outline-none"
            >
                <span className="truncate">{activeLabel}: {formattedRange}</span>
                <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
        )}

        {isOpen && (
            <div className={`absolute bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 p-4 space-y-4
                ${isVertical 
                    ? 'right-full top-0 mr-3 w-[320px]' 
                    : 'top-full right-0 mt-2 w-[320px]'
                }
            `}>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[var(--foreground)]">Выберите период</span>
                    <button onClick={() => setIsOpen(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    {presets.map((item) => (
                    <button
                        key={item.key}
                        onClick={() => handlePreset(item.key)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-center ${
                        selectedPreset === item.key
                            ? 'bg-[var(--primary)] text-white shadow-sm'
                            : 'bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--muted)]'
                        }`}
                    >
                        {item.label}
                    </button>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border)]">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--muted-foreground)]">Начало</label>
                        <input
                            type="date"
                            value={toDateInputValue(range.start)}
                            onChange={(e) => handleCustomChange('start', e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--primary)] focus:bg-[var(--card)] transition-colors outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-[var(--muted-foreground)]">Конец</label>
                        <input
                            type="date"
                            value={toDateInputValue(range.end)}
                            onChange={(e) => handleCustomChange('end', e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--primary)] focus:bg-[var(--card)] transition-colors outline-none"
                        />
                    </div>
                </div>
            </div>
        )}
      </div>
      
      {!isVertical && (
       <p className="text-[10px] text-[var(--muted-foreground)]">
        {range.start.toLocaleDateString('ru-RU')} — {range.end.toLocaleDateString('ru-RU')}
      </p>
      )}
    </div>
  )
}