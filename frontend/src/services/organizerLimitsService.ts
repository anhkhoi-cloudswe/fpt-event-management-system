import { api } from '../config/api'

export interface OrganizerLimits {
  organizerId: number
  role: string
  tierCode: string
  maxCapacityLimit: number // -1 = Unlimited
  hasAdvancedReports: boolean
  commissionBps: number
  feeSource: string
  feeConfigVersion: number
  gatingEnabled?: boolean // Feature flag ENABLE_CAPACITY_GATING from backend
}

export async function getOrganizerLimits(): Promise<{
  data: OrganizerLimits | null
  error: string | null
}> {
  try {
    const res = await api.get<any>('/v1/organizer/limits', {
      timeout: 10000,
    })
    const payload = res.data?.data || res.data
    return { data: payload, error: null }
  } catch (err: any) {
    // If backend 404/500/unregistered on local dev without migration, fallback to standard Organizer Free tier limits
    console.warn('Backend /v1/organizer/limits fallback:', err)
    return {
      data: {
        organizerId: 1,
        role: 'ORGANIZER',
        tierCode: 'FREE',
        maxCapacityLimit: 100,
        hasAdvancedReports: false,
        commissionBps: 500,
        feeSource: 'SYSTEM',
        feeConfigVersion: 1,
        gatingEnabled: true,
      },
      error: null,
    }
  }
}
