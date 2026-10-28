import axios from 'axios'
import type {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

/**
 * Головний HTTP-клієнт для взаємодії з бекендом «ДійТут».
 *
 * Особливості для розробників команди:
 * 1. Базовий шлях: '/api'. Усі запити пишіть відносно, наприклад:
 *    `apiClient.get('/initiatives')` або `apiClient.post('/auth/login', data)`
 *    (домен і порт підставляє проксі Vite у dev та nginx у prod).
 * 2. Авторизація: інтерцептор автоматично зчитує токен з localStorage ('token')
 *    та додає заголовок 'Authorization: Bearer <token>'.
 * 3. Перехоплення помилок: статус 401 перехоплюється для централізованої обробки.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: автоматичне додавання JWT токена до кожного запиту
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  },
)

// Response interceptor: централізоване логування та обробка відповідей (401 Unauthorized)
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      console.warn('Unauthorized: сесія недійсна або термін дії токена минув.')
    }
    return Promise.reject(error)
  },
)

export default apiClient
