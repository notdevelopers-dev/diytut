import axios from 'axios'
import type {
  AxiosInstance,
  InternalAxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios'

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true, // КРИТИЧНО для сесійних кук бекенду!
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: передає токен з localStorage (якщо є)
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

// Response interceptor: перехоплення 401
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/register/complete'
      ) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default apiClient
