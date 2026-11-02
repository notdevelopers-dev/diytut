import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const LoginPage = () => {
  const { login } = useAuth()
  const navigate = useNavigate()

  // 1. Генерація випадкового нікнейма за замовчуванням: volunteer_XXXX
  const generateRandomNickname = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000)
    return `volunteer_${randomDigits}`
  }

  // 2. Логіка кліку на кнопку Google
  const handleGoogleSignIn = () => {
    const mockToken = `google_jwt_${Date.now()}`

    // Імітуємо отримання профілю від Google:
    // Підтягуються ім'я та пошта, генерується нікнейм, стать за замовчуванням 'prefer_not_to_tell',
    // а статус isProfileComplete: false (анкета ще не завершена)
    const googleUserData = {
      name: 'Олена Коваленко',
      firstName: 'Олена',
      lastName: 'Коваленко',
      nickname: generateRandomNickname(),
      email: 'olena.kovalenko@gmail.com',
      gender: 'prefer_not_to_tell' as const,
    }

    login(mockToken, 'volunteer', false, googleUserData)

    // Перенаправляємо на форму дозаповнення анкети
    navigate('/register/complete', { replace: true })
  }

  return (
    <div className="flex min-h-[calc(100dvh-130px)] w-full flex-col items-center bg-page">
      {/* Верхня бежева плашка "Реєстрація" за макетом із Figma */}
      <div className="flex h-16 w-full items-center justify-center border-b border-[#F1D387] bg-[#F5E6BF] px-4">
        <h1 className="m-0 text-3xl font-normal text-black md:text-5xl font-['e-Ukraine_Head',sans-serif]">
          Реєстрація
        </h1>
      </div>

      {/* Центральна область: тільки кнопка "Продовжити через Google" */}
      <div className="flex flex-1 w-full max-w-md flex-col items-center justify-center p-6">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex h-[67px] w-full max-w-[348px] cursor-pointer items-center gap-3.5 rounded-[11px] border-none bg-[#DCECFF] px-3 shadow-[0px_3px_4px_rgba(26,44,74,0.25)] transition-all hover:bg-[#cde2fe] active:scale-[0.98]"
        >
          {/* Векторний SVG-логотип Google з макета */}
          <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 48 48">
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
          <span className="text-base font-normal text-black font-['e-Ukraine',sans-serif]">
            Продовжити через Google
          </span>
        </button>
      </div>
    </div>
  )
}

export default LoginPage