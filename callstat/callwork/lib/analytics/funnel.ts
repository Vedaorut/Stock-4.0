import { Report } from '@prisma/client'
import { GoalService } from '@/lib/services/GoalService'
import { computeConversions, stageBenchmarkById } from '@/lib/calculations/metrics'
import { PLAN_HEURISTICS } from '@/lib/config/metrics'
import { FUNNEL_STAGES } from '@/lib/config/conversionBenchmarks'

// Re-export types and client functions from funnel.client.ts
export type { ManagerStats, FunnelStage } from '@/lib/analytics/funnel.client'
export { BENCHMARKS, getHeatmapColor, getFunnelData, analyzeRedZones, calculateManagerStatsClient } from '@/lib/analytics/funnel.client'

/**
 * Server-side версия calculateManagerStats с получением целей из БД
 * Требует managerId для запроса к базе данных
 *
 * ВАЖНО: Эта функция только для серверных компонентов/API routes!
 * Для клиентских компонентов используйте calculateManagerStatsClient из '@/lib/analytics/funnel.client'
 */
export async function calculateManagerStats(
  reports: Report[],
  managerId: string
): Promise<Omit<ManagerStats, 'id' | 'name'>> {
  const totals = reports.reduce(
    (acc, report) => {
      const pushCount = (report as any).pushCount ?? report.contractReviewCount ?? 0

      return {
        zoomBooked: acc.zoomBooked + report.zoomAppointments,
        zoom1Held: acc.zoom1Held + report.pzmConducted,
        zoom2Held: acc.zoom2Held + report.vzmConducted,
        contractReview: acc.contractReview + report.contractReviewCount,
        pushCount: acc.pushCount + pushCount,
        successfulDeals: acc.successfulDeals + report.successfulDeals,
        salesAmount: acc.salesAmount + Number(report.monthlySalesAmount),
        refusals: acc.refusals + (report.refusalsCount || 0),
        warming: acc.warming + (report.warmingUpCount || 0),
      }
    },
    {
      zoomBooked: 0,
      zoom1Held: 0,
      zoom2Held: 0,
      contractReview: 0,
      pushCount: 0,
      successfulDeals: 0,
      salesAmount: 0,
      refusals: 0,
      warming: 0,
    }
  )

  const { stages, northStar, totalConversion } = computeConversions({
    zoomBooked: totals.zoomBooked,
    zoom1Held: totals.zoom1Held,
    zoom2Held: totals.zoom2Held,
    contractReview: totals.contractReview,
    push: totals.pushCount,
    deals: totals.successfulDeals,
  })
  const convMap = Object.fromEntries(stages.map((stage) => [stage.id, stage.conversion]))

  // Получаем цель из БД через единый источник данных
  const planSales = await GoalService.getTeamGoal(managerId)
  const planDeals = Math.max(1, Math.round(planSales / PLAN_HEURISTICS.SALES_PER_DEAL))

  // Рассчитываем активность на основе реальных данных
  const expectedActivity = totals.zoomBooked > 0 ? 100 : 0
  const actualActivity = Math.min(
    100,
    Math.round((totals.zoom1Held / Math.max(1, totals.zoomBooked)) * 100)
  )
  const activityScore = Math.round((expectedActivity + actualActivity) / 2)

  // Определяем тренд на основе прогресса к цели
  const progress = planSales > 0 ? (totals.salesAmount / planSales) * 100 : 0
  const trend = progress >= 80 ? 'up' : progress >= 50 ? 'flat' : 'down'

  return {
    ...totals,
    bookedToZoom1: (convMap.zoom1Held as number) || 0,
    zoom1ToZoom2: (convMap.zoom2Held as number) || 0,
    zoom2ToContract: (convMap.contractReview as number) || 0,
    contractToPush: (convMap.push as number) || 0,
    pushToDeal: (convMap.deal as number) || 0,
    northStar,
    totalConversion,
    planSales,
    planDeals,
    activityScore,
    trend,
  }
}

export function getFunnelData(stats: Omit<ManagerStats, 'id' | 'name'>): FunnelStage[] {
  const stageMap = {
    zoomBooked: stats.zoomBooked,
    zoom1Held: stats.zoom1Held,
    zoom2Held: stats.zoom2Held,
    contractReview: stats.contractReview,
    push: stats.pushCount,
    deal: stats.successfulDeals,
  }

  const conversionMap: Record<string, number> = {
    zoom1Held: stats.bookedToZoom1,
    zoom2Held: stats.zoom1ToZoom2,
    contractReview: stats.zoom2ToContract,
    push: stats.contractToPush,
    deal: stats.pushToDeal,
  }

  return FUNNEL_STAGES.map((stage, index) => {
    const prevStage = FUNNEL_STAGES[index - 1]
    const prevValue = prevStage ? stageMap[prevStage.id as keyof typeof stageMap] : undefined
    const conversion = conversionMap[stage.id] ?? 100
    const benchmark = stageBenchmarkById(stage.id as any)

    return {
      id: stage.id,
      label: stage.label,
      value: stageMap[stage.id as keyof typeof stageMap],
      prevValue,
      conversion: stage.id === 'zoomBooked' ? 100 : conversion,
      benchmark,
      isRedZone: stage.id === 'zoomBooked' ? false : conversion < benchmark,
      dropOff: prevValue ? Math.max(0, 100 - conversion) : 0,
    }
  })
}

export function analyzeRedZones(stats: ManagerStats) {
  const issues = []

  if (stats.bookedToZoom1 < BENCHMARKS.bookedToZoom1) {
    issues.push({
      stage: 'Записи → 1-й Zoom',
      metric: 'Конверсия в явку',
      value: stats.bookedToZoom1,
      benchmark: BENCHMARKS.bookedToZoom1,
      severity: 'warning',
    })
  }

  if (stats.zoom1ToZoom2 < BENCHMARKS.zoom1ToZoom2) {
    issues.push({
      stage: '1-й Zoom → 2-й Zoom',
      metric: 'Квалификация лида',
      value: stats.zoom1ToZoom2,
      benchmark: BENCHMARKS.zoom1ToZoom2,
      severity: 'critical',
    })
  }

  if (stats.contractToPush < BENCHMARKS.contractToPush) {
    issues.push({
      stage: 'Договор → Дожим',
      metric: 'Дожим клиентов',
      value: stats.contractToPush,
      benchmark: BENCHMARKS.contractToPush,
      severity: 'warning',
    })
  }

  if (stats.pushToDeal < BENCHMARKS.pushToDeal) {
    issues.push({
      stage: 'Дожим → Оплата',
      metric: 'Закрытие',
      value: stats.pushToDeal,
      benchmark: BENCHMARKS.pushToDeal,
      severity: 'critical',
    })
  }

  if (stats.activityScore < BENCHMARKS.activityScore) {
    issues.push({
      stage: 'Активность',
      metric: 'Индекс активности',
      value: stats.activityScore,
      benchmark: BENCHMARKS.activityScore,
      severity: 'warning',
    })
  }

  if (stats.northStar < BENCHMARKS.northStar) {
    issues.push({
      stage: '1-й Zoom → Оплата',
      metric: 'North Star KPI',
      value: stats.northStar,
      benchmark: BENCHMARKS.northStar,
      severity: 'critical',
    })
  }

  return issues
}
