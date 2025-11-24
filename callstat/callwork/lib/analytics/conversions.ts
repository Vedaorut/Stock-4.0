import { computeConversions } from '@/lib/calculations/metrics'

export interface Stats {
  zoomBooked: number
  zoom1Held: number
  zoom2Held: number
  contractReview: number
  pushCount: number
  successfulDeals: number
  monthlySalesAmount: number
}

export interface Conversions {
  bookedToZoom1: number
  zoom1ToZoom2: number
  zoom2ToContract: number
  contractToPush: number
  pushToDeal: number
  overallConversion: number
  northStar: number
}

export function calculateConversions(stats: Stats): Conversions {
  const { stages, northStar, totalConversion } = computeConversions({
    zoomBooked: stats.zoomBooked,
    zoom1Held: stats.zoom1Held,
    zoom2Held: stats.zoom2Held,
    contractReview: stats.contractReview,
    push: stats.pushCount,
    deals: stats.successfulDeals,
  })

  const conversionsMap = Object.fromEntries(
    stages.map((stage) => [stage.id, stage.conversion])
  ) as Record<string, number>

  return {
    bookedToZoom1: conversionsMap.zoom1Held || 0,
    zoom1ToZoom2: conversionsMap.zoom2Held || 0,
    zoom2ToContract: conversionsMap.contractReview || 0,
    contractToPush: conversionsMap.push || 0,
    pushToDeal: conversionsMap.deal || 0,
    overallConversion: totalConversion,
    northStar,
  }
}

export type DateRange = 'week' | 'month' | 'quarter' | 'year'

export function getDateRange(range: DateRange): { startDate: Date; endDate: Date } {
  const now = new Date()
  const endDate = now
  const startDate = new Date()

  switch (range) {
    case 'week':
      startDate.setDate(now.getDate() - 7)
      break
    case 'month':
      startDate.setMonth(now.getMonth() - 1)
      break
    case 'quarter':
      startDate.setMonth(now.getMonth() - 3)
      break
    case 'year':
      startDate.setFullYear(now.getFullYear() - 1)
      break
  }

  return { startDate, endDate }
}
