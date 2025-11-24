'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { PulseGrid } from '@/components/dashboard/PulseGrid'
import { FunnelChart } from '@/components/analytics/FunnelChart'
import { ManagersTable } from '@/components/analytics/ManagersTable'
import { RedZoneAlerts } from '@/components/analytics/RedZoneAlerts'
import { PerformanceTrendChart } from '@/components/charts/PerformanceTrendChart'
import { MotivationWidget } from '@/components/dashboard/MotivationWidget'
import { DealsList, DealCard } from '@/components/deals/DealsList'
import { calculateManagerStatsClient, getFunnelData, ManagerStats, analyzeRedZones } from '@/lib/analytics/funnel.client'
import { calculateFullFunnel, NorthStarKpi } from '@/lib/calculations/funnel'
import { PeriodSelector, PeriodPreset } from '@/components/filters/PeriodSelector'
import { ManagerSelector } from '@/components/filters/ManagerSelector'
import { RightPanelControls } from '@/components/dashboard/RightPanelControls'
import { MotivationCalculationResult } from '@/lib/motivation/motivationCalculator'
import { MotivationGradeConfig } from '@/lib/config/motivationGrades'

interface User {
  id: string
  name: string
  email: string
  role: 'MANAGER' | 'EMPLOYEE'
}

interface DashboardContentProps {
  user: User
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

export function DashboardContent({ user }: DashboardContentProps) {
  const router = useRouter()
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [managerStats, setManagerStats] = useState<ManagerStats[]>([])
  const [teamFunnel, setTeamFunnel] = useState<any[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [teamStats, setTeamStats] = useState<any>(null)
  const [northStarKpi, setNorthStarKpi] = useState<NorthStarKpi | null>(null)
  const [rawEmployees, setRawEmployees] = useState<any[]>([])
  const [motivationData, setMotivationData] = useState<MotivationCalculationResult | null>(null)
  const [motivationGrades, setMotivationGrades] = useState<MotivationGradeConfig[]>([])
  const [motivationLoading, setMotivationLoading] = useState(false)
  const [motivationError, setMotivationError] = useState<string | null>(null)
  const [motivationRefreshKey, setMotivationRefreshKey] = useState(0)
  const [deals, setDeals] = useState<DealCard[]>([])
  const [dealsLoading, setDealsLoading] = useState(false)
  const [dealsError, setDealsError] = useState<string | null>(null)
  const [selectedManagerId, setSelectedManagerId] = useState<string>('all')
  const [datePreset, setDatePreset] = useState<PeriodPreset>('thisMonth')
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date()
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
  })
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const headerRef = useRef<HTMLDivElement>(null)

  const handleDatePresetChange = (preset: PeriodPreset, nextRange?: { start: Date; end: Date }) => {
    setDatePreset(preset)
    if (nextRange) {
      setDateRange(nextRange)
    }
  }

