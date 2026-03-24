import axios from 'axios'

const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()

export const API_BASE_URL = rawApiUrl && rawApiUrl.length > 0 ? rawApiUrl.replace(/\/$/, '') : '/api'
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
