'use client'

import { useState, useEffect, useRef } from 'react'
import { TrendingUp, Phone, Target, ArrowUpRight, Play, Power } from 'lucide-react'
import { Toaster } from 'sonner'
import { simulateFullUpdate, type TVData as SimulatorTVData, getDemoDataset } from '@/lib/utils/demoDataSimulator'
import { handleDemoEvent } from '@/lib/utils/demoEventHandler'

// --- ANIMATION HOOK ---

function useAnimatedNumber(target: number, duration = 1000) {
  const [current, setCurrent] = useState(target)
  const animationRef = useRef<number | null>(null)
  const startRef = useRef(current)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (current === target) return

    startRef.current = current
    startTimeRef.current = null

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const nextValue = startRef.current + (target - startRef.current) * easeOut

      setCurrent(Math.round(nextValue))

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setCurrent(target)
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [target, duration, current])

  return current
}

// --- TYPES ---

interface TVData {
  kpi: {
    sales: number
    deals: number
    calls: number
    appointments: number
    conversionRate: number
    averageDealSize: number
    trends: {
      sales: number
      deals: number
      calls: number
      appointments: number
      conversionRate: number
      averageDealSize: number
    }
  }
  leaderboard: Array<{
    id: string
    rank: number
    name: string
    sales: number
    deals: number
    goal: number
    progress: number
  }>
  feed: Array<any>
}

interface LeaderRowProps {
  emp: {
    id: string
    name: string
    amount: number
    avatar: string
  }
  index: number
  max: number
}

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  trend?: string
  highlight?: boolean
}

// --- HELPER FUNCTIONS ---

const formatCompact = (num: number) => {
  return new Intl.NumberFormat('ru-RU', {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1
  }).format(num)
}

const formatStandard = (num: number) => {
  return new Intl.NumberFormat('ru-RU').format(num)
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// --- LOADING SCREEN ---

const LoadingScreen = () => (
  <div className="h-screen w-screen bg-[var(--background)] flex items-center justify-center transition-colors">
    <div className="text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-4 border-[var(--primary)] border-t-transparent mb-6 mx-auto" />
      <p className="text-[var(--muted-foreground)] text-2xl font-semibold">Загрузка TV Dashboard...</p>
    </div>
  </div>
)

// --- LEADER ROW COMPONENT ---

const LeaderRow = ({ emp, index, max }: LeaderRowProps) => {
  const percent = (emp.amount / max) * 100
  const isTop = index < 3
  const animatedAmount = useAnimatedNumber(emp.amount, 800)

  const rankColors = [
    'text-yellow-500 bg-yellow-50',
    'text-[var(--muted-foreground)] bg-[var(--muted)]',
    'text-orange-500 bg-orange-50',
  ]
  const rankStyle = rankColors[index] || 'text-[var(--muted-foreground)] bg-transparent'

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-[2vh] py-[1vh] border-b border-slate-50 last:border-0 animate-fadeIn">
      <div className={`w-[4vh] h-[4vh] rounded-xl flex items-center justify-center text-[2vh] font-bold ${rankStyle} transition-all duration-300`}>
        {index + 1}
      </div>

      <div className="flex flex-col justify-center overflow-hidden min-w-0">
        <div className={`text-[2.2vh] font-bold truncate leading-tight mb-[0.5vh] ${isTop ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
          {emp.name}
        </div>
        <div className="h-[0.6vh] w-full bg-[var(--muted)] rounded-full overflow-hidden">
           <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${index === 0 ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`}
              style={{ width: `${percent}%` }}
            />
        </div>
      </div>

      <div className="text-right whitespace-nowrap">
        <div className={`text-[2.5vh] font-bold font-mono tabular-nums leading-none ${isTop ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'} transition-colors duration-300`}>
          {formatStandard(animatedAmount)}
        </div>
      </div>
    </div>
  )
}

// --- STAT CARD COMPONENT ---

const StatCard = ({ label, value, icon: Icon, trend, highlight }: StatCardProps) => {
  const numericValue = typeof value === 'number' ? value : parseInt(String(value).replace(/\D/g, ''), 10) || 0
  const animatedValue = useAnimatedNumber(numericValue, 1000)
  const displayValue = typeof value === 'string' && value.includes('%')
    ? `${animatedValue}%`
    : typeof value === 'number'
      ? animatedValue
      : value

  return (
    <div className="bg-[var(--card)] rounded-[3vh] p-[2.5vh] flex flex-col justify-between relative overflow-hidden shadow-[var(--shadow-sm)] border border-[var(--border)] animate-fadeIn transition-colors">
      {highlight && (
        <div className="absolute inset-0 border-[0.4vh] border-indigo-500/10 rounded-[3vh] pointer-events-none animate-pulse" />
      )}
      <div className="flex justify-between items-start">
        <div className="text-[1.8vh] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">{label}</div>
        <Icon className={`w-[3vh] h-[3vh] transition-colors duration-500 ${highlight ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`} />
      </div>
      <div className="flex items-end gap-[1.5vh]">
      <div className={`text-[6.5vh] font-bold leading-none tabular-nums tracking-tight transition-colors duration-300 ${highlight ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'}`}>
          {displayValue}
        </div>
        {trend && (
          <div className="text-[1.8vh] font-bold text-emerald-600 mb-[1vh] bg-emerald-50 px-[1vh] py-[0.2vh] rounded-md animate-bounce-subtle">
            {trend}
          </div>
        )}
      </div>
    </div>
  )
}

