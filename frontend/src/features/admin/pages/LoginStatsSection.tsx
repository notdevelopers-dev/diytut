import React, { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

interface DailyLogins {
  date: string
  logins: number
  unique_users: number
}

interface LoginStats {
  date_from: string
  date_to: string
  total_logins: number
  unique_users: number
  days: DailyLogins[]
}

type Period = 'today' | '7d' | '30d'

interface Result {
  period: Period
  current: LoginStats | null
  previous: LoginStats | null
}

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: 'today', label: 'Сьогодні', days: 1 },
  { key: '7d', label: '7 днів', days: 7 },
  { key: '30d', label: '30 днів', days: 30 },
]

const WEEKDAYS = [
  'Неділя',
  'Понеділок',
  'Вівторок',
  'Середа',
  'Четвер',
  'П’ятниця',
  'Субота',
]

// Демо-дані: ендпоінта «останні авторизації» на бекенді поки немає
const RECENT_LOGINS = [
  {
    user: 'user1@example.com',
    role: 'Користувач',
    at: '11.11.2026, 12:45',
    ip: '192.168.1.54',
    ok: true,
  },
  {
    user: 'user2@example.com',
    role: 'Представник ГО',
    at: '10.11.2026, 14:00',
    ip: '192.168.1.54',
    ok: true,
  },
  {
    user: 'user3@example.com',
    role: 'Адміністратор',
    at: '09.01.2026, 23:59',
    ip: '192.168.1.54',
    ok: false,
  },
]

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const addDays = (d: Date, n: number) => {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

const getDelta = (current: number, previous: number | undefined) => {
  if (previous === undefined) return null
  if (previous === 0) {
    return current === 0
      ? { text: '0% до попереднього періоду', isUp: true }
      : { text: 'нова активність', isUp: true }
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  return {
    text: `${pct > 0 ? '+' : ''}${pct}% до попереднього періоду`,
    isUp: pct >= 0,
  }
}

const getPeakDays = (days: DailyLogins[]) => {
  const totals: number[] = Array<number>(7).fill(0)
  days.forEach((d) => {
    totals[new Date(`${d.date}T00:00:00`).getDay()] += d.logins
  })
  const max = Math.max(...totals)
  if (max === 0) return null
  return totals
    .map((total, index) => ({ total, index }))
    .filter((x) => x.total === max)
    .map((x) => WEEKDAYS[x.index])
    .join(' та ')
}

interface StatCardProps {
  title: string
  value: string
  badge: { text: string; isUp: boolean } | null
}

const StatCard: React.FC<StatCardProps> = ({ title, value, badge }) => (
  <div className="rounded-lg border border-[#79B7FF] bg-white p-3">
    <div className="mb-2 text-sm font-bold">{title}</div>
    <div className="mb-2 rounded-md bg-[#DCECFF] py-3 text-center text-2xl font-bold">
      {value}
    </div>
    {badge && (
      <div
        className={`rounded-full px-3 py-1 text-center text-xs font-bold ${
          badge.isUp ? 'bg-[#B5F291]' : 'bg-[#E14848] text-white'
        }`}
      >
        {badge.text}
      </div>
    )}
  </div>
)

export const LoginStatsSection: React.FC = () => {
  const [period, setPeriod] = useState<Period>('30d')
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    let isCancelled = false
    const days = PERIODS.find((p) => p.key === period)?.days ?? 30
    const today = new Date()
    const from = addDays(today, -(days - 1))
    const prevTo = addDays(from, -1)
    const prevFrom = addDays(prevTo, -(days - 1))

    void Promise.allSettled([
      apiClient.get<LoginStats>('/admin/stats/logins', {
        params: { date_from: toIso(from), date_to: toIso(today) },
      }),
      apiClient.get<LoginStats>('/admin/stats/logins', {
        params: { date_from: toIso(prevFrom), date_to: toIso(prevTo) },
      }),
    ]).then(([cur, prev]) => {
      if (isCancelled) return
      setResult({
        period,
        current: cur.status === 'fulfilled' ? cur.value.data : null,
        previous: prev.status === 'fulfilled' ? prev.value.data : null,
      })
    })

    return () => {
      isCancelled = true
    }
  }, [period])

  const isLoading = result?.period !== period
  const current = isLoading ? null : (result?.current ?? null)
  const previous = isLoading ? null : (result?.previous ?? null)
  const hasError = !isLoading && current === null

  const maxLogins = current
    ? Math.max(1, ...current.days.map((d) => d.logins))
    : 1
  const peak = current ? getPeakDays(current.days) : null

  const exportCsv = () => {
    if (!current) return
    const rows = [
      'date,logins,unique_users',
      ...current.days.map((d) => `${d.date},${d.logins},${d.unique_users}`),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `login-stats_${current.date_from}_${current.date_to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Заголовок і періоди */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="rounded-lg bg-[#F1D387] px-4 py-2 text-xl font-bold shadow-sm">
          Статистика
        </h1>
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-xl border border-[#79B7FF] px-4 py-2 text-sm font-bold transition ${
              period === p.key
                ? 'bg-[#79B7FF] shadow-md'
                : 'bg-[#DCECFF] hover:bg-[#79B7FF]/50'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={exportCsv}
          disabled={!current}
          aria-label="Експортувати у CSV"
          className="flex h-10 w-12 items-center justify-center rounded-xl bg-[#79B7FF] shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[#C2D4EA]"
        >
          <Download className="h-5 w-5" />
        </button>
      </div>

      {isLoading && <p className="text-sm text-[#8B99AA]">Завантаження...</p>}
      {hasError && (
        <p className="text-sm font-bold text-[#E14848]">
          Не вдалося завантажити статистику
        </p>
      )}

      {current && (
        <>
          {/* Картки */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              title="Загальна кількість входів"
              value={String(current.total_logins)}
              badge={getDelta(current.total_logins, previous?.total_logins)}
            />
            <StatCard
              title="Унікальні користувачі"
              value={String(current.unique_users)}
              badge={getDelta(current.unique_users, previous?.unique_users)}
            />
            <StatCard
              title="Пікова активність"
              value={peak ?? '—'}
              badge={null}
            />
          </div>

          {/* Графік по днях */}
          <div className="mb-6 rounded-lg border border-[#DCECFF] bg-white p-4">
            <div className="mb-3 text-sm font-bold">
              Входи по днях ({current.date_from} — {current.date_to})
            </div>
            <div className="flex h-28 items-end gap-1">
              {current.days.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: входів ${day.logins}, унікальних ${day.unique_users}`}
                  className="flex-1 rounded-t bg-[#79B7FF]"
                  style={{
                    height: `${(day.logins / maxLogins) * 100}%`,
                    minHeight: day.logins > 0 ? '4px' : '2px',
                    opacity: day.logins > 0 ? 1 : 0.25,
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Останні авторизації */}
      <div className="rounded-lg border border-[#79B7FF] bg-white p-3">
        <div className="mb-2 text-sm font-bold">Останні авторизації</div>
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#F1D387]/60 font-bold">
              <th className="px-3 py-2">Користувач</th>
              <th className="px-3 py-2">Роль</th>
              <th className="px-3 py-2">Дата і Час</th>
              <th className="px-3 py-2">IP-адреса</th>
              <th className="px-3 py-2">Статус</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_LOGINS.map((row) => (
              <tr key={row.user} className="border-t border-[#DCECFF]">
                <td className="px-3 py-2">{row.user}</td>
                <td className="px-3 py-2">{row.role}</td>
                <td className="px-3 py-2">{row.at}</td>
                <td className="px-3 py-2">{row.ip}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-3 py-0.5 font-bold ${
                      row.ok ? 'bg-[#B5F291]' : 'bg-[#E14848] text-white'
                    }`}
                  >
                    {row.ok ? 'Успішно' : 'Помилка'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-xs text-[#8B99AA]">
          Показано 1-{RECENT_LOGINS.length} з {RECENT_LOGINS.length}
        </div>
      </div>
    </div>
  )
}

export default LoginStatsSection
