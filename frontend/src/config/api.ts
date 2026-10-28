import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'

// =============================================================================
// API Base URL Strategy:
//
//   LOCAL DEV  → Vite proxy forwards /api/* → http://localhost:8080
//   PRODUCTION → Vercel rewrite (vercel.json) proxies /api/* → Render backend
//
//   In BOTH cases, the frontend uses RELATIVE URLs (/api/...).
//   This avoids cross-origin requests entirely, so no CORS/OPTIONS issues.
// =============================================================================

export const API_BASE_URL = '/api'

export const api = axios

// In-memory access token storage
let accessToken: string | null = null

export const getAccessToken = () => accessToken
export const setInMemoryToken = (token: string | null) => {
	accessToken = token
}
export const setAccessToken = (token: string | null) => {
	setInMemoryToken(token)
}

api.defaults.withCredentials = true
api.defaults.baseURL = API_BASE_URL

// 🚧 Request Interceptor: Guard against duplicated /api prefix & Inject Bearer Token
api.interceptors.request.use((config) => {
	if (config.url?.startsWith('/api')) {
		config.url = config.url.replace(/^\/api/, '')
	}
	if (accessToken) {
		config.headers.Authorization = `Bearer ${accessToken}`
	}
	return config
}, (error) => Promise.reject(error))

type RetriableRequestConfig = InternalAxiosRequestConfig & {
	_retry?: boolean
	isBackgroundRequest?: boolean
}

const refreshClient = axios.create({
	baseURL: API_BASE_URL,
	withCredentials: true,
})

interface FailedRequest {
	resolve: (token: string | null) => void
	reject: (error: any) => void
}

let isRefreshing = false
let failedQueue: FailedRequest[] = []
let lastRefreshFailedAt = 0

const processQueue = (error: any, token: string | null = null) => {
	failedQueue.forEach((prom) => {
		if (error) {
			prom.reject(error)
		} else {
			prom.resolve(token)
		}
	})
	failedQueue = []
}

export const requestTokenRefresh = (): Promise<string> => {
	// Guard against rapid consecutive refresh attempts if refresh just failed (< 10s)
	if (Date.now() - lastRefreshFailedAt < 10000) {
		return Promise.reject(new Error('Recent token refresh failed'))
	}

	if (isRefreshing) {
		return new Promise((resolve, reject) => {
			failedQueue.push({
				resolve: (token) => {
					if (token) resolve(token)
					else reject(new Error('Token refresh failed'))
				},
				reject,
			})
		})
	}

	isRefreshing = true
	window.dispatchEvent(new CustomEvent('auth:refresh-start'))

	return new Promise((resolve, reject) => {
		refreshClient
			.post('/auth/refresh')
			.then((res) => {
				const token = res.data?.accessToken
				if (token) {
					lastRefreshFailedAt = 0
					setInMemoryToken(token)
					processQueue(null, token)
					resolve(token)
				} else {
					const err = new Error('No accessToken in refresh response')
					lastRefreshFailedAt = Date.now()
					processQueue(err, null)
					reject(err)
				}
			})
			.catch((refreshError) => {
				lastRefreshFailedAt = Date.now()
				processQueue(refreshError, null)
				setInMemoryToken(null)
				// Broadcast session expired cleanly so UI logs out without infinite loops
				window.dispatchEvent(new CustomEvent('auth:session-expired'))
				reject(refreshError)
			})
			.finally(() => {
				isRefreshing = false
				window.dispatchEvent(new CustomEvent('auth:refresh-end'))
			})
	})
}

api.interceptors.response.use(
	(response) => response,
	async (error: AxiosError<any>) => {
		if (error.response?.data?.code === 'RECAPTCHA_EXHAUSTED_USE_SSO') {
			window.dispatchEvent(new CustomEvent('auth:recaptcha-exhausted'))
			return Promise.reject(error)
		}

		const originalRequest = error.config as RetriableRequestConfig | undefined
		const requestUrl = String(originalRequest?.url ?? '')
		const isBackground = !!originalRequest?.isBackgroundRequest || !!(originalRequest?.headers as any)?.['isBackgroundRequest']

		if (
			error.response?.status === 401 &&
			originalRequest &&
			!requestUrl.includes('/login')
		) {
			if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/api/auth/refresh') || originalRequest._retry) {
				accessToken = null
				if (!isBackground) {
					window.dispatchEvent(new CustomEvent('auth:session-expired'))
				}
				return Promise.reject(error)
			}

			originalRequest._retry = true

			return requestTokenRefresh()
				.then((token) => {
					originalRequest.headers.Authorization = `Bearer ${token}`
					return api(originalRequest)
				})
				.catch((refreshError) => {
					if (!isBackground) {
						window.dispatchEvent(new CustomEvent('auth:session-expired'))
					}
					return Promise.reject(refreshError)
				})
		}

		return Promise.reject(error)
	},
)

console.log('🚀 Ferrari BaseURL:', api.defaults.baseURL)

// =============================================================================
// Global Fetch Interceptor Strategy:
//
//   1. Injects Authorization: Bearer <token> & credentials: 'include'.
//   2. Handles 401 Unauthorized transparently by executing requestTokenRefresh()
//      and retrying the request seamlessly (solving the AFK / idle student issue).
// =============================================================================

const originalFetch = window.fetch
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	let url = ''
	if (typeof input === 'string') {
		url = input
	} else if (input instanceof URL) {
		url = input.toString()
	} else if (input && typeof input === 'object' && 'url' in input) {
		url = (input as Request).url
	}

	const isApiRequest = url.startsWith('/') || url.includes('/api/')
	const isRefreshRequest = url.includes('/auth/refresh') || url.includes('/api/auth/refresh')
	const isLoginRequest = url.includes('/login') || url.includes('/auth/login')

	let modifiedInit: RequestInit = init ? { ...init } : {}

	if (isApiRequest) {
		if (!modifiedInit.credentials) {
			modifiedInit.credentials = 'include'
		}
		const token = getAccessToken()
		if (token) {
			const headers = new Headers(modifiedInit.headers || {})
			if (!headers.has('Authorization')) {
				headers.set('Authorization', `Bearer ${token}`)
			}
			modifiedInit.headers = headers
		}
	}

	let response = await originalFetch.call(this, input, modifiedInit)

	// If 401 on an API request (and not a refresh/login call), refresh token and retry!
	if (response.status === 401 && isApiRequest && !isRefreshRequest && !isLoginRequest) {
		try {
			const newToken = await requestTokenRefresh()
			if (newToken) {
				const retryHeaders = new Headers(modifiedInit.headers || {})
				retryHeaders.set('Authorization', `Bearer ${newToken}`)
				modifiedInit.headers = retryHeaders

				// Seamlessly retry the request with the refreshed token
				response = await originalFetch.call(this, input, modifiedInit)
			}
		} catch (refreshErr) {
			console.warn('[Fetch Interceptor] Auto-refresh failed after 401:', refreshErr)
			window.dispatchEvent(new CustomEvent('auth:session-expired'))
		}
	}

	return response
}
