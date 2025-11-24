'use client'

import { useState, useRef, useEffect } from 'react'
import { Users, ChevronDown, Check } from 'lucide-react'

interface ManagerSelectorProps {
  managers: Array<{ id: string; name: string }>
  selectedManagerId: string
  onSelectManager: (id: string) => void
  title?: string
  orientation?: 'horizontal' | 'vertical'
}

export function ManagerSelector({ 
  managers, 
  selectedManagerId, 
  onSelectManager, 
  title = 'Сотрудник',
  orientation = 'horizontal'
}: ManagerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedManager = managers.find(m => m.id === selectedManagerId)
  const displayName = selectedManager ? selectedManager.name : (selectedManagerId === 'all' ? 'Вся команда' : 'Выберите сотрудника')
  const displayInitials = selectedManager ? selectedManager.name.slice(0, 2).toUpperCase() : (selectedManagerId === 'all' ? 'ВС' : '??')

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

  const isVertical = orientation === 'vertical'

  return (
    <div 
      ref={containerRef}
      className={`bg-[var(--card)] rounded-2xl shadow-md border border-[var(--border)] transition-all duration-300 relative
        ${isVertical ? 'p-2 w-[64px] flex flex-col items-center gap-2' : 'p-4 w-full sm:w-[280px] space-y-3'}
      `}
    >
      {/* Header (Icon + Title) */}
      {isVertical ? (
         // Vertical: Just the icon, maybe tooltip later
         <div className="text-[var(--primary)] p-1">
            <Users className="w-5 h-5" />
         </div>
      ) : (
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--primary)]" />
          <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
        </div>
      )}

      {/* Control */}
      <div className={isVertical ? 'w-full' : 'relative'}>
        {isVertical ? (
            // Vertical Button (Compact)
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-10 h-10 mx-auto flex items-center justify-center bg-[var(--secondary)] hover:bg-[var(--muted)] text-[var(--foreground)] text-xs font-bold rounded-full transition-colors duration-200 border border-transparent focus:border-[var(--primary)] outline-none"
            >
                {displayInitials}
            </button>
        ) : (
            // Horizontal Button (Full)
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between bg-[var(--secondary)] hover:bg-[var(--muted)] text-[var(--foreground)] text-sm font-medium px-3 py-2 rounded-lg transition-colors duration-200 border border-transparent focus:border-[var(--primary)] outline-none"
            >
                <span className="truncate">{displayName}</span>
                <ChevronDown className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
        )}

        {/* Dropdown Menu */}
        {isOpen && (
          <div className={`absolute bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-y-auto py-1
            ${isVertical 
                ? 'right-full top-0 mr-3 w-[260px] max-h-[400px]' // Pop to left
                : 'top-full left-0 right-0 mt-1 max-h-[240px]'   // Pop down
            }
          `}>
             {/* Header for Vertical Mode */}
             {isVertical && (
                <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                    <span className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">{title}</span>
                </div>
             )}

            <button
              onClick={() => {
                onSelectManager('all')
                setIsOpen(false)
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-[var(--secondary)] transition-colors"
            >
              <span className={selectedManagerId === 'all' ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}>
                Вся команда
              </span>
              {selectedManagerId === 'all' && <Check className="w-4 h-4 text-[var(--primary)]" />}
            </button>
            
            {managers.length > 0 && <div className="h-px bg-[var(--border)] my-1" />}
            
            {managers.map((manager) => (
              <button
                key={manager.id}
                onClick={() => {
                  onSelectManager(manager.id)
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-[var(--secondary)] transition-colors"
              >
                <span className={selectedManagerId === manager.id ? 'text-[var(--primary)] font-medium' : 'text-[var(--foreground)]'}>
                  {manager.name}
                </span>
                {selectedManagerId === manager.id && <Check className="w-4 h-4 text-[var(--primary)]" />}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {!isVertical && (
        <p className="text-[10px] text-[var(--muted-foreground)]">
            {selectedManagerId === 'all' ? 'Статистика по всему отделу' : 'Персональная статистика'}
        </p>
      )}
    </div>
  )
}
