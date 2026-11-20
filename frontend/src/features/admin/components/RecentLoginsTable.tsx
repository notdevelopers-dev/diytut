import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRecentLogins } from '../hooks'
import type { LoginEvent } from '../types'

const PAGE_SIZE = 10

// Дні статистики бекенд рахує за київським часом, тож і час входу показуємо за ним
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const userName = (user: NonNullable<LoginEvent['user']>) =>
  [user.first_name, user.last_name].filter(Boolean).join(' ')

/** Останні входи з GET /admin/logins, по сторінці за раз */
export const RecentLoginsTable: React.FC = () => {
  const [page, setPage] = useState(1)
  const { data, isPending, isError, isPlaceholderData } = useRecentLogins(
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  )

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const startIndex = (page - 1) * PAGE_SIZE

  return (
    <div className="rounded-lg border border-[#79B7FF] bg-white p-3">
      <div className="mb-2 text-sm font-bold">Останні авторизації</div>
      {/* RootLayout обрізає горизонтальне переповнення, тож таблиця прокручується сама */}
      <div className="overflow-x-auto">
        <table
          className={`w-full border-collapse text-left text-xs transition-opacity ${
            isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
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
            {isPending && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-[#8B99AA]"
                >
                  Завантаження...
                </td>
              </tr>
            )}
            {isError && !data && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center font-bold text-[#E14848]"
                >
                  Не вдалося завантажити входи
                </td>
              </tr>
            )}
            {data && items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center font-bold text-[#8B99AA]"
                >
                  Входів ще не було
                </td>
              </tr>
            )}
            {items.map((login) => (
              <tr key={login.id} className="border-t border-[#DCECFF]">
                <td className="px-3 py-2">
                  {login.user ? (
                    <>
                      <div className="font-bold">{userName(login.user)}</div>
                      <div>{login.user.email}</div>
                    </>
                  ) : (
                    <span className="text-[#8B99AA]">Акаунт видалено</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {login.user
                    ? login.user.platform_role === 'admin'
                      ? 'Адміністратор'
                      : 'Користувач'
                    : '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatDateTime(login.created_at)}
                </td>
                <td className="px-3 py-2">{login.ip ?? '—'}</td>
                <td className="px-3 py-2">
                  {/* Бекенд записує лише успішні входи (див. backend/README.md) */}
                  <span className="rounded-full bg-[#B5F291] px-3 py-0.5 font-bold">
                    Успішно
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#8B99AA]">
        <span>
          {total === 0
            ? 'Показано 0 з 0'
            : `Показано ${startIndex + 1}-${startIndex + items.length} з ${total}`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            aria-label="Попередня сторінка входів"
            className="flex h-6 w-9 items-center justify-center rounded bg-[#79B7FF] text-black disabled:cursor-not-allowed disabled:bg-[#C2D4EA]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages || isPlaceholderData}
            aria-label="Наступна сторінка входів"
            className="flex h-6 w-9 items-center justify-center rounded bg-[#79B7FF] text-black disabled:cursor-not-allowed disabled:bg-[#C2D4EA]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default RecentLoginsTable