// --- MAIN DASHBOARD COMPONENT ---

export default function TVDashboardNew() {
  const [data, setData] = useState<TVData | null>(getDemoDataset())
  const [isConnected, setIsConnected] = useState(false)
  const [time, setTime] = useState(new Date())
  const [isDemoMode, setIsDemoMode] = useState(true)
  const demoIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate metrics BEFORE conditional return (must call hooks in same order)
  const revenue = data?.kpi.sales ?? 0
  const calls = data?.kpi.calls ?? 0
  const deals = data?.kpi.deals ?? 0
  const conversion = data ? Math.round(data.kpi.conversionRate) : 0

  // Animated values (must be called before any conditional returns)
  const animatedRevenue = useAnimatedNumber(revenue, 1500)

  // Data connection: SSE (Live) or Demo Mode
  useEffect(() => {
    let eventSource: EventSource | null = null

    const connectSSE = () => {
      if (isDemoMode) return // Don't connect SSE in demo mode

      try {
        eventSource = new EventSource('/api/tv')

        eventSource.onopen = () => {
          console.log('SSE Connected')
          setIsConnected(true)
        }

        eventSource.onmessage = (event) => {
          try {
            const newData = JSON.parse(event.data)
            setData(newData)
          } catch (error) {
            console.error('Failed to parse SSE data:', error)
          }
        }

        eventSource.onerror = () => {
          console.error('SSE connection error')
          setIsConnected(false)
          eventSource?.close()
          setTimeout(connectSSE, 5000)
        }
      } catch (error) {
        console.error('Failed to create SSE connection:', error)
        setTimeout(connectSSE, 5000)
      }
    }

    if (!isDemoMode) {
      connectSSE()
    }

    return () => {
      eventSource?.close()
    }
  }, [isDemoMode])

  // Demo mode simulation
  useEffect(() => {
    if (!isDemoMode) {
      // Clear demo interval if switching back to live mode
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current)
        demoIntervalRef.current = null
      }
      return
    }

    // Initialize demo mode with snapshot data
    const initDemoMode = async () => {
      try {
        const response = await fetch('/api/tv-snapshot')
        const initialData = await response.json()
        setData(initialData)
        setIsConnected(true)
        console.log('Demo mode initialized')
      } catch (error) {
        console.error('Failed to initialize demo mode:', error)
      }
    }

    initDemoMode()

    // Start simulation loop (every 4 seconds)
    demoIntervalRef.current = setInterval(() => {
      setData((currentData) => {
        if (!currentData) return currentData

        const { data: newData, event } = simulateFullUpdate(currentData as SimulatorTVData)

        // Handle event if generated
        if (event) {
          handleDemoEvent(event)
        }

        return newData
      })
    }, 4000)

    return () => {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current)
        demoIntervalRef.current = null
      }
    }
  }, [isDemoMode])

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Loading state (after all hooks)
  if (!data) {
    return <LoadingScreen />
  }

  // Calculate additional metrics
  const GOAL = data.leaderboard[0]?.goal || 1500000
  const progressPercent = Math.min(100, (revenue / GOAL) * 100)

  // Prepare leaderboard (top 6)
  const leaderboard = data.leaderboard.slice(0, 6).map(emp => ({
    id: emp.id,
    name: emp.name,
    amount: emp.sales,
    avatar: getInitials(emp.name)
  }))

  // Calculate trends
  const callsTrend = data.kpi.trends.calls > 0 ? `+${data.kpi.trends.calls}%` : undefined
  const dealsTrend = data.kpi.trends.deals > 0 ? `+${data.kpi.trends.deals}` : undefined

  return (
    <div className="h-screen w-screen bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden flex flex-col p-[3vh] transition-colors">

      {/* HEADER */}
      <header className="h-[6vh] flex justify-between items-end px-[1vh] mb-[2vh]">
        <div className="flex items-center gap-[3vh]">
           <h1 className="text-[2.2vh] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
             Sales Department
           </h1>
           {/* Demo Mode Toggle */}
           <button
             onClick={() => setIsDemoMode(!isDemoMode)}
             className={`flex items-center gap-[1vh] px-[2vh] py-[1vh] rounded-full text-[1.8vh] font-bold uppercase tracking-wider transition-all duration-300 ${
               isDemoMode
                 ? 'bg-gradient-to-r from-[var(--primary)] to-[var(--info)] text-white shadow-lg shadow-[var(--primary)]/30 animate-pulse'
                 : 'bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--card)] border border-[var(--border)]'
             }`}
           >
             {isDemoMode ? (
               <>
                 <Play className="w-[2vh] h-[2vh]" />
                 <span>DEMO</span>
               </>
             ) : (
               <>
                 <Power className="w-[2vh] h-[2vh]" />
                 <span>LIVE</span>
               </>
             )}
           </button>
        </div>
        <div className="flex items-center gap-[2vh]">
          <span className="text-[2.2vh] font-medium text-[var(--muted-foreground)] uppercase tracking-widest">
            {time.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <span className="text-[3vh] font-bold tabular-nums text-[var(--foreground)]">
            {time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="flex-1 grid grid-cols-12 grid-rows-6 gap-[2.5vh]">

        {/* === ZONE A: REVENUE (HERO) === */}
        <div className="col-span-8 row-span-4 bg-[var(--card)] rounded-[3vh] relative overflow-hidden flex flex-col justify-center items-center shadow-[var(--shadow-md)] border border-[var(--border)] transition-colors">
          <div
            className="absolute bottom-0 left-0 w-full bg-[var(--primary)]/10 transition-all duration-[2000ms] ease-out z-0"
            style={{ height: `${progressPercent}%` }}
          />

          <div className="relative z-10 flex flex-col items-center text-center w-full px-4 animate-fadeIn">
            <div className="text-[2.5vh] font-bold text-[var(--muted-foreground)] uppercase tracking-[0.15em] mb-[1vh]">
              Выручка сегодня
            </div>

            <div className="flex items-baseline justify-center gap-[1vh] leading-none">
              <span className="text-[16vh] font-bold tracking-tight tabular-nums text-[var(--foreground)] transition-all duration-500">
                {formatCompact(animatedRevenue)}
              </span>
              <span className="text-[6vh] font-medium text-[var(--muted-foreground)]">₽</span>
            </div>

            <div className="mt-[4vh] flex items-center gap-[1.5vh] bg-[var(--card)]/80 backdrop-blur-md px-[3vh] py-[1.2vh] rounded-full border border-[var(--border)] shadow-sm">
              <Target className="w-[2.5vh] h-[2.5vh] text-[var(--primary)] animate-pulse" />
              <span className="text-[2vh] font-semibold text-[var(--foreground)] tabular-nums">
                Цель: {formatCompact(GOAL)} ₽ ({Math.round(progressPercent)}%)
              </span>
            </div>
          </div>
        </div>

        {/* === ZONE C: LEADERBOARD (FIXED) === */}
        <div className="col-span-4 row-span-6 bg-[var(--card)] rounded-[3vh] p-[3vh] flex flex-col shadow-[var(--shadow-md)] border border-[var(--border)] transition-colors">
          <div className="flex justify-between items-center mb-[2vh] pb-[2vh] border-b border-[var(--border)]">
            <h2 className="text-[2.5vh] font-bold text-[var(--foreground)]">Лидеры</h2>
            <div className="bg-[var(--primary)]/10 text-[var(--primary)] px-[1.5vh] py-[0.5vh] rounded-full text-[1.5vh] font-bold uppercase tracking-wider">
              Top 6
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-[1vh]">
            {leaderboard.map((emp, index) => (
              <LeaderRow
                key={emp.id}
                emp={emp}
                index={index}
                max={leaderboard[0]?.amount || 1}
              />
            ))}
          </div>
        </div>

        {/* === ZONE B: METRICS === */}
        <div className="col-span-8 row-span-2 grid grid-cols-3 gap-[2.5vh]">
          <StatCard
            label="Звонки"
            value={calls}
            icon={Phone}
            trend={callsTrend}
          />
          <StatCard
            label="Сделки"
            value={deals}
            icon={TrendingUp}
            trend={dealsTrend}
            highlight
          />
          <StatCard
            label="Конверсия"
            value={`${conversion}%`}
            icon={ArrowUpRight}
          />
        </div>

      </div>

      {/* Connection indicator */}
      <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-[var(--card)]/90 backdrop-blur-md rounded-full border border-[var(--border)] shadow-lg transition-colors">
        <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`} />
        <span className="text-sm font-medium text-[var(--foreground)]">
          {isDemoMode ? 'Demo' : isConnected ? 'Live' : 'Reconnecting...'}
        </span>
      </div>

      {/* Toaster for notifications */}
      <Toaster
        position="top-right"
        expand={true}
        richColors
        closeButton
      />
    </div>
  )
}
