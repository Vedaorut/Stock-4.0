'use client'

import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  change?: number
  icon?: React.ReactNode
  subtitle?: string
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' }
  },
  hover: {
    y: -4,
    transition: { duration: 0.2 }
  }
} as const

export const KPICard = memo(function KPICard({
  title,
  value,
  change,
  icon,
  subtitle
}: KPICardProps) {
  const isPositive = useMemo(
    () => change !== undefined && change >= 0,
    [change]
  )

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      className="relative group"
    >
      <div className="glass-card p-6 border border-[var(--border)] transition-all duration-300 hover:shadow-lg hover:border-[var(--primary)]/30">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--muted-foreground)] mb-1">
              {title}
            </p>
          </div>
          {icon && (
            <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 flex items-center justify-center text-[var(--primary)] shadow-sm">
              {icon}
            </div>
          )}
        </div>

        {/* Value */}
        <div className="mb-3">
          <h3 className="text-4xl font-bold text-[var(--foreground)] tracking-tight">
            {value}
          </h3>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          {subtitle && (
            <p className="text-sm text-[var(--muted-foreground)]">
              {subtitle}
            </p>
          )}

          {change !== undefined && (
            <div
              className={`flex items-center gap-1 text-sm font-bold px-2 py-0.5 rounded-full ${isPositive ? 'text-[var(--success)] bg-[var(--success)]/10' : 'text-[var(--danger)] bg-[var(--danger)]/10'
                }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-4 h-4" />
              ) : (
                <ArrowDownRight className="w-4 h-4" />
              )}
              <span>{Math.abs(change)}%</span>
            </div>
          )}
        </div>

        {/* Hover effect glow */}
        <div className="absolute inset-0 rounded-[var(--radius-lg)] shadow-[var(--shadow-glow)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      </div>
    </motion.div>
  )
})
