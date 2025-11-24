import {
  CONVERSION_BENCHMARKS,
  FUNNEL_STAGES,
  FunnelStageId,
} from '@/lib/config/conversionBenchmarks'
import { computeConversions, getStageLabel as getLabelFromConfig, resolveNorthStarStatus } from '@/lib/calculations/metrics'

const round2 = (num: number) => Math.round(num * 100) / 100
const getStageLabel = (id: FunnelStageId) => getLabelFromConfig(id)
const safeRate = (value: number, base: number) => (base > 0 ? round2((value / base) * 100) : 0)

export interface RefusalBreakdown {
  stageId: FunnelStageId
  label: string
  count: number
  rate: number // % от входа на этап
}

export interface FunnelTotals {
  zoomBooked: number
  zoom1Held: number
  zoom2Held: number
  contractReview: number
  push: number
  deals: number
  sales?: number
  refusals?: number
  warming?: number
  refusalByStage?: Partial<Record<Exclude<FunnelStageId, 'deal'>, number>>
}

export interface FunnelStage {
  id: FunnelStageId
  stage: string
  value: number
  conversion: number
  benchmark: number
  isRedZone: boolean
}

export interface SideFlow {
  refusals: {
    total: number
    rateFromFirstZoom: number
    byStage: RefusalBreakdown[]
  }
  warming: {
    count: number
  }
}

export interface NorthStarKpi {
  value: number
  target: number
  delta: number
  isOnTrack: boolean
}

export interface FullFunnelResult {
  funnel: FunnelStage[]
  sideFlow: SideFlow
  northStarKpi: NorthStarKpi
}

export function calculateFullFunnel(totals: FunnelTotals): FullFunnelResult {
  const { stages, northStar, totalConversion } = computeConversions({
    zoomBooked: totals.zoomBooked,
    zoom1Held: totals.zoom1Held,
    zoom2Held: totals.zoom2Held,
    contractReview: totals.contractReview,
    push: totals.push,
    deals: totals.deals,
  })
  const values: Record<FunnelStageId, number> = {
    zoomBooked: totals.zoomBooked || 0,
    zoom1Held: totals.zoom1Held || 0,
    zoom2Held: totals.zoom2Held || 0,
    contractReview: totals.contractReview || 0,
    push: totals.push || 0,
    deal: totals.deals || 0,
  }

  const funnel: FunnelStage[] = stages.map((stage) => ({
    id: stage.id,
    stage: getStageLabel(stage.id),
    value: stage.value,
    conversion: stage.conversion,
    benchmark: stage.benchmark,
    isRedZone: stage.isRedZone,
  }))

  const northStarKpi: NorthStarKpi = {
    value: northStar,
    ...resolveNorthStarStatus(northStar),
  }

  // Отказы по этапам (fallback: считаем все после 1-го Zoom)
  const refusalStages = FUNNEL_STAGES.filter((stage) => stage.id !== 'deal').map((stage) => stage.id)
  const breakdown: RefusalBreakdown[] = refusalStages.map((stageId) => {
    const count =
      totals.refusalByStage?.[stageId as Exclude<FunnelStageId, 'deal'>] ??
      (stageId === 'zoom1Held' ? totals.refusals || 0 : 0)

    const baseCount =
      stageId === 'zoomBooked'
        ? values.zoomBooked
        : stageId === 'zoom1Held'
        ? values.zoom1Held
        : stageId === 'zoom2Held'
        ? values.zoom2Held
        : stageId === 'contractReview'
        ? values.contractReview
        : values.push

    return {
      stageId,
      label: getStageLabel(stageId),
      count,
      rate: safeRate(count, baseCount),
    }
  })

  const totalRefusals =
    breakdown.reduce((sum, item) => sum + item.count, 0) || totals.refusals || 0

  const sideFlow: SideFlow = {
    refusals: {
      total: totalRefusals,
      rateFromFirstZoom: safeRate(totalRefusals, Math.max(values.zoom1Held, values.zoomBooked)),
      byStage: breakdown,
    },
    warming: {
      count: totals.warming || 0,
    },
  }

  return { funnel, sideFlow, northStarKpi }
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('ru-RU').format(num)
}

export function formatPercent(num: number): string {
  return `${round2(num).toFixed(2)}%`
}

export function getConversionColor(conversion: number, isRedZone: boolean): string {
  if (isRedZone) return '#EF4444'
  if (conversion >= 70) return '#10B981'
  return '#F59E0B'
}
