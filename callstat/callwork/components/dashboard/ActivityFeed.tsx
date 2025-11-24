'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, TrendingUp, FileText, AlertTriangle } from 'lucide-react'

interface ActivityItem {
  id: string
  type: 'deal' | 'report' | 'alert'
  message: string
  details?: string
  timestamp: string
  userId: string
  userName: string
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Загрузить начальные активности
    fetchActivities()

    // Подключиться к SSE для real-time updates
    const eventSource = new EventSource('/api/sse/activities')

    eventSource.onmessage = (event) => {
      try {
        const newActivity = JSON.parse(event.data)
        setActivities(prev => [newActivity, ...prev].slice(0, 20)) // Последние 20
      } catch (error) {
        console.error('Failed to parse SSE activity:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [])

  async function fetchActivities() {
    try {
      const res = await fetch('/api/activities/recent?limit=20')
      const data = await res.json()
      setActivities(data.activities)
    } catch (error) {
      console.error('Failed to fetch activities:', error)
    } finally {
      setLoading(false)
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'deal':
        return TrendingUp
      case 'alert':
        return AlertTriangle
      case 'report':
      default:
        return FileText
    }
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'deal':
        return 'text-[var(--success)] bg-[var(--success)]/10'
      case 'alert':
        return 'text-[var(--danger)] bg-[var(--danger)]/10'
      case 'report':
      default:
        return 'text-[var(--primary)] bg-[var(--primary)]/10'
    }
  }

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date()
    const past = new Date(timestamp)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return past.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
  }

  if (loading) {
    return (
      <div className="glass-card p-6 h-[600px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
      </div>
    )
  }

  return (
    <div className="glass-card p-6 h-[600px] overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-[var(--muted-foreground)]" />
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Recent Activity</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent">
        <AnimatePresence mode="popLayout">
          {activities.map((activity, index) => {
            const Icon = getActivityIcon(activity.type)
            const colorClass = getActivityColor(activity.type)

            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-start gap-3 p-3 rounded-xl hover:bg-[var(--secondary)] transition-colors"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)]">{activity.message}</p>
                  {activity.details && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">{activity.details}</p>
                  )}
                  <p className="text-xs text-[var(--muted-foreground)] mt-1 opacity-70">
                    {formatTimeAgo(activity.timestamp)}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
