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
					window.location.href = '/guest'
				}
				return Promise.reject(error)
			}

			if (isRefreshing) {
				return new Promise((resolve, reject) => {
					failedQueue.push({
						resolve: (token) => {
							originalRequest.headers.Authorization = `Bearer ${token}`
							resolve(api(originalRequest))
						},
						reject: (err) => {
							reject(err)
						}
					})
				})
			}

			originalRequest._retry = true
			isRefreshing = true
			window.dispatchEvent(new CustomEvent('auth:refresh-start'))

			return new Promise((resolve, reject) => {
				refreshClient.post('/auth/refresh')
					.then((res) => {
						const token = res.data?.accessToken
						setInMemoryToken(token)
						originalRequest.headers.Authorization = `Bearer ${token}`
						processQueue(null, token)
						resolve(api(originalRequest))
					})
					.catch((refreshError) => {
						processQueue(refreshError, null)
						setInMemoryToken(null)
						window.dispatchEvent(new CustomEvent('auth:session-expired'))
						if (!isBackground) {
							window.location.href = '/guest'
						}
						reject(refreshError)
					})
					.finally(() => {
						isRefreshing = false
						window.dispatchEvent(new CustomEvent('auth:refresh-end'))
					})
			})
		}

		return Promise.reject(error)
	},
)

console.log('🚀 Ferrari BaseURL:', api.defaults.baseURL)

// =============================================================================
// Global Fetch Interceptor Strategy:
//
//   Since access tokens are stored strictly in-memory, raw browser fetch() calls
//   (used extensively in legacy pages) would fail with 401. This monkey-patches
//   window.fetch to inject the Authorization Bearer header to any relative or
//   API-bound requests when an access token is active in memory.
// =============================================================================

const originalFetch = window.fetch
window.fetch = async function (input, init) {
	const token = getAccessToken()
	if (token) {
		let url = ''
		if (typeof input === 'string') {
			url = input
		} else if (input instanceof URL) {
			url = input.toString()
		} else if (input && typeof input === 'object' && 'url' in input) {
			url = (input as Request).url
		}

		// Inject only for relative API paths or explicit API endpoints on the same origin
		const isApiRequest = url.startsWith('/') || url.includes('/api/')
		if (isApiRequest) {
			init = init || {}
			const headers = new Headers(init.headers || {})
			if (!headers.has('Authorization')) {
				headers.set('Authorization', `Bearer ${token}`)
			}
			init.headers = headers
		}
	}
	return originalFetch.call(this, input, init)
}
