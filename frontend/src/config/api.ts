import axios from 'axios'

// Prefer VITE_API_BASE_URL (used on Vercel), fallback to VITE_API_URL, then relative '/api'
const rawApiUrl = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined)
)?.trim()

export const API_BASE_URL = (() => {
  if (!rawApiUrl) return '/api'
  
  const cleanUrl = rawApiUrl.replace(/\/$/, '')
  // If it's an absolute URL (production/local API server) and doesn't end with /api, append /api
  if (cleanUrl.startsWith('http') && !cleanUrl.endsWith('/api')) {
    return `${cleanUrl}/api`
  }
  return cleanUrl
})()

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

// 🌐 Patch window.fetch to automatically prepend VITE_API_BASE_URL on production
const originalFetch = window.fetch;

window.fetch = async (input, init) => {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Lấy API Base URL từ Vercel (https://fpt-event-gateway.onrender.com)
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

  // NẾU URL truyền vào là đường dẫn tương đối bắt đầu bằng /api/
  if (url.startsWith('/api/')) {
    // Chỉ đơn giản là nối Base URL vào phía trước, GIỮ NGUYÊN TOÀN BỘ CÁC CHỮ PHÍA SAU
    // Không dùng regex, không dùng replace để tránh nuốt mất /v1/auth
    url = `${baseUrl.replace(/\/$/, '')}${url}`;
  }

  if (typeof input === 'string') {
    input = url;
  } else if (input instanceof URL) {
    input = new URL(url);
  } else {
    input = new Request(url, input);
  }

  return originalFetch(input, init);
};

console.log('🚀 Ferrari BaseURL:', api.defaults.baseURL)

