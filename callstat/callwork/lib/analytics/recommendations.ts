export interface RedZone {
  severity: 'critical' | 'warning' | 'ok'
  title: string
  description: string
  current: number
  teamAverage: number
  recommendation: string
  stage: string
}

import { CONVERSION_BENCHMARKS } from '@/lib/config/metrics'

const REDZONE_TOLERANCE = 10 // % допустимое отклонение до критического статуса

interface ConversionsWithTeam {
  bookedToZoom1: number
  zoom1ToZoom2: number
  pushToDeal: number
  teamAverage: {
    bookedToZoom1: number
    zoom1ToZoom2: number
    pushToDeal: number
  }
}

export function analyzeRedZones(conversions: ConversionsWithTeam): RedZone[] {
  const zones: RedZone[] = []
  const { teamAverage } = conversions
  
  if (conversions.bookedToZoom1 < CONVERSION_BENCHMARKS.BOOKED_TO_ZOOM1) {
    zones.push({
      severity: conversions.bookedToZoom1 < CONVERSION_BENCHMARKS.BOOKED_TO_ZOOM1 - REDZONE_TOLERANCE ? 'critical' : 'warning',
      stage: 'zoom1',
      title: 'Низкая явка на 1-й Zoom',
      description: 'Много записанных клиентов не доходят до первой встречи',
      current: conversions.bookedToZoom1,
      teamAverage: teamAverage.bookedToZoom1,
      recommendation: 'Работать над подтверждением встреч и напоминаниями за 2-3 часа до слота.'
    })
  }
  
  if (conversions.zoom1ToZoom2 < CONVERSION_BENCHMARKS.ZOOM1_TO_ZOOM2) {
    zones.push({
      severity: conversions.zoom1ToZoom2 < CONVERSION_BENCHMARKS.ZOOM1_TO_ZOOM2 - REDZONE_TOLERANCE ? 'critical' : 'warning',
      stage: 'zoom2',
      title: 'Мало переходов 1-й → 2-й Zoom',
      description: 'Клиенты не переходят на вторичную встречу после первой',
      current: conversions.zoom1ToZoom2,
      teamAverage: teamAverage.zoom1ToZoom2,
      recommendation: 'Улучшить первую встречу: фиксировать ценность и назначать следующий шаг в календарь.'
    })
  }
  
  if (conversions.pushToDeal < CONVERSION_BENCHMARKS.PUSH_TO_DEAL) {
    zones.push({
      severity: conversions.pushToDeal < CONVERSION_BENCHMARKS.PUSH_TO_DEAL - REDZONE_TOLERANCE ? 'critical' : 'warning',
      stage: 'push_to_deal',
      title: 'Проседание на финальном закрытии',
      description: 'Клиенты доходят до дожима, но оплаты нет',
      current: conversions.pushToDeal,
      teamAverage: teamAverage.pushToDeal,
      recommendation: 'Проверьте работу с возражениями после договора, добавьте дедлайны и ограниченные офферы.'
    })
  }
  
  return zones
}

export function getSeverityColor(severity: RedZone['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-50 border-red-200'
    case 'warning':
      return 'bg-yellow-50 border-yellow-200'
    case 'ok':
      return 'bg-green-50 border-green-200'
  }
}

export function getSeverityIcon(severity: RedZone['severity']): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500 text-white'
    case 'warning':
      return 'bg-yellow-500 text-white'
    case 'ok':
      return 'bg-green-500 text-white'
  }
}
