import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireManager } from '@/lib/auth/get-session'
import { calculateConversions } from '@/lib/analytics/conversions'
import { CONVERSION_BENCHMARKS } from '@/lib/config/conversionBenchmarks'
import { calculateManagerStats } from '@/lib/analytics/funnel'

export async function GET(request: Request) {
  try {
    const manager = await requireManager()
    const { searchParams } = new URL(request.url)
    
    const startDate = searchParams.get('startDate') 
      ? new Date(searchParams.get('startDate')!) 
      : new Date(new Date().setMonth(new Date().getMonth() - 1))
    const endDate = searchParams.get('endDate') 
      ? new Date(searchParams.get('endDate')!) 
      : new Date()
    
    // Получить всех работников менеджера
    const employees = await prisma.user.findMany({
      where: {
        managerId: manager.id,
        role: 'EMPLOYEE'
      },
      include: {
        reports: {
          where: {
            date: {
              gte: startDate,
              lte: endDate
            }
          },
          orderBy: { date: 'desc' }
        }
      }
    })

    // --- РАСЧЕТ ОБЩЕЙ СТАТИСТИКИ КОМАНДЫ (Менеджер + Сотрудники) ---
    
    // 1. Получаем отчеты всей команды (включая менеджера) для корректного факта
    const teamUserIds = [manager.id, ...employees.map(e => e.id)]
    const allTeamReports = await prisma.report.findMany({
      where: {
        userId: { in: teamUserIds },
        date: {
          gte: startDate,
          lte: endDate
        }
      }
    })

    // 2. Считаем статистику по всем отчетам
    const teamStatsRaw = await calculateManagerStats(allTeamReports, manager.id)
    
    // 3. Добавляем расчеты конверсий для команды
    const teamConversions = calculateConversions({
      zoomBooked: teamStatsRaw.zoomBooked,
      zoom1Held: teamStatsRaw.zoom1Held,
      zoom2Held: teamStatsRaw.zoom2Held,
      contractReview: teamStatsRaw.contractReview,
      pushCount: teamStatsRaw.pushCount,
      successfulDeals: teamStatsRaw.successfulDeals,
      monthlySalesAmount: teamStatsRaw.salesAmount,
    })

    const teamStats = {
      ...teamStatsRaw,
      // Гарантируем что план берется из GoalService (уже внутри calculateManagerStats, но явно для надежности)
      planSales: teamStatsRaw.planSales, 
      planDeals: teamStatsRaw.planDeals,
      bookedToZoom1: teamConversions.bookedToZoom1,
      zoom1ToZoom2: teamConversions.zoom1ToZoom2,
      zoom2ToContract: teamConversions.zoom2ToContract,
      contractToPush: teamConversions.contractToPush,
      pushToDeal: teamConversions.pushToDeal,
      northStar: teamConversions.northStar,
    }
    
    // ----------------------------------------------------------------

    // Для каждого работника посчитать статистику
    const employeesWithStats = await Promise.all(
      employees.map(async (employee) => {
        const stats = await calculateManagerStats(employee.reports, employee.id)
        const conversions = calculateConversions({
          zoomBooked: stats.zoomBooked,
          zoom1Held: stats.zoom1Held,
          zoom2Held: stats.zoom2Held,
          contractReview: stats.contractReview,
          pushCount: stats.pushCount,
          successfulDeals: stats.successfulDeals,
          monthlySalesAmount: stats.salesAmount,
        })

        return {
          ...employee,
          ...stats,
          planSales: stats.planSales,
          planDeals: stats.planDeals,
          hasRedZone:
            conversions.zoom1ToZoom2 < CONVERSION_BENCHMARKS.ZOOM1_TO_ZOOM2 ||
            conversions.pushToDeal < CONVERSION_BENCHMARKS.PUSH_TO_DEAL,
        }
      })
    )
    
    return NextResponse.json({ 
      employees: employeesWithStats,
      teamStats // Возвращаем общую статистику
    })
  } catch (error) {
    console.error('GET /api/employees error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    )
  }
}
