'use client'

import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'

interface LeaderboardItem {
  id: string
  name: string
  deals: number
  sales: number
  avgCheck: number
  goalProgress: number | null
  finalConversion: number
  rank: number
  medal?: 'gold' | 'silver' | 'bronze'
}

interface LeaderboardTableProps {
  leaderboard: LeaderboardItem[]
  period: 'day' | 'week' | 'month'
  onPeriodChange: (period: string) => void
}

export function LeaderboardTable({ leaderboard, period, onPeriodChange }: LeaderboardTableProps) {
  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0
    }).format(value)
  }

  const getMedalColor = (medal?: string) => {
    switch (medal) {
      case 'gold': return 'from-yellow-400 to-yellow-600'
      case 'silver': return 'from-gray-300 to-gray-500'
      case 'bronze': return 'from-amber-600 to-amber-800'
      default: return 'from-blue-400 to-blue-600'
    }
  }

  return (
      <div className="space-y-6">
        {/* Period selector */}
        <div className="flex gap-2">
          {['day', 'week', 'month'].map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                period === p
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] border border-[var(--border)]'
              }`}
            >
            {p === 'day' ? 'День' : p === 'week' ? 'Неделя' : 'Месяц'}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="space-y-3">
        {leaderboard.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`p-6 rounded-2xl border-2 transition-all hover:scale-[1.02] ${
              item.medal
                ? 'bg-gradient-to-r ' + getMedalColor(item.medal) + ' text-white border-transparent'
                : 'bg-[var(--card)] border-[var(--border)] text-[var(--foreground)]'
            }`}
          >
            <div className="flex items-center gap-4">
              {/* Rank */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${
                item.medal ? 'bg-white/20' : 'bg-[var(--muted)] text-[var(--foreground)]'
              }`}>
                {item.rank}
              </div>

              {/* Medal icon */}
              {item.medal && (
                <Trophy className="w-8 h-8" />
              )}

              {/* Name */}
              <div className="flex-1">
                <h3 className="text-xl font-bold">{item.name}</h3>
                <p className={`text-sm ${item.medal ? 'text-white/80' : 'text-[var(--muted-foreground)]'}`}>
                  {item.deals} сделок • {formatMoney(item.sales)}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-right">
                <div>
                  <p className={`text-xs ${item.medal ? 'text-white/80' : 'text-[var(--muted-foreground)]'}`}>
                    Средний чек
                  </p>
                  <p className="text-lg font-bold">{formatMoney(item.avgCheck)}</p>
                </div>
                <div>
                  <p className={`text-xs ${item.medal ? 'text-white/80' : 'text-[var(--muted-foreground)]'}`}>
                    Конверсия
                  </p>
                  <p className="text-lg font-bold">{item.finalConversion}%</p>
                </div>
              </div>

              {/* Goal progress */}
              {item.goalProgress !== null && (
                <div className="w-32">
                  <p className={`text-xs mb-1 ${item.medal ? 'text-white/80' : 'text-gray-500'}`}>
                    Прогресс к цели
                  </p>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all duration-500"
                      style={{ width: `${Math.min(item.goalProgress, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs mt-1 text-right font-medium">
                    {item.goalProgress}%
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
