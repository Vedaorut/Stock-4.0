'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Target, DollarSign, Activity } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'
import { NorthStarKpi } from '@/lib/calculations/funnel'

interface PulseGridProps {
  stats: {
    salesAmount: number
    planSales: number
    successfulDeals: number
    planDeals: number
    totalConversion: number
    prevConversion: number
  }
  northStarKpi: NorthStarKpi | null
}

export function PulseGrid({ stats, northStarKpi }: PulseGridProps) {
  const salesProgress = Math.min(100, (stats.salesAmount / stats.planSales) * 100)
  const dealsProgress = Math.min(100, (stats.successfulDeals / stats.planDeals) * 100)

  const conversionDiff = stats.totalConversion - stats.prevConversion
  const isConversionUp = conversionDiff >= 0

  const northStarValue = northStarKpi?.value ?? 0
  const northStarTarget = northStarKpi?.target ?? 5
  const northStarDelta = northStarValue - northStarTarget
  const northStarGood = northStarValue >= northStarTarget

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">Выполнение плана (₽)</p>
            <h3 className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {formatMoney(stats.salesAmount)}
            </h3>
          </div>
          <div className="p-2 bg-[var(--info)]/10 rounded-lg text-[var(--info)]">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
        <div className="relative h-4 bg-[var(--secondary)] rounded-full overflow-hidden mb-2">
          <div
            className="absolute top-0 left-0 h-full bg-[var(--info)] transition-all duration-500"
            style={{ width: `${salesProgress}%` }}
          />
          <div className="absolute top-0 bottom-0 w-0.5 bg-[var(--foreground)]/20 left-[80%]" />
        </div>
        <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
          <span>Факт: {Math.round(salesProgress)}%</span>
          <span>План: {formatMoney(stats.planSales)}</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card p-6"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">Сделки (шт)</p>
            <h3 className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {stats.successfulDeals}
            </h3>
          </div>
          <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
            <Target className="w-5 h-5" />
          </div>
        </div>
        <div className="relative h-4 bg-[var(--secondary)] rounded-full overflow-hidden mb-2">
          <div
            className="absolute top-0 left-0 h-full bg-purple-500 transition-all duration-500"
            style={{ width: `${dealsProgress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
          <span>Факт: {Math.round(dealsProgress)}%</span>
          <span>План: {stats.planDeals}</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-6"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">Общая конверсия</p>
            <h3 className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {stats.totalConversion}%
            </h3>
          </div>
          <div className={`p-2 rounded-lg ${isConversionUp ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--danger)]/10 text-[var(--danger)]'}`}>
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          {isConversionUp ? (
            <TrendingUp className="w-4 h-4 text-[var(--success)]" />
          ) : (
            <TrendingDown className="w-4 h-4 text-[var(--danger)]" />
          )}
          <span className={`text-sm font-medium ${isConversionUp ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {Math.abs(conversionDiff)}% к прошлому периоду
          </span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          Записан на Zoom → Оплата
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-card p-6"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">Главный KPI</p>
            <h3 className="text-2xl font-bold text-[var(--foreground)] mt-1">
              {northStarValue.toFixed(1)}%
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">1-й Zoom → Оплата</p>
          </div>
          <div className={`p-2 rounded-lg ${northStarGood ? 'bg-[var(--success)]/10 text-[var(--success)]' : 'bg-[var(--warning)]/10 text-[var(--warning)]'}`}>
            <Target className="w-5 h-5" />
          </div>
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          Цель: {northStarTarget}% ({northStarDelta >= 0 ? '+' : ''}{northStarDelta.toFixed(1)}%)
        </div>
      </motion.div>
    </div>
  )
}
