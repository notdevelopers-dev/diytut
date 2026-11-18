import React, { useState } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  FileText,
  MessageSquare,
  Settings,
  TrendingUp,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { LoginStatsSection } from './LoginStatsSection'
import { OrgRequestsSection } from './OrgRequestsSection'
import { SupportChatSection } from './SupportChatSection'

type SectionKey = 'stats' | 'requests' | 'chat' | 'settings'

const NAV_ITEMS: { key: SectionKey; label: string; icon: LucideIcon }[] = [
  { key: 'stats', label: 'Статистика входів', icon: TrendingUp },
  { key: 'requests', label: 'Запити організацій', icon: FileText },
  { key: 'chat', label: 'Чат підтримки', icon: MessageSquare },
  { key: 'settings', label: 'Налаштування', icon: Settings },
]

export const AdminPage: React.FC = () => {
  const { user } = useAuth()
  const [section, setSection] = useState<SectionKey>('stats')
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="flex min-h-screen gap-4 bg-[#F7FBFF] p-4 font-sans text-black">
      {/* Бічна панель */}
      <aside
        className={`flex shrink-0 flex-col rounded-2xl border border-[#DCECFF] bg-[#F7FBFF] p-3 transition-all ${
          isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          {!isCollapsed && (
            <span className="rounded-lg bg-[#F1D387]/60 px-3 py-1 text-lg font-bold">
              Адмін панель
            </span>
          )}
          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-label={isCollapsed ? 'Розгорнути меню' : 'Згорнути меню'}
            className="flex h-7 w-9 items-center justify-center rounded-md bg-[#79B7FF] text-black"
          >
            {isCollapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-3">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              title={label}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold shadow-md transition ${
                section === key
                  ? 'bg-[#79B7FF]'
                  : 'bg-[#DCECFF] hover:bg-[#79B7FF]/50'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span>{label}</span>}
            </button>
          ))}
        </nav>

        {/* Профіль адміна */}
        <div className="mt-4 flex items-center gap-3 border-t border-[#DCECFF] pt-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#79B7FF]">
            <User className="h-6 w-6 text-white" />
          </div>
          {!isCollapsed && (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate rounded-full border border-[#DCECFF] bg-white px-3 py-0.5 text-center text-xs font-bold">
                {user?.name ?? 'Ім’я Прізвище'}
              </span>
              <span className="rounded-full border border-[#79B7FF] bg-[#DCECFF] px-3 py-0.5 text-center text-xs font-bold text-[#79B7FF]">
                Адміністратор
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Вміст розділу */}
      <main className="min-w-0 flex-1">
        {section === 'stats' && <LoginStatsSection />}
        {section === 'requests' && <OrgRequestsSection />}
        {section === 'chat' && <SupportChatSection />}
        {section === 'settings' && (
          <div>
            <h1 className="mb-6 inline-block rounded-lg bg-[#F1D387] px-4 py-2 text-xl font-bold shadow-sm">
              Налаштування
            </h1>
            <p className="text-sm text-[#8B99AA]">Розділ у розробці.</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default AdminPage
