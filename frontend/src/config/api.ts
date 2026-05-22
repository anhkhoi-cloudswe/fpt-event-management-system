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

// 🌐 Patch window.fetch to automatically rewrite relative /api calls to use API_BASE_URL
const originalFetch = window.fetch
;(window as any).fetch = function (this: any, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return originalFetch.call(this, input, init)
    }

    if (API_BASE_URL.startsWith('http')) {
      // For absolute API_BASE_URL (production)
      const stripped = input.startsWith('/api') ? input.replace(/^\/api/, '') : input
      const newUrl = `${API_BASE_URL}${stripped.startsWith('/') ? '' : '/'}${stripped}`
      return originalFetch.call(this, newUrl, init)
    } else {
      // For relative API_BASE_URL (local dev proxy)
      if (input.startsWith(API_BASE_URL)) {
        return originalFetch.call(this, input, init)
      }
      const newUrl = `${API_BASE_URL}${input.startsWith('/') ? '' : '/'}${input}`
      return originalFetch.call(this, newUrl, init)
    }
  } else if (input instanceof URL) {
    const urlString = input.toString()
    if (urlString.startsWith(window.location.origin)) {
      const relativePath = urlString.substring(window.location.origin.length)
      if (API_BASE_URL.startsWith('http')) {
        const stripped = relativePath.startsWith('/api') ? relativePath.replace(/^\/api/, '') : relativePath
        const newUrl = `${API_BASE_URL}${stripped.startsWith('/') ? '' : '/'}${stripped}`
        return originalFetch.call(this, newUrl, init)
      } else {
        if (!relativePath.startsWith(API_BASE_URL)) {
          const newUrl = `${API_BASE_URL}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`
          return originalFetch.call(this, newUrl, init)
        }
      }
    }
  } else if (input instanceof Request) {
    const urlString = input.url
    if (!urlString.startsWith('http://') && !urlString.startsWith('https://') || urlString.startsWith(window.location.origin)) {
      const relativePath = urlString.startsWith(window.location.origin) 
        ? urlString.substring(window.location.origin.length) 
        : urlString
      
      let newUrl = urlString
      if (API_BASE_URL.startsWith('http')) {
        const stripped = relativePath.startsWith('/api') ? relativePath.replace(/^\/api/, '') : relativePath
        newUrl = `${API_BASE_URL}${stripped.startsWith('/') ? '' : '/'}${stripped}`
      } else {
        if (!relativePath.startsWith(API_BASE_URL)) {
          newUrl = `${API_BASE_URL}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`
        }
      }
      const newRequest = new Request(newUrl, input)
      return originalFetch.call(this, newRequest, init)
    }
  }
  return originalFetch.call(this, input, init)
}

console.log('🚀 Ferrari BaseURL:', api.defaults.baseURL)

