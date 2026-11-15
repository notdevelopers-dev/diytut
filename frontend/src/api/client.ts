import axios from 'axios'
import type { AxiosInstance, AxiosResponse, AxiosError } from 'axios'

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  // Масиви як ?tags=a&tags=b: так їх читає FastAPI. За замовчуванням Axios шле tags[]=a,
  // і бекенд мовчки ігнорує такий параметр (фільтри каталогу не спрацюють)
  paramsSerializer: { indexes: null },
  headers: {
    'Content-Type': 'application/json',
  },
})

// Обробка помилок відповіді від сервера
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // 401 від /auth/me означає просто «не увійшов», його обробляє AuthContext
    if (error.response?.status === 401 && error.config?.url !== '/auth/me') {
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
