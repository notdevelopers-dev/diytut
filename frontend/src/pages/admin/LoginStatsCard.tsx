import React, { useEffect, useState } from 'react'
import { apiClient } from '../../api/client'

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

export const LoginStatsCard: React.FC = () => {
  const [stats, setStats] = useState<LoginStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let isCancelled = false
    apiClient
      .get<LoginStats>('/admin/stats/logins')
      .then((response) => {
        if (!isCancelled) setStats(response.data)
      })
      .catch((error: unknown) => {
        console.error('Не вдалося завантажити статистику входів:', error)
        if (!isCancelled) setHasError(true)
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false)
      })
    return () => {
      isCancelled = true
    }
  }, [])

  const maxLogins = stats ? Math.max(1, ...stats.days.map((d) => d.logins)) : 1

  return (
    <section className="mb-6 rounded-xl border border-[#DCECFF] bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-bold">Статистика входів на сайт</h2>

      {isLoading && <p className="text-sm text-[#8B99AA]">Завантаження...</p>}

      {hasError && (
        <p className="text-sm font-bold text-[#E14848]">
          Не вдалося завантажити статистику
        </p>
      )}

      {stats && (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="rounded-lg border-2 border-[#79B7FF] bg-[#DCECFF] px-4 py-2">
              <div className="text-xs text-[#8B99AA]">Усього входів</div>
              <div className="text-2xl font-bold">{stats.total_logins}</div>
            </div>
            <div className="rounded-lg border-2 border-[#B5F291] bg-[#F7FBFF] px-4 py-2">
              <div className="text-xs text-[#8B99AA]">
                Унікальних користувачів
              </div>
              <div className="text-2xl font-bold">{stats.unique_users}</div>
            </div>
            <div className="rounded-lg border-2 border-[#F1D387] bg-[#F7FBFF] px-4 py-2">
              <div className="text-xs text-[#8B99AA]">Період</div>
              <div className="text-sm font-bold">
                {stats.date_from} — {stats.date_to}
              </div>
            </div>
          </div>

          {/* Стовпчики по днях */}
          <div className="flex h-24 items-end gap-1">
            {stats.days.map((day) => (
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
        </>
      )}
    </section>
  )
}

export default LoginStatsCard