  const recomputeViews = useCallback((employeesList: any[], managerFilter = selectedManagerId, serverTeamStats: any = null) => {
    const filteredEmployees =
      managerFilter === 'all'
        ? employeesList
        : employeesList.filter((emp) => emp.id === managerFilter)

    const effectiveEmployees = filteredEmployees.length > 0 ? filteredEmployees : employeesList

    const processedStats = effectiveEmployees.map((emp: any) => {
      // Используем данные напрямую из API, где уже есть правильные planSales/planDeals
      return {
        id: emp.id,
        name: emp.name,
        ...emp,
      }
    })

    setManagerStats(processedStats)

    // Если выбран "Весь отдел" и у нас есть серверная статистика (Менеджер + Сотрудники) - используем её
    // Это гарантирует совпадение плана (14 млн) и факта с прогнозами
    let tStats: any
    let teamReports: any[] = []

    if (managerFilter === 'all' && serverTeamStats) {
      tStats = { ...serverTeamStats }
      // Для графиков трендов нам все равно нужны отчеты. 
      // Так как мы не тянем отчеты менеджера в employeesList, тренд будет строиться по сотрудникам.
      // Это компромисс, но цифры KPI (сверху) будут точными (14 млн).
      teamReports = effectiveEmployees.flatMap((e: any) => e.reports || [])
    } else {
      // Если выбран конкретный сотрудник - считаем только по нему
      teamReports = effectiveEmployees.flatMap((e: any) => e.reports || [])

      // Агрегируем статистику команды из сотрудников
      const safeDiv = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

      const tStatsRaw = {
        zoomBooked: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.zoomBooked || 0), 0),
        zoom1Held: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.zoom1Held || 0), 0),
        zoom2Held: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.zoom2Held || 0), 0),
        contractReview: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.contractReview || 0), 0),
        pushCount: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.pushCount || 0), 0),
        successfulDeals: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.successfulDeals || 0), 0),
        salesAmount: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.salesAmount || 0), 0),
        planSales: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.planSales || 0), 0),
        planDeals: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.planDeals || 0), 0),
        refusals: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.refusals || 0), 0),
        warming: effectiveEmployees.reduce((sum: number, e: any) => sum + (e.warming || 0), 0),
      }

      tStats = {
        ...tStatsRaw,
        bookedToZoom1: safeDiv(tStatsRaw.zoom1Held, tStatsRaw.zoomBooked),
        zoom1ToZoom2: safeDiv(tStatsRaw.zoom2Held, tStatsRaw.zoom1Held),
        zoom2ToContract: safeDiv(tStatsRaw.contractReview, tStatsRaw.zoom2Held),
        contractToPush: safeDiv(tStatsRaw.pushCount, tStatsRaw.contractReview),
        pushToDeal: safeDiv(tStatsRaw.successfulDeals, tStatsRaw.pushCount),
        northStar: safeDiv(tStatsRaw.successfulDeals, tStatsRaw.zoom1Held),
        totalConversion: safeDiv(tStatsRaw.successfulDeals, tStatsRaw.zoomBooked),
        activityScore: 0,
        trend: 'flat'
      }

      const expectedActivity = tStatsRaw.zoomBooked > 0 ? 100 : 0
      const actualActivity = Math.min(100, Math.round((tStatsRaw.zoom1Held / Math.max(1, tStatsRaw.zoomBooked)) * 100))
      tStats.activityScore = Math.round((expectedActivity + actualActivity) / 2)

      const progress = tStatsRaw.planSales > 0 ? (tStatsRaw.salesAmount / tStatsRaw.planSales) * 100 : 0
      tStats.trend = progress >= 80 ? 'up' : progress >= 50 ? 'flat' : 'down'
    }

    setTeamStats(tStats)
    setTeamFunnel(getFunnelData(tStats))

    const { northStarKpi: teamNorthStar } = calculateFullFunnel({
      zoomBooked: tStats.zoomBooked,
      zoom1Held: tStats.zoom1Held,
      zoom2Held: tStats.zoom2Held,
      contractReview: tStats.contractReview,
      push: tStats.pushCount,
      deals: tStats.successfulDeals,
      sales: tStats.salesAmount,
      refusals: tStats.refusals,
      warming: tStats.warming,
    })
    setNorthStarKpi(teamNorthStar)

    const dailyMap = new Map<string, { date: string; sales: number; deals: number }>()
    teamReports.forEach((r: any) => {
      const d = new Date(r.date).toISOString().split('T')[0]
      if (!dailyMap.has(d)) {
        dailyMap.set(d, { date: d, sales: 0, deals: 0 })
      }
      const entry = dailyMap.get(d)!
      entry.sales += Number(r.monthlySalesAmount)
      entry.deals += r.successfulDeals
    })

    const finalTrend = Array.from(dailyMap.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((d) => ({
        ...d,
        date: new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }),
      }))
    setTrendData(finalTrend)

    const newAlerts: any[] = []
    processedStats.forEach((stat: ManagerStats) => {
      const issues = analyzeRedZones(stat)
      issues.forEach((issue) => {
        newAlerts.push({
          id: `${stat.id}-${issue.stage}`,
          type: issue.severity,
          title: `Проблема на этапе ${issue.stage}`,
          description: `${issue.metric} у сотрудника ${stat.name} составляет ${issue.value}% (Норма: ${issue.benchmark}%)`,
          managerName: stat.name,
        })
      })
    })

    if (tStats.successfulDeals === 0) {
      newAlerts.push({
        id: 'no-deals-team',
        type: 'critical',
        title: 'Отсутствие продаж',
        description: 'За выбранный период в команде не закрыто ни одной сделки.',
      })
    }

    setAlerts(newAlerts)
  }, [selectedManagerId])

  // Store server-side team stats to reuse when filtering
  const [serverTeamStats, setServerTeamStats] = useState<any>(null)

  useEffect(() => {
    async function fetchData() {
      if (user.role !== 'MANAGER') return

      try {
        const response = await fetch(
          `/api/employees?startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`
        )
        const data = await response.json()
        const employeesList = data.employees || []
        const tStats = data.teamStats || null
        
        setRawEmployees(employeesList)
        setServerTeamStats(tStats)
        recomputeViews(employeesList, selectedManagerId, tStats)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setIsInitialLoading(false)
      }
    }

    fetchData()
  }, [user.role, dateRange.start, dateRange.end, selectedManagerId]) 

  // Update recompute effect to use the stored server stats
  useEffect(() => {
    if (rawEmployees.length === 0) return
    recomputeViews(rawEmployees, selectedManagerId, serverTeamStats)
  }, [selectedManagerId, rawEmployees, serverTeamStats, recomputeViews])

  useEffect(() => {
    if (user.role !== 'MANAGER') return

    async function fetchMotivation() {
      setMotivationLoading(true)
      setMotivationError(null)
      try {
        const params = new URLSearchParams({
          managerId: selectedManagerId,
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
        })

        const response = await fetch(`/api/motivation/summary?${params.toString()}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось загрузить мотивацию')
        }

        setMotivationData({
          factTurnover: Number(data.factTurnover || 0),
          hotTurnover: Number(data.hotTurnover || 0),
          forecastTurnover: Number(data.forecastTurnover || 0),
          totalPotentialTurnover: Number(data.totalPotentialTurnover || 0),
          factRate: Number(data.factRate || 0),
          forecastRate: Number(data.forecastRate || 0),
          salaryFact: Number(data.salaryFact || 0),
          salaryForecast: Number(data.salaryForecast || 0),
          potentialGain: Number(data.potentialGain || 0),
        })
        setMotivationGrades((data.grades || []) as MotivationGradeConfig[])
      } catch (error) {
        console.error('Error fetching motivation summary:', error)
        setMotivationError(error instanceof Error ? error.message : 'Ошибка загрузки данных')
      } finally {
        setMotivationLoading(false)
      }
    }

    fetchMotivation()
  }, [user.role, selectedManagerId, dateRange.start, dateRange.end, motivationRefreshKey])

  useEffect(() => {
    if (user.role !== 'MANAGER') return

    async function fetchDeals() {
      setDealsLoading(true)
      setDealsError(null)
      try {
        const params = new URLSearchParams({
          managerId: selectedManagerId,
          status: 'OPEN',
          limit: '20',
        })
        const response = await fetch(`/api/deals?${params.toString()}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Не удалось загрузить сделки')
        }

        setDeals(
          (data.deals || []).map(
            (deal: any) =>
              ({
                ...deal,
                budget: Number(deal.budget || 0),
              }) as DealCard
          )
        )
      } catch (error) {
        console.error('Error fetching deals:', error)
        setDealsError(error instanceof Error ? error.message : 'Ошибка загрузки сделок')
      } finally {
        setDealsLoading(false)
      }
    }

    fetchDeals()
  }, [user.role, selectedManagerId, motivationRefreshKey])

  useEffect(() => {
    if (rawEmployees.length === 0) return
    recomputeViews(rawEmployees, selectedManagerId)
  }, [selectedManagerId, rawEmployees, recomputeViews])

  useEffect(() => {
    if (user.role !== 'MANAGER') {
      setIsInitialLoading(false)
    }
  }, [user.role])

  useEffect(() => {
    const handleScroll = () => {
      // Switch to side controls as soon as user scrolls down a bit (50px)
      setIsHeaderVisible(window.scrollY < 50)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const selectedManager = selectedManagerId !== 'all'
    ? rawEmployees.find((emp: any) => emp.id === selectedManagerId)
    : null

  const motivationTitle =
    selectedManagerId === 'all'
      ? 'Доход команды (Прогноз)'
      : selectedManager
        ? `Доход менеджера ${selectedManager.name}`
        : 'Мой доход (Прогноз)'

  const handleToggleFocus = async (dealId: string, nextValue: boolean) => {
    setDealsError(null)
    setDeals((prev) =>
      prev.map((deal) => (deal.id === dealId ? { ...deal, isFocus: nextValue } : deal))
    )

    try {
      const response = await fetch(`/api/deals/${dealId}/focus`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFocus: nextValue }),
      })

      if (!response.ok) {
        throw new Error('Не удалось обновить фокус')
      }

      setMotivationRefreshKey((key) => key + 1)
    } catch (error) {
      console.error('Failed to update deal focus', error)
      setDeals((prev) =>
        prev.map((deal) => (deal.id === dealId ? { ...deal, isFocus: !nextValue } : deal))
      )
      setDealsError(error instanceof Error ? error.message : 'Ошибка обновления сделки')
    }
  }

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    )
  }

  if (user.role !== 'MANAGER') {
    return (
      <div className="glass-card p-8">
        <h2 className="text-2xl font-bold mb-2 text-[var(--foreground)]">Заполните дневной отчёт</h2>
        <p className="text-[var(--muted-foreground)] mb-4">
          Для сотрудников доступен личный кабинет отчётов. Данные автоматически попадут в аналитику.
        </p>
        <button
          onClick={() => router.push('/dashboard/report')}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
        >
          Открыть форму отчёта
        </button>
      </div>
    )
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-96" 
    >
      {/* Top Controls Header - Fades out when scrolling down */}
      <motion.div 
        layout
        ref={headerRef} 
        animate={{ 
          opacity: isHeaderVisible ? 1 : 0,
          y: isHeaderVisible ? 0 : -20,
          pointerEvents: isHeaderVisible ? 'auto' : 'none'
        }}
        transition={{ duration: 0.3 }}
        className="relative z-30 bg-[var(--background)]/90 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/75 py-4 border-b border-[var(--border)] -mx-4 px-4 sm:-mx-8 sm:px-8 mb-8 transition-colors"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
           {/* Left Side: Page Title */}
           <div className="hidden md:block">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Центр управления</h2>
           </div>

           {/* Right Side: Filters */}
           <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
             <div className="w-full sm:w-auto">
                <ManagerSelector
                    managers={rawEmployees}
                    selectedManagerId={selectedManagerId}
                    onSelectManager={setSelectedManagerId}
                    title="Сотрудник"
                />
             </div>
             {/* Period selector */}
             <div className="w-full sm:w-auto">
                <PeriodSelector
                    selectedPreset={datePreset}
                    range={dateRange}
                    onPresetChange={(preset, next) => handleDatePresetChange(preset, next)}
                    title="Период"
                />
             </div>
           </div>
        </div>
      </motion.div>

      {/* Main Content Header */}
      <div className="space-y-4 pt-2">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] tracking-tight">
            Центр управления продажами
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1">
            Оперативный контроль и аналитика
          </p>
        </div>
      </div>

      {/* L1: Pulse Grid (Plan/Fact) */}
      {teamStats && (
        <PulseGrid
          stats={{
            ...teamStats,
            prevConversion: teamStats.totalConversion,
          }}
          northStarKpi={northStarKpi}
        />
      )}

      <motion.div variants={item}>
        <MotivationWidget
          title={motivationTitle}
          data={motivationData}
          grades={motivationGrades}
          loading={motivationLoading}
          onRefresh={() => setMotivationRefreshKey((key) => key + 1)}
        />
        {motivationError && (
          <p className="text-sm text-[var(--danger)] mt-2">{motivationError}</p>
        )}
      </motion.div>

      {/* L2: Management by Exception (Alerts) */}
      <AnimatePresence mode="popLayout">
        {alerts.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            layout
          >
            <RedZoneAlerts alerts={alerts} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* L3: Team Funnel (Left Column) */}
        <div className="lg:col-span-1 space-y-8">
          <motion.div variants={item} className="glass-card p-8">
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">Воронка отдела</h2>
            <FunnelChart data={teamFunnel} />
          </motion.div>
          <motion.div variants={item}>
            <DealsList
              deals={deals}
              loading={dealsLoading}
              error={dealsError}
              onToggleFocus={handleToggleFocus}
            />
          </motion.div>
        </div>

        {/* L4: Managers Efficiency (Right Column - Wider) */}
        <div className="lg:col-span-2 space-y-8">
          <motion.div variants={item} className="glass-card p-8">
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">Эффективность менеджеров</h2>
            <ManagersTable managers={managerStats} />
          </motion.div>
        </div>
      </div>

      {/* L5: Analytics & Dynamics (Bottom) - Only show if we have data */}
      <AnimatePresence mode="popLayout">
        {trendData.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            layout 
            className="glass-card p-8"
          >
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">Динамика показателей</h2>
            <PerformanceTrendChart data={trendData} className="h-[300px]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Controls - Morphing sidebar when header scrolls away */}
      <RightPanelControls
        isVisible={!isHeaderVisible}
        selectedPreset={datePreset}
        range={dateRange}
        onPresetChange={(preset, next) => handleDatePresetChange(preset, next)}
        managers={rawEmployees}
        selectedManagerId={selectedManagerId}
        onSelectManager={setSelectedManagerId}
      />

    </motion.div>
  )
}
