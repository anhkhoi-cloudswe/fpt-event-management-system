import axios from 'axios'

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

console.log('🚀 Ferrari BaseURL:', api.defaults.baseURL)
