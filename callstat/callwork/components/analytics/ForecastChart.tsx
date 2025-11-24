'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Legend } from 'recharts'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Target, Calendar } from 'lucide-react'

interface ForecastData {
  forecast: {
    current: number
    goal: number
    projected: number
    completion: number
    pacing: number
    isPacingGood: boolean
    daysInMonth: number
    daysPassed: number
    daysRemaining: number
    dailyAverage: number
    dailyRequired: number
    expectedByNow: number
  }
  chartData: Array<{
    day: number
    plan?: number
    actual?: number
    forecast?: number
  }>
}

interface ForecastChartProps {
  data: ForecastData
  userName?: string
}

export function ForecastChart({ data, userName }: ForecastChartProps) {
  const { forecast, chartData } = data

  // Форматирование денег
  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Кастомный Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null

    const data = payload[0].payload

    return (
      <div className="bg-[var(--card)] p-4 rounded-xl shadow-xl border border-[var(--border)] backdrop-blur-md">
        <p className="font-semibold mb-2 text-[var(--foreground)]">День {data.day}</p>
        {data.plan && (
          <p className="text-sm text-[var(--muted-foreground)]">
            <span className="inline-block w-3 h-3 bg-[var(--muted-foreground)] rounded-full mr-2"></span>
            План: <strong>{formatMoney(data.plan)}</strong>
          </p>
        )}
        {data.actual && (
          <p className="text-sm text-[var(--primary)]">
            <span className="inline-block w-3 h-3 bg-[var(--primary)] rounded-full mr-2"></span>
            Факт: <strong>{formatMoney(data.actual)}</strong>
          </p>
        )}
        {data.forecast && (
          <p className="text-sm text-[var(--warning)]">
            <span className="inline-block w-3 h-3 bg-[var(--warning)] rounded-full mr-2"></span>
            Прогноз: <strong>{formatMoney(data.forecast)}</strong>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div>
        <h2 className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">
          Прогноз выполнения плана
          {userName && <span className="text-[var(--muted-foreground)] ml-2">— {userName}</span>}
        </h2>
        <p className="text-[var(--muted-foreground)] mt-2">
          {forecast.daysPassed} из {forecast.daysInMonth} дней прошло
        </p>
      </div>

      {/* KPI Карточки */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Текущие продажи */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 bg-[var(--primary)]/10 rounded-[16px] border border-[var(--primary)]/20 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[var(--primary)] rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[var(--primary-foreground)]" />
            </div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">Факт на сегодня</p>
          </div>
          <p className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">{formatMoney(forecast.current)}</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            Средняя за день: {formatMoney(forecast.dailyAverage)}
          </p>
        </motion.div>

        {/* Прогноз */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-6 bg-[var(--warning)]/10 rounded-[16px] border border-[var(--warning)]/20 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[var(--warning)] rounded-full flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">Прогноз на конец месяца</p>
          </div>
          <p className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">{formatMoney(forecast.projected)}</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            {forecast.completion}% от плана ({formatMoney(forecast.goal)})
          </p>
        </motion.div>

        {/* Темп */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`p-6 rounded-[16px] border-2 ${forecast.isPacingGood
              ? 'bg-[var(--success)]/10 border-[var(--success)]/20 shadow-sm'
              : 'bg-[var(--danger)]/10 border-[var(--danger)]/20 shadow-sm'
            }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${forecast.isPacingGood ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
              }`}>
              {forecast.isPacingGood ? (
                <TrendingUp className="w-5 h-5 text-white" />
              ) : (
                <TrendingDown className="w-5 h-5 text-white" />
              )}
            </div>
            <p className="text-sm font-medium text-[var(--muted-foreground)]">Темп выполнения</p>
          </div>
          <p className={`text-3xl font-semibold tracking-tight ${forecast.isPacingGood ? 'text-[var(--success)]' : 'text-[var(--danger)]'
            }`}>
            {forecast.pacing > 0 ? '+' : ''}{forecast.pacing}%
          </p>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            {forecast.isPacingGood ? 'Опережаем план' : 'Отстаём от плана'}
          </p>
        </motion.div>
      </div>

      {/* График */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass-card rounded-[16px] p-6 border border-[var(--border)] shadow-sm"
      >
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
              dataKey="day"
              stroke="var(--muted-foreground)"
              style={{ fontSize: '12px', fontFamily: 'system-ui' }}
              label={{ value: 'День месяца', position: 'insideBottom', offset: -5, fill: 'var(--muted-foreground)' }}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              style={{ fontSize: '12px', fontFamily: 'system-ui' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}к`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />

            {/* Линия плана (серый пунктир) */}
            <Line
              type="monotone"
              dataKey="plan"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeDasharray="5 5"
              name="План"
              dot={false}
            />

            {/* Линия факта (синяя) */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="var(--primary)"
              strokeWidth={3}
              name="Факт"
              dot={{ fill: 'var(--primary)', r: 4 }}
            />

            {/* Линия прогноза (оранжевый пунктир) */}
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="var(--warning)"
              strokeWidth={2}
              strokeDasharray="3 3"
              name="Прогноз"
              dot={false}
            />

            {/* Референсная линия цели */}
            <ReferenceLine
              y={forecast.goal}
              stroke="var(--success)"
              strokeWidth={2}
              strokeDasharray="3 3"
              label={{ value: 'Цель', position: 'right', fill: 'var(--success)', fontWeight: 'bold' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Дополнительная аналитика */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 bg-[var(--secondary)] rounded-[16px]">
          <h3 className="font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Для достижения цели
          </h3>
          <p className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">
            {formatMoney(forecast.dailyRequired)}
          </p>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            в день в оставшиеся {forecast.daysRemaining} дней
          </p>
        </div>

        <div className="p-6 bg-[var(--secondary)] rounded-[16px]">
          <h3 className="font-semibold text-[var(--foreground)] mb-2">Ожидалось к текущему дню</h3>
          <p className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">
            {formatMoney(forecast.expectedByNow)}
          </p>
          <p className={`text-sm mt-2 font-medium ${forecast.current >= forecast.expectedByNow ? 'text-[var(--success)]' : 'text-[var(--danger)]'
            }`}>
            {forecast.current >= forecast.expectedByNow ? 'Выше плана' : 'Ниже плана'} на{' '}
            {formatMoney(Math.abs(forecast.current - forecast.expectedByNow))}
          </p>
        </div>
      </div>
    </div>
  )
}
