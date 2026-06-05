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

api.defaults.withCredentials = true
api.defaults.baseURL = API_BASE_URL

// 🚧 Request Interceptor: Guard against duplicated /api prefix (Hàng rào bảo vệ)
api.interceptors.request.use((config) => {
	if (config.url?.startsWith('/api')) {
		config.url = config.url.replace(/^\/api/, '')
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

let refreshPromise: Promise<unknown> | null = null

const showSessionExpiredModal = () => {
	const message = 'Phi\u00ean \u0111\u0103ng nh\u1eadp \u0111\u00e3 h\u1ebft h\u1ea1n, vui l\u00f2ng \u0111\u0103ng nh\u1eadp l\u1ea1i \u0111\u1ec3 b\u1ea3o m\u1eadt d\u1eef li\u1ec7u'

	if (document.getElementById('session-expired-overlay')) {
		return
	}

	const overlay = document.createElement('div')
	overlay.id = 'session-expired-overlay'
	overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.72);padding:24px'

	const modal = document.createElement('div')
	modal.style.cssText = 'max-width:420px;width:100%;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,0.35);padding:24px;text-align:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a'

	const text = document.createElement('p')
	text.textContent = message
	text.style.cssText = 'margin:0 0 18px;font-size:15px;line-height:1.55;font-weight:600'

	const button = document.createElement('button')
	button.textContent = 'OK'
	button.style.cssText = 'border:0;border-radius:10px;background:#ea580c;color:#fff;font-weight:700;font-size:14px;padding:10px 18px;cursor:pointer'
	button.onclick = () => {
		window.location.href = '/login'
	}

	modal.appendChild(text)
	modal.appendChild(button)
	overlay.appendChild(modal)
	document.body.appendChild(overlay)
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
			!originalRequest._retry &&
			!requestUrl.includes('/auth/refresh') &&
			!requestUrl.includes('/login')
		) {
			originalRequest._retry = true
			try {
				refreshPromise ??= refreshClient.post('/auth/refresh')
				await refreshPromise
				return api(originalRequest)
			} catch (refreshError) {
				showSessionExpiredModal()
				return Promise.reject(refreshError)
			} finally {
				refreshPromise = null
			}
		}

		return Promise.reject(error)
	},
)

console.log('🚀 Ferrari BaseURL:', api.defaults.baseURL)
