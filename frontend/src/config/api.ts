const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()

export const API_BASE_URL = rawApiUrl && rawApiUrl.length > 0 ? rawApiUrl.replace(/\/$/, '') : '/api'
