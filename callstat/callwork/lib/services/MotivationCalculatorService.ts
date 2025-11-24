import { prisma } from '@/lib/prisma'
import { calculateMonthlyForecast } from '@/lib/calculations/forecast'
import { MOTIVATION_GRADE_PRESETS } from '@/lib/config/motivationGrades'
import { calculateMotivation, resolveCommissionRate } from '@/lib/motivation/motivationCalculator'

export class MotivationCalculatorService {
  private getCommissionRate(turnover: number): number {
    return resolveCommissionRate(turnover, MOTIVATION_GRADE_PRESETS.map((g) => ({
      minTurnover: g.minTurnover,
      maxTurnover: g.maxTurnover ?? null,
      commissionRate: g.commissionRate ?? (g as any).percent ?? 0,
    })))
  }

  async calculateIncomeForecast(userId: string) {
    // 1. Get User & Goal
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { monthlyGoal: true, role: true }
    })

    if (!user) {
       // Return empty structure instead of crashing
       return {
         sales: { current: 0, projected: 0, optimistic: 0, goal: 0, focusDealsAmount: 0 },
         rates: { current: 0.05, projected: 0.05, optimistic: 0.05 },
         income: { current: 0, projected: 0, optimistic: 0, projectedGrowth: 0, potentialGrowth: 0 },
         grades: MOTIVATION_GRADE_PRESETS
       }
    }
    const monthlyGoal = Number(user.monthlyGoal || 0)

    // 2. Get Current Sales (Fact)
    const today = new Date()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

    const reports = await prisma.report.findMany({
      where: {
        userId: userId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      select: { monthlySalesAmount: true }
    })

    const currentSales = reports.reduce((sum, r) => sum + Number(r.monthlySalesAmount), 0)

    // 3. Get Open Deals (Both Focus and Non-Focus)
    const openDeals = await prisma.deal.findMany({
      where: {
        managerId: userId,
        status: 'OPEN'
      },
      select: {
        id: true,
        title: true,
        budget: true,
        isFocus: true,
        createdAt: true
      },
      orderBy: { budget: 'desc' }
    })

    const potentialFocusAmount = openDeals
        .filter(d => d.isFocus)
        .reduce((sum, d) => sum + Number(d.budget), 0)

    // 4. Calculations
    
    // A. FACT
    const currentRate = this.getCommissionRate(currentSales)
    const currentCommission = currentSales * currentRate

    // B. FORECAST (Linear extrapolation)
    const forecastMetrics = calculateMonthlyForecast(currentSales, monthlyGoal)
    const projectedSales = forecastMetrics.projected
    const projectedRate = this.getCommissionRate(projectedSales)
    const projectedCommission = projectedSales * projectedRate

    // C. POTENTIAL (Forecast + Focus Deals)
    // Assumption: Focus deals are closed ON TOP of the linear forecast? 
    // Or are they part of the "remaining" goal?
    // Usually, "Focus" means "I will close these specific deals".
    // Let's add them to the projected total to show "Optimistic" scenario.
    const optimisticSales = projectedSales + potentialFocusAmount
    const optimisticRate = this.getCommissionRate(optimisticSales)
    const optimisticCommission = optimisticSales * optimisticRate

    return {
      sales: {
        current: currentSales,
        projected: projectedSales,
        optimistic: optimisticSales,
        goal: monthlyGoal,
        focusDealsAmount: potentialFocusAmount
      },
      rates: {
        current: currentRate,
        projected: projectedRate,
        optimistic: optimisticRate
      },
      income: {
        current: currentCommission,
        projected: projectedCommission,
        optimistic: optimisticCommission,
        projectedGrowth: projectedCommission - currentCommission,
        potentialGrowth: optimisticCommission - projectedCommission
      },
      grades: MOTIVATION_GRADE_PRESETS.map((g) => ({ min: g.minTurnover, percent: g.commissionRate })),
      deals: openDeals // Return the list for the UI
    }
  }
}
