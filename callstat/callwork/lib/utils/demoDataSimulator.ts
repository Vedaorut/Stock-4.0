/**
 * Demo Data Simulator - для выставочного режима TV Dashboard
 *
 * Генерирует мягкие изменения данных на базе единого демо-датасета,
 * чтобы все экраны использовали один источник правды.
 */
import { cloneDemoTvData } from '@/lib/demoData'

// --- TYPES ---

export interface TVData {
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

export type DemoEventType = 'NEW_DEAL' | 'NEW_CALL' | 'MILESTONE' | 'POSITION_CHANGE'

export interface DemoEvent {
  type: DemoEventType
  data: {
    employeeName?: string
    amount?: number
    position?: { from: number; to: number }
    milestone?: string
    totalSales?: number
  }
}

// --- SIMULATOR FUNCTIONS ---

/**
 * Симулирует изменения KPI с реалистичными колебаниями
 */
export function simulateKPIChange(currentData: TVData): TVData {
  const newData = JSON.parse(JSON.stringify(currentData || cloneDemoTvData())) as TVData

  // Изменения выручки: ±10k-50k₽
  const salesDelta = Math.floor(Math.random() * 40000) + 10000
  const salesIncrease = Math.random() > 0.3 // 70% вероятность роста
  newData.kpi.sales += salesIncrease ? salesDelta : -salesDelta / 2

  // Изменения звонков: ±1-3
  if (Math.random() > 0.4) {
    const callsDelta = Math.floor(Math.random() * 3) + 1
    newData.kpi.calls += callsDelta
  }

  // Изменения сделок: ±1 (реже)
  if (Math.random() > 0.7) {
    newData.kpi.deals += 1
  }

  // Изменения встреч: ±1 (реже)
  if (Math.random() > 0.6) {
    newData.kpi.appointments += 1
  }

  // Пересчет конверсии
  if (newData.kpi.calls > 0) {
    newData.kpi.conversionRate = (newData.kpi.deals / newData.kpi.calls) * 100
  }

  // Пересчет среднего чека
  if (newData.kpi.deals > 0) {
    newData.kpi.averageDealSize = newData.kpi.sales / newData.kpi.deals
  }

  // Обновление трендов (для визуальных эффектов)
  newData.kpi.trends.sales = salesIncrease ? Math.floor(Math.random() * 5) + 3 : 0
  newData.kpi.trends.calls = Math.random() > 0.5 ? Math.floor(Math.random() * 5) + 2 : 0
  newData.kpi.trends.deals = Math.random() > 0.7 ? 1 : 0

  return newData
}

/**
 * Симулирует изменения в таблице лидеров
 */
export function simulateLeaderboardChange(leaderboard: TVData['leaderboard']): TVData['leaderboard'] {
  const newLeaderboard = JSON.parse(JSON.stringify(leaderboard.length ? leaderboard : cloneDemoTvData().leaderboard))

  // Выбираем случайного сотрудника (не первого, чтобы была динамика)
  const randomIndex = Math.floor(Math.random() * (newLeaderboard.length - 1)) + 1
  const employee = newLeaderboard[randomIndex]

  // Увеличиваем продажи на 50k-150k₽
  const salesIncrease = Math.floor(Math.random() * 100000) + 50000
  employee.sales += salesIncrease
  employee.deals += 1
  employee.progress = (employee.sales / employee.goal) * 100

  // Пересортировка и обновление рангов
  newLeaderboard.sort((a: typeof newLeaderboard[0], b: typeof newLeaderboard[0]) => b.sales - a.sales)
  newLeaderboard.forEach((emp: typeof newLeaderboard[0], idx: number) => {
    emp.rank = idx + 1
  })

  return newLeaderboard
}

/**
 * Генерирует случайное событие для показа
 */
export function generateRandomEvent(currentData: TVData): DemoEvent | null {
  const random = Math.random()

  // 20% - Новая сделка
  if (random < 0.2) {
    const employee = currentData.leaderboard[Math.floor(Math.random() * Math.min(3, currentData.leaderboard.length))]
    const dealAmount = Math.floor(Math.random() * 100000) + 50000

    return {
      type: 'NEW_DEAL',
      data: {
        employeeName: employee.name,
        amount: dealAmount
      }
    }
  }

  // 10% - Новый звонок (реже, чтобы не спамить)
  if (random >= 0.2 && random < 0.3) {
    const employee = currentData.leaderboard[Math.floor(Math.random() * currentData.leaderboard.length)]

    return {
      type: 'NEW_CALL',
      data: {
        employeeName: employee.name
      }
    }
  }

  // 5% - Milestone достигнут
  if (random >= 0.3 && random < 0.35) {
    const milestones = [
      { threshold: 500000, text: '500K ₽' },
      { threshold: 1000000, text: '1M ₽' },
      { threshold: 1500000, text: '1.5M ₽' },
      { threshold: 2000000, text: '2M ₽' }
    ]

    const milestone = milestones[Math.floor(Math.random() * milestones.length)]

    return {
      type: 'MILESTONE',
      data: {
        milestone: milestone.text,
        totalSales: currentData.kpi.sales
      }
    }
  }

  // 5% - Изменение позиции в топе
  if (random >= 0.35 && random < 0.4) {
    const fromPos = Math.floor(Math.random() * (currentData.leaderboard.length - 1)) + 2
    const toPos = fromPos - 1

    return {
      type: 'POSITION_CHANGE',
      data: {
        employeeName: currentData.leaderboard[fromPos - 1]?.name || 'Сотрудник',
        position: { from: fromPos, to: toPos }
      }
    }
  }

  // 60% - Без события
  return null
}

/**
 * Полное обновление данных + генерация события
 */
export function simulateFullUpdate(currentData: TVData): {
  data: TVData
  event: DemoEvent | null
} {
  const seed = currentData || cloneDemoTvData()
  // 1. Обновляем KPI
  const newData = simulateKPIChange(seed)

  // 2. Обновляем leaderboard (50% вероятность)
  if (Math.random() > 0.5) {
    newData.leaderboard = simulateLeaderboardChange(newData.leaderboard)
  }

  // 3. Генерируем событие
  const event = generateRandomEvent(newData)

  return { data: newData, event }
}

export function getDemoDataset(): TVData {
  return cloneDemoTvData()
}
