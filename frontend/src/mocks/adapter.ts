import { AxiosError } from 'axios'
import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'
import { handleRequest } from './handlers'

const LATENCY_MS = 150

const parseBody = (data: unknown): Record<string, unknown> => {
  if (typeof data !== 'string' || !data) return {}
  try {
    return JSON.parse(data) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Axios-адаптер, що відповідає на запити без мережі й бекенду.
 * Помилкові статуси кидають AxiosError, тож код застосунку (getErrorStatus тощо)
 * працює так само, як із справжнім сервером.
 */
export const mockAdapter: AxiosAdapter = async (
  config: InternalAxiosRequestConfig,
) => {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS))

  const { status, data } = handleRequest(
    config.method ?? 'get',
    config.url ?? '',
    (config.params as Record<string, unknown> | undefined) ?? {},
    parseBody(config.data),
  )

  const response: AxiosResponse = {
    data,
    status,
    statusText: String(status),
    headers: {},
    config,
    request: {},
  }

  if (status >= 200 && status < 300) return response

  throw new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    {},
    response,
  )
}
