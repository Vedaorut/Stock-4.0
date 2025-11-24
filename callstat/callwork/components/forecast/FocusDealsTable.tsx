'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Zap, Search, ArrowUpDown, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Deal {
  id: string
  title: string
  budget: number
  isFocus: boolean
  createdAt: string
}

interface FocusDealsTableProps {
  deals: Deal[]
  onUpdate: () => void
}

export function FocusDealsTable({ deals, onUpdate }: FocusDealsTableProps) {
  const [localDeals, setLocalDeals] = useState(deals)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  // Update local state when props change
  if (JSON.stringify(deals) !== JSON.stringify(localDeals) && !isUpdating) {
      setLocalDeals(deals)
  }

  const handleToggleFocus = async (dealId: string, currentStatus: boolean) => {
    setIsUpdating(dealId)
    
    // Optimistic UI Update
    const previousDeals = [...localDeals]
    setLocalDeals(prev => prev.map(d => 
        d.id === dealId ? { ...d, isFocus: !currentStatus } : d
    ))

    try {
      const res = await fetch(`/api/deals/${dealId}/focus`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFocus: !currentStatus })
      })

      if (!res.ok) throw new Error('Failed to update')
      
      toast.success(currentStatus ? 'Сделка убрана из фокуса' : 'Сделка добавлена в фокус')
      onUpdate() // Trigger global recalc
    } catch (error) {
      // Revert on error
      setLocalDeals(previousDeals)
      toast.error('Ошибка обновления')
    } finally {
      setIsUpdating(null)
    }
  }

  if (localDeals.length === 0) {
      return (
          <div className="glass-card p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-[var(--secondary)] rounded-full flex items-center justify-center mb-3 text-[var(--muted-foreground)]">
                  <Search className="w-6 h-6" />
              </div>
              <h3 className="text-[var(--foreground)] font-medium">Нет активных сделок</h3>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">Здесь появятся открытые сделки из CRM</p>
          </div>
      )
  }

  return (
    <div className="glass-card p-0 overflow-hidden">
      <div className="p-6 border-b border-[var(--border)] flex justify-between items-center">
        <h3 className="font-bold text-[var(--foreground)] flex items-center gap-2">
            Мои активные сделки
            <span className="text-xs font-normal text-[var(--muted-foreground)] bg-[var(--secondary)] px-2 py-0.5 rounded-full">
                {localDeals.length}
            </span>
        </h3>
        <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Отметьте галочкой сделки, которые точно закроете
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-[var(--secondary)]/50 text-[var(--muted-foreground)] font-medium">
            <tr>
              <th className="px-6 py-3">Фокус</th>
              <th className="px-6 py-3">Название сделки</th>
              <th className="px-6 py-3">Бюджет</th>
              <th className="px-6 py-3 text-right">Дата создания</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {localDeals.map((deal) => (
              <motion.tr 
                key={deal.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`group transition-colors ${deal.isFocus ? 'bg-[var(--primary)]/5' : 'hover:bg-[var(--secondary)]/30'}`}
              >
                <td className="px-6 py-4 w-16">
                    <button
                        onClick={() => handleToggleFocus(deal.id, deal.isFocus)}
                        disabled={isUpdating === deal.id}
                        className={`
                            w-10 h-6 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[var(--primary)]
                            ${deal.isFocus ? 'bg-[var(--primary)]' : 'bg-[var(--muted)] border border-[var(--border)]'}
                            ${isUpdating === deal.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                    >
                        <div className={`
                            absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 flex items-center justify-center
                            ${deal.isFocus ? 'translate-x-4' : 'translate-x-0'}
                        `}>
                            {deal.isFocus && <Zap className="w-2.5 h-2.5 text-[var(--primary)]" />}
                        </div>
                    </button>
                </td>
                <td className="px-6 py-4 font-medium text-[var(--foreground)]">
                    {deal.title}
                </td>
                <td className="px-6 py-4">
                    <div className="font-bold text-[var(--foreground)]">
                        {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Number(deal.budget))}
                    </div>
                </td>
                <td className="px-6 py-4 text-right text-[var(--muted-foreground)]">
                    {new Intl.NumberFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(deal.createdAt))}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
