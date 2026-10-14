import { FrontendConfigData } from '../types/frontendConfig'

export const frontendConfigService = {
  // Lấy cấu hình frontend hiện tại (public)
  getConfig: async (): Promise<FrontendConfigData> => {
    const res = await fetch('/api/events/frontend-config', {
      headers: {
        'ngrok-skip-browser-warning': '1',
      },
      credentials: 'include',
    })
    if (!res.ok) {
      throw new Error('Failed to fetch frontend config')
    }
    return res.json()
  },

  // Cập nhật cấu hình frontend (ADMIN only)
  updateConfig: async (config: FrontendConfigData): Promise<FrontendConfigData> => {
    const res = await fetch('/api/events/frontend-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1',
      },
      credentials: 'include',
      body: JSON.stringify(config),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || 'Failed to update frontend config')
    }
    const data = await res.json()
    return data.data || config
  },
}
