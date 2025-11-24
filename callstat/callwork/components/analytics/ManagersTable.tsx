'use client'

import { ManagerStats, BENCHMARKS, getHeatmapColor } from '@/lib/analytics/funnel.client'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { formatMoney } from '@/lib/utils/format'

interface ManagersTableProps {
  managers: ManagerStats[]
}

export function ManagersTable({ managers }: ManagersTableProps) {
  const sortedManagers = [...managers].sort((a, b) => b.salesAmount - a.salesAmount)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-separate border-spacing-y-2">
        <thead className="text-xs text-[var(--muted-foreground)] uppercase">
          <tr>
            <th className="px-4 py-2">Ранг</th>
            <th className="px-4 py-2">Менеджер</th>
            <th className="px-4 py-2">План/Факт</th>
            <th className="px-4 py-2">Сделки</th>
            <th className="px-4 py-2 text-center">
              <div>Запись → 1-й Zoom</div>
              <div className="text-[10px] opacity-70">Норма {BENCHMARKS.bookedToZoom1}%</div>
            </th>
            <th className="px-4 py-2 text-center">
              <div>1-й → 2-й Zoom</div>
              <div className="text-[10px] opacity-70">Норма {BENCHMARKS.zoom1ToZoom2}%</div>
            </th>
            <th className="px-4 py-2 text-center">
              <div>2-й Zoom → Договор</div>
              <div className="text-[10px] opacity-70">Норма {BENCHMARKS.zoom2ToContract}%</div>
            </th>
            <th className="px-4 py-2 text-center">
              <div>Договор → Дожим</div>
              <div className="text-[10px] opacity-70">Норма {BENCHMARKS.contractToPush}%</div>
            </th>
            <th className="px-4 py-2 text-center">
              <div>Дожим → Оплата</div>
              <div className="text-[10px] opacity-70">Норма {BENCHMARKS.pushToDeal}%</div>
            </th>
            <th className="px-4 py-2 text-center">Активность</th>
          </tr>
        </thead>
        <tbody>
          {sortedManagers.map((manager, index) => {
            const planProgress = Math.min(100, (manager.salesAmount / manager.planSales) * 100)
            const rank = index + 1

            return (
              <tr
                key={manager.id}
                className="bg-[var(--card)]/50 hover:bg-[var(--card)] transition-colors shadow-sm rounded-lg group"
              >
                <td className="px-4 py-3 font-bold text-[var(--foreground)] bg-[var(--secondary)]/50 rounded-l-lg text-center w-12 border-r border-[var(--border)]">
                  {rank}
                </td>

                <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                  <div className="flex items-center gap-2">
                    {manager.name}
                    {manager.trend === 'up' && <ArrowUp className="w-3 h-3 text-[var(--success)]" />}
                    {manager.trend === 'down' && <ArrowDown className="w-3 h-3 text-[var(--danger)]" />}
                    {manager.trend === 'flat' && <Minus className="w-3 h-3 text-[var(--muted-foreground)]" />}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="w-32">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-[var(--foreground)]">{formatMoney(manager.salesAmount)}</span>
                      <span className="text-[var(--muted-foreground)]">{Math.round(planProgress)}%</span>
                    </div>
                    <div className="h-1.5 bg-[var(--secondary)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          planProgress >= 100 ? 'bg-[var(--success)]' : 'bg-[var(--info)]'
                        }`}
                        style={{ width: `${planProgress}%` }}
                      />
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold w-6 text-[var(--foreground)]">{manager.successfulDeals}</span>
                    <div className="h-1.5 bg-purple-500/20 rounded-full flex-1 max-w-[60px]">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${Math.min(100, (manager.successfulDeals / 10) * 100)}%` }}
                      />
                    </div>
                  </div>
                </td>

                <td
                  className={`px-4 py-3 text-center font-mono font-medium border-l border-[var(--border)] ${getHeatmapColor(manager.bookedToZoom1, BENCHMARKS.bookedToZoom1)}`}
                >
                  {manager.bookedToZoom1}%
                </td>
                <td
                  className={`px-4 py-3 text-center font-mono font-medium border-l border-[var(--border)] ${getHeatmapColor(manager.zoom1ToZoom2, BENCHMARKS.zoom1ToZoom2)}`}
                >
                  {manager.zoom1ToZoom2}%
                </td>
                <td
                  className={`px-4 py-3 text-center font-mono font-medium border-l border-[var(--border)] ${getHeatmapColor(manager.zoom2ToContract, BENCHMARKS.zoom2ToContract)}`}
                >
                  {manager.zoom2ToContract}%
                </td>
                <td
                  className={`px-4 py-3 text-center font-mono font-medium border-l border-[var(--border)] ${getHeatmapColor(manager.contractToPush, BENCHMARKS.contractToPush)}`}
                >
                  {manager.contractToPush}%
                </td>
                <td
                  className={`px-4 py-3 text-center font-mono font-medium border-l border-[var(--border)] ${getHeatmapColor(manager.pushToDeal, BENCHMARKS.pushToDeal)}`}
                >
                  {manager.pushToDeal}%
                </td>

                <td className="px-4 py-3 text-center rounded-r-lg">
                  <div
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      manager.activityScore >= BENCHMARKS.activityScore
                        ? 'bg-[var(--secondary)] text-[var(--foreground)]'
                        : 'bg-[var(--danger)]/10 text-[var(--danger)]'
                    }`}
                  >
                    {manager.activityScore}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
