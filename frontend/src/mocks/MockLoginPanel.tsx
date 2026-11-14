import { MOCK_ACCOUNTS } from './data'
import type { MockAccountId } from './data'
import { resetMockData, signInAs } from './db'

/** Тестовий вхід без Google і бекенду: показується лише в режимі `dev:mock`. */
const MockLoginPanel = () => {
  const handleSignIn = (account: MockAccountId) => {
    signInAs(account)
    // Повне перезавантаження: застосунок заново читає /auth/me з тестової сесії.
    // Новий користувач, як після Google, одразу йде заповнювати анкету
    window.location.assign(account === 'new' ? '/register/complete' : '/')
  }

  const handleReset = () => {
    resetMockData()
    window.location.assign('/login')
  }

  return (
    <div
      data-testid="mock-login-panel"
      className="w-full max-w-[348px] rounded-xl border border-dashed border-info bg-white p-4"
    >
      <p className="mb-1 text-sm font-bold text-black">Тестовий вхід</p>
      <p className="mb-3 text-xs text-black/70">
        Режим без бекенду. Дані вигадані й живуть лише в цій вкладці.
      </p>
      <div className="flex flex-col gap-2">
        {MOCK_ACCOUNTS.map((account) => (
          <button
            key={account.id}
            type="button"
            onClick={() => handleSignIn(account.id)}
            className="cursor-pointer rounded-lg bg-cream px-3 py-2 text-left transition-colors hover:bg-info"
          >
            <span className="block text-sm font-medium text-black">
              {account.label}
            </span>
            <span className="block text-xs text-black/70">
              {account.description}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={handleReset}
        className="mt-3 cursor-pointer text-xs text-black/60 underline hover:text-black"
      >
        Скинути тестові дані
      </button>
    </div>
  )
}

export default MockLoginPanel
