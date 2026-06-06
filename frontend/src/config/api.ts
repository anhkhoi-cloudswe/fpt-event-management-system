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
export const setAccessToken = (token: string | null) => {
	accessToken = token
}

api.defaults.withCredentials = true
api.defaults.baseURL = API_BASE_URL

// 🚧 Request Interceptor: Guard against duplicated /api prefix & Inject Bearer Token
api.interceptors.request.use((config) => {
	if (config.url?.startsWith('/api')) {
		config.url = config.url.replace(/^\/api/, '')
	}
	const token = getAccessToken()
	if (token) {
		config.headers.Authorization = `Bearer ${token}`
	}
	return config
})

type RetriableRequestConfig = InternalAxiosRequestConfig & {
	_retry?: boolean
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

		if (
			error.response?.status === 401 &&
			originalRequest &&
			!requestUrl.includes('/login')
		) {
			if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/api/auth/refresh') || originalRequest._retry) {
				accessToken = null
				window.location.href = '/guest'
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

			return new Promise((resolve, reject) => {
				refreshClient.post('/auth/refresh')
					.then((res) => {
						const token = res.data?.accessToken
						setAccessToken(token)
						originalRequest.headers.Authorization = `Bearer ${token}`
						processQueue(null, token)
						resolve(api(originalRequest))
					})
					.catch((refreshError) => {
						processQueue(refreshError, null)
						setAccessToken(null)
						window.dispatchEvent(new CustomEvent('auth:session-expired'))
						window.location.href = '/guest'
						reject(refreshError)
					})
					.finally(() => {
						isRefreshing = false
					})
			})
		}

		return Promise.reject(error)
	},
)

console.log('🚀 Ferrari BaseURL:', api.defaults.baseURL)
