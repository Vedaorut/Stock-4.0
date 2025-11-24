import { Star, Loader2, BadgeCheck } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

export interface DealCard {
  id: string
  title: string
  budget: number
  status: 'OPEN' | 'WON' | 'LOST'
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID'
  isFocus: boolean
  updatedAt?: string
}

interface DealsListProps {
  deals: DealCard[]
  loading?: boolean
  error?: string | null
  onToggleFocus: (dealId: string, nextValue: boolean) => Promise<void> | void
}

function statusBadge(status: DealCard['status']) {
  switch (status) {
    case 'WON':
      return 'bg-emerald-100 text-emerald-700'
    case 'LOST':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-blue-100 text-blue-700'
  }
}

function paymentBadge(status: DealCard['paymentStatus']) {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    case 'PARTIAL':
      return 'bg-amber-50 text-amber-700 border border-amber-200'
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200'
  }
}

export function DealsList({ deals, loading = false, error, onToggleFocus }: DealsListProps) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-[var(--muted-foreground)]">Сделки</p>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Фокус-лист</h3>
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-[var(--muted-foreground)]" />}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 mb-3">
          {error}
        </div>
      )}

      {deals.length === 0 && !loading && (
        <div className="text-sm text-[var(--muted-foreground)] py-4">
          Нет сделок в работе. Добавьте фокус для приоритетных задач.
        </div>
      )}

      <div className="space-y-3">
        {deals.map((deal) => {
          const isFocused = deal.isFocus
          return (
            <div
              key={deal.id}
              className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                isFocused ? 'border-amber-300 bg-amber-50/50' : 'border-[var(--border)] bg-[var(--card)]'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-[var(--foreground)] truncate">{deal.title}</h4>
                  {isFocused && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      <BadgeCheck className="w-3 h-3" />
                      Фокус
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mt-1 flex-wrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge(deal.status)}`}>
                    {deal.status === 'OPEN' && 'В работе'}
                    {deal.status === 'WON' && 'Выиграна'}
                    {deal.status === 'LOST' && 'Закрыта'}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-[11px] font-medium ${paymentBadge(deal.paymentStatus)}`}>
                    {deal.paymentStatus === 'PAID' ? 'Оплачено' : deal.paymentStatus === 'PARTIAL' ? 'Частичная' : 'Не оплачено'}
                  </span>
                  <span className="text-[var(--foreground)] font-semibold">{formatMoney(deal.budget)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onToggleFocus(deal.id, !isFocused)}
                className={`p-2 rounded-full border transition-colors ${
                  isFocused
                    ? 'text-amber-600 border-amber-300 bg-amber-50'
                    : 'text-[var(--muted-foreground)] border-[var(--border)] hover:text-amber-600 hover:border-amber-300'
                }`}
                aria-pressed={isFocused}
                aria-label={isFocused ? 'Убрать фокус' : 'Добавить в фокус'}
              >
                <Star className={`w-5 h-5 ${isFocused ? 'fill-amber-400' : ''}`} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
