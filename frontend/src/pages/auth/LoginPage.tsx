import { Logo } from '../../components/ui/Logo'

export const LoginPage = () => {
  const handleGoogleSignIn = () => {
    // Бекенд веде на Google і після входу ставить httpOnly cookie сесії
    window.location.href = '/api/auth/google/login'
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-between bg-[#F7FBFF] overflow-x-hidden">
      {/* Верхня частина: Логотип і стрічка "Реєстрація" */}
      <div className="w-full">
        <div className="px-8 pt-6 pb-4">
          <Logo />
        </div>

        <div className="flex h-16 w-full items-center justify-center border-y border-info bg-cream">
          <h1 className="m-0 text-3xl font-normal text-black md:text-5xl font-head">
            Реєстрація
          </h1>
        </div>
      </div>

      {/* Центральна частина: Кнопка "Продовжити через Google" */}
      <div className="my-auto flex w-full flex-col items-center justify-center px-4 py-12">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex h-16 w-full max-w-[348px] cursor-pointer items-center justify-center gap-3.5 rounded-xl border-none bg-[#DCECFF] px-4 shadow-[0px_3px_4px_0px_rgba(26,44,74,0.25)] transition-all hover:bg-[#cde2fe] active:scale-[0.98]"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
            <svg width="34" height="34" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
          </div>
          <span className="text-base font-normal text-black">
            Продовжити через Google
          </span>
        </button>
      </div>

      {/* Нижня декоративна смужка */}
      <div className="h-14 w-full bg-[#DCECFF] border-t-2 border-info" />
    </div>
  )
}

export default LoginPage
